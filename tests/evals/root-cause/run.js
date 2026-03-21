/**
 * 根因分析 prompt Eval（#9）
 *
 * 測量 learner-suggestions.js 的根因分析 system prompt 品質。
 * 對每個 polarity=-1 的反模式 case，用根因 system prompt + askLocalModel 重新分析，
 * 用關鍵詞 overlap 比較（提取名詞/動詞比對）。
 *
 * 主指標：keyword overlap rate（ground truth 根因關鍵詞在生成結果中的覆蓋率）
 */

import { join } from 'path';
import { homedir } from 'os';

const HOME = homedir();

const localModel = await import(join(HOME, '.claude/scripts/local-model.js'));
const askLocalModel = localModel.askLocalModel;

const data = await import('./cases.json');
const { name, variable_file, variable_description, cases } = data.default ?? data;

// 根因分析 system prompt（來自 learner-suggestions.js 行 97 附近）
const ROOT_CAUSE_SYSTEM = `你是 Nova 系統的根因分析器。找出反覆問題的根本原因。不說「可能」，直接說「根因：X」。引用信號數據。只回覆一行。`;

/**
 * 提取文字中的技術關鍵詞（中文名詞片段 + 英文技術詞）
 * 排除停用詞，保留 guard、hook、catch、signal 等技術詞
 */
function extractKeywords(text) {
  if (!text) return [];
  const keywords = new Set();

  // 提取英文技術詞（2+ 字元）
  const enWords = text.match(/[a-zA-Z][a-zA-Z0-9._-]{1,}/g) || [];
  const enStop = new Set(['the', 'and', 'or', 'in', 'of', 'to', 'a', 'an', 'is', 'are', 'was', 'be', 'for', 'on', 'at', 'by', 'with', 'this', 'that', 'it', 'not', 'from', 'as', 'if', 'may', 'can', 'but', 'so', 'no', 'will', 'vs', 'ie']);
  for (const w of enWords) {
    if (w.length >= 2 && !enStop.has(w.toLowerCase())) {
      keywords.add(w.toLowerCase());
    }
  }

  // 提取中文關鍵詞（2-5 字元的中文名詞片段）
  const zhMatches = text.match(/[\u4e00-\u9fff]{2,5}/g) || [];
  const stopCh = new Set(['的了在是都有和與或但而等及並且什麼這那他她它我你我們你們他們如果雖然因為所以但是可以需要應該可能導致根據']);
  for (const zh of zhMatches) {
    let hasStop = false;
    for (const c of zh) {
      if (stopCh.has(c)) { hasStop = true; break; }
    }
    if (!hasStop && zh.length >= 2) keywords.add(zh);
  }

  return [...keywords];
}

/**
 * 計算生成根因對 ground truth 的關鍵詞覆蓋率
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
 * 對單一 case 重新生成根因分析，回傳 overlap rate
 */
async function evaluateCase(c) {
  const signalStr = c.signals
    ? `blocks=${c.signals.blocks || 0}, errors=${c.signals.errors || 0}, 修正關鍵詞=${c.signals.fixKeywords || 0}`
    : 'blocks=0, errors=0, 修正關鍵詞=0';

  const prompt = `以下是一個反覆出現的問題：

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

  const overlap = calculateOverlap(generated, c.ground_truth);

  return {
    label: c.label,
    overlap,
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
