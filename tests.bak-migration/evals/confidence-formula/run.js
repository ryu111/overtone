/**
 * confidence-formula eval — autoresearch eval
 *
 * 用途：驗證 computeConfidence 中的常數是否讓信心公式產生正確結果
 * 目標檔案：~/.claude/scripts/learner-analysis.js
 * 可調常數：絕對次數上限(3)、log2 分母上限(20)、時間衰減係數(3天)、頻率權重比(50:50)
 *
 * 設計說明：
 *   - 直接 import computeConfidence 從 learner-analysis.js
 *   - autoresearch 修改 learner-analysis.js 中的常數後，這裡會立即反映改動效果
 *   - ground truth = behaviors.jsonl 中儲存的 confidence 值（在 now=2026-03-19 計算）
 *   - 指標 = 1 - MAE（MAE 越小，指標越高，最高 1.0）
 */

import { join } from 'path';
import { homedir } from 'os';
import { readFileSync } from 'fs';

// 讀取 cases
const casesPath = join(import.meta.dir, 'cases.json');
const { cases } = JSON.parse(readFileSync(casesPath, 'utf-8'));

// 動態 import computeConfidence（autoresearch 改常數後立即生效）
const learnerAnalysisPath = join(homedir(), '.claude/scripts/learner-analysis.js');
let computeConfidence;
try {
  const mod = await import(learnerAnalysisPath);
  computeConfidence = mod.computeConfidence;
  if (typeof computeConfidence !== 'function') {
    throw new Error('computeConfidence 不是函式');
  }
} catch (err) {
  console.error(`無法 import learner-analysis.js: ${err.message}`);
  process.exit(1);
}

// 固定 now = 2026-03-19（ground truth 計算時間）
// totalSessions = 1786（behaviors.jsonl 記錄當時的 session 數）
const EVAL_NOW = new Date('2026-03-19');
const TOTAL_SESSIONS = 1786;

let totalError = 0;
let passCount = 0;
let failCount = 0;

for (const c of cases) {
  // 組成 behavior 物件（與 learner-analysis.js analyzeAndUpdate 產生的格式一致）
  const behavior = {
    occurrences: Array.from({ length: c.occurrences_count }, (_, i) => i + 1),
    firstSeen: c.first_seen,
    lastSeen: c.last_seen,
    polarity: c.polarity,
  };

  const computed = computeConfidence(behavior, TOTAL_SESSIONS, EVAL_NOW);
  const expected = c.expected_confidence;
  const error = Math.abs(computed - expected);
  totalError += error;

  const pass = error < 0.005; // 允許浮點誤差 ±0.005
  if (pass) passCount++; else failCount++;

  const status = pass ? 'PASS' : 'FAIL';
  console.log(`${status} ${c.label}`);
  if (!pass) {
    console.log(`     computed=${computed} expected=${expected} error=${error.toFixed(4)}`);
  }
}

const mae = totalError / cases.length;
const metric = Math.max(0, 1 - mae);

console.log('');
console.log(`cases: ${cases.length}  pass: ${passCount}  fail: ${failCount}`);
console.log(`MAE: ${mae.toFixed(6)}`);
console.log(`metric:${metric.toFixed(6)}`);
