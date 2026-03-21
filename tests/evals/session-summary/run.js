/**
 * Session 摘要 prompt Eval（#7）
 *
 * 測量 briefing-builder.js 的 summarySystem prompt 品質。
 * 對每個 case，用 summarySystem prompt + askLocalModel 重新生成摘要，
 * 用 token overlap 指標比對 ground truth 的關鍵名詞覆蓋率。
 *
 * 主指標：keyword overlap rate（ground truth 關鍵名詞出現在生成摘要的比例）
 */

import { join } from 'path';
import { homedir } from 'os';

const HOME = homedir();

const localModel = await import(join(HOME, '.claude/scripts/local-model.js'));
const askLocalModel = localModel.askLocalModel;

const data = await import('./cases.json');
const { name, variable_file, variable_description, cases } = data.default ?? data;

// summarySystem prompt（來自 briefing-builder.js 行 63-70）
const SUMMARY_SYSTEM = `你是 Nova 系統的 session 摘要生成器。

規則：
- 2-3 句話，涵蓋：做了什麼、發現了什麼、決定了什麼
- 使用繁體中文，具體數字和名稱（不說「一些改動」，說「修改 3 個檔案」）
- 範例：「實作 session 收尾三階段架構（wrapup.js），修復 stop hook 的 UTC 時區偏移。Phase B 實測 35 秒，符合 < 60s 目標。」

只回覆摘要文字，不加標題或格式。`;

/**
 * 提取文字中的關鍵名詞（中文名詞 + 英文技術詞）
 */
function extractKeywords(text) {
  if (!text) return [];
  const keywords = new Set();

  // 提取英文技術詞（2+ 字元，含字母）
  const enWords = text.match(/[a-zA-Z][a-zA-Z0-9._-]{1,}/g) || [];
  for (const w of enWords) {
    if (w.length >= 2 && !/^(the|and|or|in|of|to|a|an|is|are|was|were|be|been|has|have|had|do|did|for|on|at|by|with|this|that|it|we|you|he|she|they|but|not|from|as|up|if|so|no|my|we|our|your)$/i.test(w)) {
      keywords.add(w.toLowerCase());
    }
  }

  // 提取中文關鍵詞（3-6 字元的中文片段）
  const zhMatches = text.match(/[\u4e00-\u9fff]{2,6}/g) || [];
  const stopCh = new Set(['的了在是都有和與或但而等及並且什麼這那他她它我你我們你們他們如果雖然因為所以但是']);
  for (const zh of zhMatches) {
    let hasStop = false;
    for (const c of zh) {
      if (stopCh.has(c)) { hasStop = true; break; }
    }
    if (!hasStop) keywords.add(zh);
  }

  return [...keywords];
}

/**
 * 計算生成摘要對 ground truth 的關鍵詞覆蓋率
 */
function calculateOverlap(generated, groundTruth) {
  if (!generated || !groundTruth) return 0;

  const gtKeywords = extractKeywords(groundTruth);
  if (gtKeywords.length === 0) return 0;

  const genLower = generated.toLowerCase();
  let hits = 0;
  for (const kw of gtKeywords) {
    if (genLower.includes(kw.toLowerCase())) hits++;
  }

  return hits / gtKeywords.length;
}

/**
 * 對單一 case 重新生成摘要，回傳 overlap rate
 */
async function evaluateCase(c) {
  const toolStr = Object.entries(c.toolCounts || {})
    .map(([k, v]) => `${k}: ${v}次`)
    .join(', ') || '無工具';

  const prompt = `根據以下 session 資料，寫一段 2-3 句的中文摘要：

工具使用：${toolStr}
使用者指令：${(c.prompts || []).join(' | ') || '無'}
委派 agent：${(c.agents || []).join(', ') || '無'}
${c.recentCommits ? 'Git commits：\n' + c.recentCommits : ''}`;

  const fallback = `Session 包含 ${c.promptCount} 個指令，使用了 ${Object.keys(c.toolCounts || {}).join(', ') || '無工具'}。`;

  let generated = null;
  try {
    generated = await askLocalModel(prompt, fallback, null, { system: SUMMARY_SYSTEM });
  } catch (err) {
    return {
      label: c.label,
      overlap: 0,
      skipped: true,
      reason: `模型呼叫失敗: ${err.message}`,
    };
  }

  const overlap = calculateOverlap(generated, c.ground_truth);

  return {
    label: c.label,
    overlap,
    skipped: false,
    generated: generated?.slice(0, 80),
    groundTruth: c.ground_truth?.slice(0, 80),
  };
}

// 並行跑所有 case
console.log(`\n執行 ${name} Eval（${cases.length} 個 cases）...`);
console.log(`variable: ${variable_file}`);
console.log(`variable_description: ${variable_description}\n`);

const results = await Promise.all(cases.map(evaluateCase));

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
    console.log(`    [${(r.overlap * 100).toFixed(0)}%] ${r.label}`);
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
