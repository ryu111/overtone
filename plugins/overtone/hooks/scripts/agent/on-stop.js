#!/usr/bin/env node
'use strict';
/**
 * SubagentStop hook — 記錄 agent 結果 + 提示下一步 + 寫 state + emit timeline
 *
 * 觸發：每個 subagent（Task）結束時
 * 職責：
 *   ✅ 記錄結果到 workflow.json + timeline.jsonl
 *   ✅ 偵測 FAIL/REJECT 並遞增計數器
 *   ✅ 並行群組收斂偵測
 *   ✅ 提示 Main Agent 下一步
 */

const { readFileSync, statSync } = require('fs');
const { readState, updateStateAtomic, findActualStageKey, checkParallelConvergence, getNextStageHint } = require('../../../scripts/lib/state');
const timeline = require('../../../scripts/lib/timeline');
const instinct = require('../../../scripts/lib/instinct');
const { stages, workflows, parallelGroups, retryDefaults } = require('../../../scripts/lib/registry');
const paths = require('../../../scripts/lib/paths');
const parseResult = require('../../../scripts/lib/parse-result');
const { safeReadStdin, safeRun, getSessionId } = require('../../../scripts/lib/hook-utils');
const { formatSize } = require('../../../scripts/lib/utils');

// ── 主流程（只在直接執行時觸發，require 時不執行）──
if (require.main === module) {
safeRun(() => {
  // ── 從 stdin 讀取 hook input ──

  const input = safeReadStdin();
  const sessionId = getSessionId(input);
  const projectRoot = input.cwd || process.cwd();

  // 取得 agent 資訊
  // Claude Code SubagentStop 傳 agent_type（如 "ot:developer"），需剝除 "ot:" 前綴
  const rawAgentType = (input.agent_type || '').trim();
  const agentName = rawAgentType.startsWith('ot:') ? rawAgentType.slice(3) : rawAgentType;
  const agentOutput = (input.last_assistant_message || '').trim();

  // 無 session 或無 agent 名稱 → 跳過
  if (!sessionId || !agentName) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // ── 清除 active agent 追蹤（workflow 無關，所有 agent 都清除）──
  try {
    const { unlinkSync } = require('fs');
    unlinkSync(paths.session.activeAgent(sessionId));
  } catch { /* 靜默 — 檔案不存在或清除失敗不影響主流程 */ }

  // ── 辨識 agent 對應的 stage ──

  const agentToStage = {};
  for (const [stageKey, def] of Object.entries(stages)) {
    agentToStage[def.agent] = stageKey;
  }

  const stageKey = agentToStage[agentName];
  if (!stageKey) {
    // 非 Overtone 管理的 agent → 跳過
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // ── 讀取當前狀態 ──

  const currentState = readState(sessionId);
  if (!currentState) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // ── 解析 agent 結果 ──

  const result = parseResult(agentOutput, stageKey);

  // ── 找到此 agent 對應的 stage key（可能帶編號如 TEST:2）──

  const actualStageKey = findActualStageKey(currentState, stageKey);
  if (!actualStageKey) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // ── 原子化更新：合併 removeActiveAgent + updateStage + failCount/rejectCount（H-2）──

  const updatedState = updateStateAtomic(sessionId, (s) => {
    // 1. 移除 active agent
    delete s.activeAgents[agentName];

    // 2. 更新 stage 狀態
    if (s.stages[actualStageKey]) {
      Object.assign(s.stages[actualStageKey], {
        status: 'completed',
        result: result.verdict,
        completedAt: new Date().toISOString(),
      });

      // 自動推進 currentStage
      const keys = Object.keys(s.stages);
      const nextPending = keys.find((k) => s.stages[k].status === 'pending');
      if (nextPending) s.currentStage = nextPending;
    }

    // 3. 更新 fail/reject 計數
    if (result.verdict === 'fail') {
      s.failCount = (s.failCount || 0) + 1;
    } else if (result.verdict === 'reject') {
      s.rejectCount = (s.rejectCount || 0) + 1;
    }

    return s;
  });

  // ── emit timeline 事件 ──

  // agent:error — 補充事件（result 為 fail 時先 emit，再 emit agent:complete）
  if (result.verdict === 'fail') {
    timeline.emit(sessionId, 'agent:error', {
      agent: agentName,
      stage: actualStageKey,
      reason: result.reason || 'agent 回報 fail',
    });
  }

  timeline.emit(sessionId, 'agent:complete', {
    agent: agentName,
    stage: actualStageKey,
    result: result.verdict,
  });

  timeline.emit(sessionId, 'stage:complete', {
    stage: actualStageKey,
    result: result.verdict,
  });

  // ── agent_performance 觀察記錄 ──
  try {
    const perfTrigger = `${agentName} ${result.verdict} at ${actualStageKey}`;
    const perfAction = result.verdict === 'pass'
      ? `${agentName} 成功完成 ${actualStageKey}`
      : `${agentName} 在 ${actualStageKey} 結果為 ${result.verdict}`;
    instinct.emit(sessionId, 'agent_performance', perfTrigger, perfAction, `agent-${agentName}`);
  } catch {
    // Instinct 觀察失敗不影響主流程
  }

  // ── 自動更新 tasks.md checkbox（若有 specs feature）──
  // 當 stage 完成（非 fail/reject）時，在 tasks.md 中勾選對應的 checkbox

  // featureName auto-sync：若 workflow.json 沒有 featureName，嘗試從 specs 目錄自動偵測
  if (!updatedState.featureName && projectRoot) {
    try {
      const specsAutoSync = require('../../../scripts/lib/specs');
      const activeFeature = specsAutoSync.getActiveFeature(projectRoot);
      if (activeFeature) {
        const { setFeatureName } = require('../../../scripts/lib/state');
        setFeatureName(sessionId, activeFeature.name);
        updatedState.featureName = activeFeature.name;
      }
    } catch { /* 靜默忽略 — auto-sync 失敗不影響主流程 */ }
  }

  let tasksCheckboxWarning = null;

  if (result.verdict !== 'fail' && result.verdict !== 'reject' && updatedState.featureName) {
    const { existsSync } = require('fs');
    const { atomicWrite } = require('../../../scripts/lib/utils');

    const tasksPath = paths.project.featureTasks(projectRoot, updatedState.featureName);

    if (existsSync(tasksPath)) {
      try {
        const content = readFileSync(tasksPath, 'utf8');

        // 去掉 :2 等編號，取得 base stage 名稱
        const baseStage = actualStageKey.split(':')[0];
        // 精確匹配 stage 名稱的未勾選 checkbox（行首允許縮排）
        const pattern = new RegExp(`^([ \\t]*- )\\[ \\]( ${baseStage})([ \\t]*)$`, 'm');
        const updated = content.replace(pattern, '$1[x]$2$3');

        if (updated !== content) {
          atomicWrite(tasksPath, updated);
        }
      } catch (err) {
        tasksCheckboxWarning = err.message;
      }
    }
  }

  // ── 產生提示訊息 ──

  const messages = [];

  if (tasksCheckboxWarning) {
    messages.push(`⚠️ tasks.md 勾選更新失敗：${tasksCheckboxWarning}`);
  }

  if (result.verdict === 'fail') {
    if (updatedState.failCount >= retryDefaults.maxRetries) {
      messages.push(`⛔ 已達重試上限（${retryDefaults.maxRetries} 次）。請人工介入。`);
      timeline.emit(sessionId, 'error:fatal', {
        reason: '重試上限',
        failCount: updatedState.failCount,
      });
    } else {
      messages.push(`❌ ${stages[stageKey].emoji} ${stages[stageKey].label}失敗（${updatedState.failCount}/${retryDefaults.maxRetries}）`);
      // D3：若同時有 REVIEW REJECT（rejectCount > 0），輸出整合協調提示
      if (updatedState.rejectCount > 0) {
        messages.push('⚠️ 並行群組雙重失敗（TEST FAIL + REVIEW REJECT）');
        messages.push('⏭️ 協調策略（TEST FAIL > REVIEW REJECT）：委派 DEBUGGER 分析根因 → DEVELOPER 修復（同時帶入 REVIEW reject 原因）→ 再次並行 [REVIEW + TEST]');
      } else {
        messages.push('⏭️ 下一步：委派 DEBUGGER 分析根因 → DEVELOPER 修復 → TESTER 驗證');
      }
      timeline.emit(sessionId, 'stage:retry', {
        stage: actualStageKey,
        failCount: updatedState.failCount,
      });
    }
  } else if (result.verdict === 'reject') {
    if (updatedState.rejectCount >= retryDefaults.maxRetries) {
      messages.push(`⛔ 審查拒絕已達上限（${retryDefaults.maxRetries} 次）。請人工介入。`);
      timeline.emit(sessionId, 'error:fatal', {
        reason: '拒絕上限',
        rejectCount: updatedState.rejectCount,
      });
    } else {
      messages.push(`🔙 審查拒絕（${updatedState.rejectCount}/${retryDefaults.maxRetries}）`);
      // D3：若同時有 TEST FAIL（failCount > 0），提示 TEST FAIL 優先
      if (updatedState.failCount > 0) {
        messages.push('⚠️ 並行群組雙重失敗（TEST FAIL + REVIEW REJECT）');
        messages.push('⏭️ 協調策略（TEST FAIL > REVIEW REJECT）：等待 TEST 結果，以 TEST FAIL 路徑為主（DEBUGGER → DEVELOPER → 再次並行 [REVIEW + TEST]），REVIEW reject 原因一併帶入');
      } else {
        messages.push('⏭️ 下一步：委派 DEVELOPER 修復（帶 reject 原因）→ REVIEWER 再審');
      }
    }
  } else if (result.verdict === 'issues') {
    // 遞增 retroCount
    const withRetro = updateStateAtomic(sessionId, (s) => {
      s.retroCount = (s.retroCount || 0) + 1;
      return s;
    });
    messages.push(`🔁 ${stages[stageKey]?.emoji || ''} ${stages[stageKey]?.label || stageKey}回顧完成：發現改善建議（retroCount: ${withRetro.retroCount}/3）`);
    if (withRetro.retroCount >= 3) {
      messages.push('⛔ 已達迭代上限（3 次），建議繼續完成剩餘 stages（如 DOCS）');
    } else {
      messages.push('💡 可選：觸發 /ot:auto 新一輪優化，或繼續完成剩餘 stages');
    }
  } else {
    // PASS — 檢查並行收斂 + 提示下一步
    messages.push(`✅ ${stages[stageKey].emoji} ${stages[stageKey].label}完成`);
    messages.push(`📊 請更新 TaskList：TaskUpdate status completed（${stages[stageKey].label}）`);

    // Specs 路徑提示（用 featureName 直接定位，避免多 feature 並行時取錯）
    if (updatedState.featureName) {
      try {
        const specsLib = require('../../../scripts/lib/specs');
        const tasksPath = paths.project.featureTasks(projectRoot, updatedState.featureName);
        const tasks = specsLib.readTasksCheckboxes(tasksPath);
        const checked = tasks ? tasks.checked : 0;
        const total = tasks ? tasks.total : 0;
        const taskInfo = total > 0 ? ` (${checked}/${total} tasks)` : '';
        messages.push(`📂 Specs：specs/features/in-progress/${updatedState.featureName}/${taskInfo}`);
      } catch {
        // specs 提示失敗不影響主流程
      }
    }

    // 並行群組收斂偵測
    const convergence = checkParallelConvergence(updatedState, parallelGroups);
    if (convergence) {
      messages.push(`🔄 並行群組 ${convergence.group} 全部完成`);
      timeline.emit(sessionId, 'parallel:converge', { group: convergence.group });
    }

    // 提示下一步
    const nextHint = getNextStageHint(updatedState, { stages, parallelGroups });
    if (nextHint) {
      messages.push(`⏭️ 下一步：${nextHint}`);

      // Compact 建議（只在非最後 stage 時觸發）
      const transcriptPath = input.transcript_path || null;
      const suggestion = shouldSuggestCompact({ transcriptPath, sessionId });
      if (suggestion.suggest) {
        messages.push(`\n💾 transcript 已達 ${suggestion.transcriptSize}，建議在繼續下一個 stage 前執行 /compact 壓縮 context。`);
        timeline.emit(sessionId, 'session:compact-suggestion', {
          transcriptSize: suggestion.transcriptSize,
          reason: suggestion.reason,
          stage: actualStageKey,
          agent: agentName,
        });
      }
    } else {
      // 所有階段完成 — 不在此 emit workflow:complete，由 Stop hook 統一處理
      messages.push('🎉 所有階段已完成！');
      messages.push('📋 建議：委派 planner 規劃下一批工作（或執行 /ot:plan）');
    }
  }

  // 提示 Main Agent 可選呼叫 grader
  if (result.verdict !== 'fail') {
    messages.push(`\n💡 可選：委派 grader agent 評估此階段輸出品質（subagent_type: ot:grader，傳入 STAGE=${actualStageKey} AGENT=${agentName} SESSION_ID=${sessionId}）`);
  }

  // ── DOCS 完成時：自動校驗文件數字 ──
  // 當 DOCS stage 成功完成時，執行文件數字同步檢查，確保 status.md / CLAUDE.md 數字正確
  if (stageKey === 'DOCS' && result.verdict !== 'fail' && result.verdict !== 'reject') {
    try {
      const docsSyncEngine = require('../../../scripts/lib/docs-sync-engine');
      const syncResult = docsSyncEngine.runDocsSyncCheck();
      if (!syncResult.wasClean) {
        if (syncResult.fixed.length > 0) {
          messages.push(`\n📄 文件數字自動修復（${syncResult.fixed.length} 項）：\n${syncResult.fixed.map(f => `  - ${f}`).join('\n')}`);
        }
        if (syncResult.skipped.length > 0) {
          messages.push(`\n⚠️ 需人工確認（${syncResult.skipped.length} 項）：\n${syncResult.skipped.map(s => `  - ${s}`).join('\n')}`);
        }
        if (syncResult.errors.length > 0) {
          messages.push(`\n❌ 文件同步錯誤（${syncResult.errors.length} 項）：\n${syncResult.errors.map(e => `  - ${e}`).join('\n')}`);
        }
      }
    } catch {
      // docs-sync 失敗不影響主流程
    }
  }

  process.stdout.write(JSON.stringify({
    result: messages.join('\n'),
  }));
  process.exit(0);
}, { result: '' });
} // end require.main === module

/**
 * 判斷是否應該建議 compact
 *
 * @param {object} opts
 * @param {string|null} opts.transcriptPath  - transcript 檔案路徑
 * @param {string}      opts.sessionId       - 當前 session ID
 * @param {number}      [opts.thresholdBytes]  - 閾值（bytes），預設 5MB
 * @param {number}      [opts.minStagesSinceCompact] - compact 後最少要有幾個 stage:complete，預設 2
 * @returns {{ suggest: boolean, reason?: string, transcriptSize?: string }}
 */
function shouldSuggestCompact({ transcriptPath, sessionId, thresholdBytes, minStagesSinceCompact }) {
  try {
    // 1. 取得閾值（支援環境變數覆蓋）
    const thresholdMb = Number(process.env.OVERTONE_COMPACT_THRESHOLD_MB) || 5;
    const threshold = thresholdBytes !== undefined ? thresholdBytes : thresholdMb * 1_000_000;
    const minStages = minStagesSinceCompact !== undefined ? minStagesSinceCompact : 2;

    // 2. 讀取 transcript 大小
    if (!transcriptPath) return { suggest: false };
    let size;
    try {
      size = statSync(transcriptPath).size;
    } catch {
      return { suggest: false };
    }

    // 3. 大小未超過閾值 → 不建議
    if (size <= threshold) return { suggest: false };

    // 4. 查詢最後一次 session:compact 事件
    const lastCompact = timeline.latest(sessionId, 'session:compact');

    if (lastCompact) {
      // 5. 計算 compact 事件之後的 stage:complete 數量
      const stageCompletes = timeline.query(sessionId, { type: 'stage:complete' });
      const stagesAfterCompact = stageCompletes.filter(
        (e) => e.ts >= lastCompact.ts
      );
      // 6. 若 compact 後 stage:complete 數量 < minStages → 跳過（剛 compact 過）
      if (stagesAfterCompact.length < minStages) {
        return { suggest: false };
      }
    }
    // 7. 若從未 compact → 允許首次觸發（跳過上述 compact 後計數判斷）

    // 8. 全部通過 → 建議 compact
    return {
      suggest: true,
      reason: `transcript 大小 ${formatSize(size)} 超過閾值 ${formatSize(threshold)}`,
      transcriptSize: formatSize(size),
    };
  } catch {
    // 所有錯誤靜默降級
    return { suggest: false };
  }
}

// ── 測試用 export（require 時可直接測試輔助函式）──
module.exports = { shouldSuggestCompact, formatSize };
