'use strict';
/**
 * hook-utils.js — Hook 共用工具
 *
 * 提供九個函式，統一所有 hook 的通用邏輯：
 *   safeReadStdin            — 同步讀取 stdin + JSON.parse，失敗回傳 {}
 *   safeRun                  — 頂層 try/catch 包裹，crash 時輸出 defaultOutput + exit 0
 *   hookError                — 統一 stderr 錯誤記錄（帶 [overtone/{hookName}] 前綴）
 *   buildPendingTasksMessage — 讀取活躍 feature 的未完成任務，供 SessionStart + PreCompact 共用
 *   buildProgressBar         — 產生 stage 進度條字串（emoji 圖示），供多個 hook 共用
 *   buildWorkflowContext     — 產生 workflow context 字串，供 PreToolUse updatedInput 注入
 *   getSessionId             — 從 hook input 取得 session ID（帶 fallback）
 *   buildSkillContext        — 讀取 agent frontmatter skills → 載入 SKILL.md 正文摘要
 *   shouldSuggestCompact     — 判斷是否應該建議 compact（從 on-stop.js 搬遷）
 *   getStageByAgent          — 根據 agent 名稱找對應 stage key（消除 on-stop/pre-task 重複邏輯）
 */

const { readFileSync, existsSync, statSync } = require('fs');
const path = require('path');

/**
 * 同步讀取 /dev/stdin 並解析 JSON。
 * 失敗（空輸入、畸形 JSON、讀取錯誤）時回傳 {}。
 * @returns {object}
 */
function safeReadStdin() {
  try {
    const raw = readFileSync('/dev/stdin', 'utf8');
    if (!raw.trim()) {
      hookError('safeReadStdin', 'stdin 為空');
      return {};
    }
    return JSON.parse(raw);
  } catch (err) {
    hookError('safeReadStdin', `stdin 讀取或解析失敗：${err.message || String(err)}`);
    return {};
  }
}

/**
 * 頂層 try/catch 包裹 hook 主邏輯。
 * fn() 若拋出例外，輸出 defaultOutput 並 exit 0。
 * fn() 正常完成後，也輸出 defaultOutput 並 exit 0（fn 內部自行 stdout.write 的 hook 應在 fn 內呼叫 process.exit(0)）。
 * @param {Function} fn - hook 主邏輯
 * @param {object} defaultOutput - 失敗時輸出的 JSON 物件
 */
function safeRun(fn, defaultOutput = { result: '' }) {
  try {
    fn();
  } catch (err) {
    hookError('safeRun', err.message || String(err));
    process.stdout.write(JSON.stringify(defaultOutput));
    process.exit(0);
  }
  // fn 正常完成但沒有自行退出時，輸出 defaultOutput
  process.stdout.write(JSON.stringify(defaultOutput));
  process.exit(0);
}

/**
 * 寫入 stderr 錯誤訊息（帶 [overtone/{hookName}] 前綴）。
 * @param {string} hookName
 * @param {string} message
 */
function hookError(hookName, message) {
  process.stderr.write(`[overtone/${hookName}] ${message}\n`);
}

/**
 * 建構未完成任務恢復訊息。
 *
 * 從 specs/features/in-progress 讀取活躍 feature 的 tasks.md，
 * 組裝未完成任務清單。供 SessionStart 和 PreCompact hook 共用。
 *
 * @param {string} projectRoot - 專案根目錄
 * @param {object} [options]
 * @param {string} [options.header] - 自訂標頭文字（預設 '未完成任務'）
 * @returns {string|null} 未完成任務訊息，無活躍 feature 或全部完成時回傳 null
 */
function buildPendingTasksMessage(projectRoot, options = {}) {
  try {
    // 延遲 require 避免循環依賴，且僅在需要時載入
    const specs = require(path.join(__dirname, 'specs'));
    const activeFeature = specs.getActiveFeature(projectRoot);
    if (!activeFeature) return null;

    const checkboxes = activeFeature.tasks;
    if (!checkboxes || checkboxes.allChecked || checkboxes.total === 0) return null;

    const header = options.header || '未完成任務';
    const unchecked = checkboxes.unchecked || [];
    const lines = [
      `📋 **${header}**`,
      `Feature：${activeFeature.name}（${checkboxes.checked}/${checkboxes.total} 完成）`,
      ...unchecked.slice(0, 5).map(t => `- [ ] ${t}`),
    ];
    if (unchecked.length > 5) {
      lines.push(`... 還有 ${unchecked.length - 5} 個`);
    }
    lines.push(`→ 請使用 TaskCreate 重建以上任務的 TaskList，然後繼續執行。`);
    return lines.join('\n');
  } catch {
    return null;
  }
}

/**
 * 產生 stage 進度條字串（emoji 圖示）。
 *
 * 格式：每個 stage 顯示「狀態圖示 + stage emoji」，以空字串連接。
 *   completed → ✅  active → ⏳  pending → ⬜
 *
 * @param {Array<[string, object]>} stageEntries - Object.entries(currentState.stages)
 * @param {object} registryStages - registry.js 的 stages 定義
 * @returns {string} 進度條字串，如 "✅📋✅🏗️⏳💻⬜🔍"
 */
function buildProgressBar(stageEntries, registryStages) {
  return stageEntries.map(([k, s]) => {
    const base = k.split(':')[0];
    const icon = s.status === 'completed' ? '✅' : s.status === 'active' ? '⏳' : '⬜';
    return `${icon}${registryStages[base]?.emoji || ''}`;
  }).join('');
}

/**
 * 建構 workflow context 字串，用於注入 agent Task prompt。
 *
 * 讀取 workflow state，組裝包含工作流狀態、進度條、當前階段、
 * feature 資訊和前階段摘要的 context 字串。
 *
 * @param {string} sessionId
 * @param {string} projectRoot
 * @param {object} [options]
 * @param {number} [options.maxLength=1500] - 最大字元數
 * @returns {string|null} context 字串，無 workflow state 時回傳 null
 */
function buildWorkflowContext(sessionId, projectRoot, options = {}) {
  const maxLength = options.maxLength || 1500;
  try {
    // 延遲 require 避免循環依賴，且僅在需要時載入
    const state = require(path.join(__dirname, 'state'));
    const { stages: registryStages } = require(path.join(__dirname, 'registry'));

    const currentState = state.readState(sessionId);
    if (!currentState) return null;

    const { workflowType, currentStage, stages, featureName } = currentState;
    if (!workflowType || !stages) return null;

    // 進度條
    const stageEntries = Object.entries(stages);
    const progressBar = buildProgressBar(stageEntries, registryStages);
    const completed = stageEntries.filter(([, s]) => s.status === 'completed').length;
    const total = stageEntries.length;

    // 當前階段標籤
    let currentStageLabel = currentStage || '';
    if (currentStage) {
      const base = currentStage.split(':')[0];
      const def = registryStages[base];
      if (def) {
        currentStageLabel = `${def.emoji} ${def.label}`;
      }
    }

    const lines = [
      '[Overtone Workflow Context]',
      `工作流：${workflowType}`,
      `進度：${progressBar} (${completed}/${total})`,
      `目前階段：${currentStageLabel}`,
    ];

    // Feature + Specs 路徑（若有）
    if (featureName) {
      lines.push(`Feature：${featureName}`);
      lines.push(`Specs：specs/features/in-progress/${featureName}/`);
    }

    // 前階段摘要（已完成的 stage）
    const completedStages = stageEntries.filter(([, s]) => s.status === 'completed' && s.result);
    if (completedStages.length > 0) {
      lines.push('');
      lines.push('前階段摘要：');
      for (const [key, s] of completedStages) {
        const base = key.split(':')[0];
        const def = registryStages[base];
        const label = def ? `${def.emoji} ${def.label}` : key;
        // 摘要最多 80 字元，避免 context 過長
        const resultSummary = (s.result || '').slice(0, 80);
        lines.push(`- ${label}：${resultSummary}`);
      }
    }

    let context = lines.join('\n');

    // 截斷保護
    if (context.length > maxLength) {
      const suffix = '... (已截斷)';
      context = context.slice(0, maxLength - suffix.length) + suffix;
    }

    return context;
  } catch {
    return null;
  }
}

/**
 * 從 hook input 取得 session ID。
 *
 * 優先從 input.session_id 讀取，其次 CLAUDE_SESSION_ID 環境變數，最後回傳空字串。
 *
 * @param {object} input - safeReadStdin() 的回傳值
 * @returns {string}
 */
function getSessionId(input) {
  return (input.session_id || process.env.CLAUDE_SESSION_ID || '').trim();
}

/**
 * 讀取 agent frontmatter skills → 載入 SKILL.md 正文摘要。
 *
 * 步驟：
 *   1. 讀取 agents/{agentName}.md，用 gray-matter 解析 frontmatter 取 skills 陣列
 *   2. 讀取每個 skill 的 SKILL.md，去掉 frontmatter 保留正文
 *   3. 截取前 maxCharsPerSkill chars（預設 800），總上限 maxTotalChars（預設 2400）
 *   4. SKILL.md 不存在時靜默跳過
 *   5. agent 無 skills、skills 為空、或載入後全部為空 → 回傳 null
 *
 * @param {string} agentName - agent 名稱（不含 .md）
 * @param {string} pluginRoot - plugin 根目錄
 * @param {object} [options]
 * @param {number} [options.maxCharsPerSkill=800] - 每個 skill 最大字元數
 * @param {number} [options.maxTotalChars=2400] - 所有 skill 總字元數上限
 * @returns {string|null} skill context 文字，無 skills 時回傳 null
 */
function buildSkillContext(agentName, pluginRoot, options = {}) {
  const maxCharsPerSkill = options.maxCharsPerSkill || 800;
  const maxTotalChars = options.maxTotalChars || 2400;

  try {
    // 讀取 agent .md 檔案
    const agentPath = path.join(pluginRoot, 'agents', `${agentName}.md`);
    if (!existsSync(agentPath)) return null;

    const agentContent = readFileSync(agentPath, 'utf8');

    // 用 gray-matter 解析 frontmatter（延遲 require，僅在需要時載入）
    const matter = require('gray-matter');
    const parsed = matter(agentContent);
    const skills = parsed.data && parsed.data.skills;

    // 驗證 skills 欄位：必須是非空陣列
    if (!Array.isArray(skills) || skills.length === 0) return null;

    const skillBlocks = [];
    let totalChars = 0;

    for (const skillName of skills) {
      // 達到總字元上限 → 停止載入更多 skill
      if (totalChars >= maxTotalChars) break;

      const skillPath = path.join(pluginRoot, 'skills', skillName, 'SKILL.md');
      if (!existsSync(skillPath)) continue; // 靜默跳過不存在的 SKILL.md

      try {
        const skillContent = readFileSync(skillPath, 'utf8');
        // 去掉 frontmatter，保留正文
        const parsedSkill = matter(skillContent);
        let body = parsedSkill.content ? parsedSkill.content.trim() : '';

        if (!body) continue;

        // 截取前 maxCharsPerSkill chars
        if (body.length > maxCharsPerSkill) {
          body = body.slice(0, maxCharsPerSkill) + '...（已截斷）';
        }

        // 剩餘可用字元
        const remaining = maxTotalChars - totalChars;
        if (body.length > remaining) {
          body = body.slice(0, remaining) + '...（已截斷）';
        }

        const block = `--- ${skillName} ---\n${body}`;
        skillBlocks.push(block);
        totalChars += block.length;
      } catch { /* 靜默跳過讀取失敗的 SKILL.md */ }
    }

    if (skillBlocks.length === 0) return null;

    return `[Skill 知識摘要]\n\n${skillBlocks.join('\n\n')}`;
  } catch {
    return null;
  }
}

/**
 * 根據 agent 名稱找到對應的 stage key。
 *
 * 線性掃描 stages 定義，找到 def.agent === agentName 的那個 key。
 * 這是 on-stop.js 和 pre-task.js 中重複的 agentToStage 邏輯的共用版本。
 *
 * @param {string} agentName - agent 名稱（不含 ot: 前綴）
 * @param {object} stages - registry.js 的 stages 定義
 * @returns {string|null} stage key（如 'DEV'），找不到時回傳 null
 */
function getStageByAgent(agentName, stages) {
  for (const [key, def] of Object.entries(stages)) {
    if (def.agent === agentName) return key;
  }
  return null;
}

/**
 * 判斷是否應該建議 compact。
 *
 * 從 on-stop.js 搬遷到此處，供 SubagentStop hook 使用。
 *
 * @param {object} opts
 * @param {string|null} opts.transcriptPath        - transcript 檔案路徑
 * @param {string}      opts.sessionId             - 當前 session ID
 * @param {number}      [opts.thresholdBytes]      - 閾值（bytes），預設 5MB
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

    // 4. 查詢最後一次 session:compact 事件（延遲 require 避免循環依賴）
    const timeline = require(path.join(__dirname, 'timeline'));
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

    // 8. 全部通過 → 建議 compact（延遲 require formatSize）
    const { formatSize } = require(path.join(__dirname, 'utils'));
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

module.exports = { safeReadStdin, safeRun, hookError, buildPendingTasksMessage, buildProgressBar, buildWorkflowContext, getSessionId, buildSkillContext, shouldSuggestCompact, getStageByAgent };
