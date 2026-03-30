/**
 * 根因分析 prompt Eval（#9）
 *
 * 測量 learner-suggestions.js 的根因分析 system prompt 品質。
 * 對每個 polarity=-1 的反模式 case，用根因 system prompt + askLocalModel 重新分析，
 * 用關鍵詞 overlap 比較（提取名詞/動詞比對）。
 *
 * 主指標：semantic similarity（本地模型語意判斷，0-1）
 */

import { join } from 'path';
import { homedir } from 'os';
import { requireLlm } from '../eval-runner.js';

const HOME = homedir();

await requireLlm('root-cause');

const localModel = await import(join(HOME, '.claude/scripts/local-model.js'));
const askLocalModel = localModel.askLocalModel;

const data = await import('./cases.json');
const { name, variable_file, variable_description, cases } = data.default ?? data;

// 根因分析 system prompt（來自 learner-suggestions.js 行 97 附近）
const ROOT_CAUSE_SYSTEM = `你是 Nova 系統的根因分析器。Nova 是 Claude Code 的 hook/plugin 系統，包含：
- guards.js：Bash 危險命令攔截（regex 黑名單）
- flow-observer.js：session 事件觀察
- context-injector.js：上下文注入
- learner.js：行為偵測
- judge.js：品質評分
- 本地模型（vllm-mlx Qwen3-8B）：語意判斷

常見根因類型：
- 靜默失敗：catch {} 吞掉錯誤、hook 無回應
- 服務不可用：本地模型 timeout、nova-server 掛掉
- 門檻/閾值問題：檢測條件過嚴或過寬
- 邏輯缺口：某路徑未覆蓋、fallback 路徑繞過記錄

信號解讀：
- blocks=0, errors=0：可能是監控層失效（靜默失敗）、服務不可用導致記錄中斷、或檢測邏輯未覆蓋此模式
- fixKeywords=0：無修正嘗試，說明問題未被察覺或無自動修復機制
- blocks>0：guard 有攔截，問題在於攔截後的處理邏輯
- errors>0：有錯誤記錄，找出錯誤來源

直接說「根因：X」，引用信號數據。只回覆一行。`;

import { semanticScore as _semanticScore } from '../semantic-judge.js';

// 覆寫 semanticScore：800 字窗口取代預設 200 字
async function semanticScore(generated, groundTruth) {
  if (!generated || !groundTruth) return 0;
  const JUDGE_SYSTEM = `你是語意相似度裁判。判斷兩段文字是否在描述相同的核心概念。
只回覆一個數字 0-5：
0 = 完全無關
1 = 主題相關但內容不同
2 = 描述類似的問題但角度不同
3 = 核心概念相同，細節不同
4 = 內容高度一致，措辭不同
5 = 語意完全等價
只回覆數字，不要其他文字。`;
  const prompt = `文字 A：${generated.slice(0, 800)}

文字 B：${groundTruth.slice(0, 800)}

語意相似度（0-5）：`;
  const result = await askLocalModel(prompt, '0', null, {
    system: JUDGE_SYSTEM,
    temperature: 0.1,
  });
  const score = parseInt((result || '0').trim().match(/\d/)?.[0] || '0', 10);
  return Math.min(score, 5) / 5;
}

/**
 * 對單一 case 重新生成根因分析，回傳 overlap rate
 */
async function evaluateCase(c) {
  const signalStr = c.signals
    ? `blocks=${c.signals.blocks || 0}, errors=${c.signals.errors || 0}, 修正關鍵詞=${c.signals.fixKeywords || 0}`
    : 'blocks=0, errors=0, 修正關鍵詞=0';

  const prompt = `以下是一個反覆出現的問題：

模式：${c.id || c.pattern || '未知'}
信號：${signalStr}
出現次數：${c.occurrences || 3}
時間跨度：${c.firstSeen || '不明'} ~ ${c.lastSeen || '不明'}

這個反模式的根因可能是什麼？用一行回覆。`;

  const fallback = '需要調查根因';

  let generated = null;
  try {
    generated = await askLocalModel(prompt, fallback, null, { system: ROOT_CAUSE_SYSTEM });
  } catch (err) {
    return {
      label: c.label,
      overlap: 0,
      skipped: true,
      reason: `模型呼叫失敗: ${err.message}`,
    };
  }

  // 過濾掉 Thinking Process 輸出
  if (generated && generated.startsWith('Thinking Process')) {
    return {
      label: c.label,
      overlap: 0,
      skipped: true,
      reason: '模型輸出 Thinking Process（需要 stripThinking）',
    };
  }

  const score = await semanticScore(generated, c.ground_truth);

  return {
    label: c.label,
    overlap: score,
    skipped: false,
    pattern: c.pattern,
    generated: generated?.slice(0, 80),
    groundTruth: c.ground_truth?.slice(0, 80),
  };
}

// 並行跑所有 case
console.log(`\n執行 ${name} Eval（${cases.length} 個 cases）...`);
console.log(`variable: ${variable_file}`);
console.log(`variable_description: ${variable_description}\n`);

// 序列執行避免打爆本地模型（每 case 2 次 LLM 呼叫）
const results = [];
for (const c of cases) {
  results.push(await evaluateCase(c));
}

// 計算指標
const validResults = results.filter((r) => !r.skipped);
const skipped = results.filter((r) => r.skipped);
const totalOverlap = validResults.reduce((sum, r) => sum + r.overlap, 0);
const avgOverlap = validResults.length > 0 ? totalOverlap / validResults.length : 0;

// 報告
console.log('='.repeat(55));
console.log(`  ${name} Eval Report`);
console.log('='.repeat(55));
console.log(`  Total cases:    ${cases.length}`);
console.log(`  Valid cases:    ${validResults.length}`);
console.log(`  Skipped:        ${skipped.length}`);
console.log(`  Avg overlap:    ${(avgOverlap * 100).toFixed(1)}%`);
console.log();

const lowOverlap = validResults.filter((r) => r.overlap < 0.3);
if (lowOverlap.length > 0) {
  console.log(`  低覆蓋率 case (${lowOverlap.length}):`);
  for (const r of lowOverlap) {
    console.log(`    [${(r.overlap * 100).toFixed(0)}%] ${r.label} (${r.pattern})`);
    if (r.generated) console.log(`         生成：${r.generated}`);
    if (r.groundTruth) console.log(`         期望：${r.groundTruth}`);
  }
}

if (skipped.length > 0) {
  console.log(`\n  跳過 case (${skipped.length}):`);
  for (const r of skipped) {
    console.log(`    ${r.label}: ${r.reason}`);
  }
}

console.log('='.repeat(55));
console.log();

// 輸出機器可讀指標（供 autoresearch loop 使用）
console.log(`metric:${avgOverlap.toFixed(6)}`);
