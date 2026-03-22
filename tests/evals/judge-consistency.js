/**
 * semanticScore 一致性驗證
 *
 * 對 5 個固定 text pair，各跑 5 次 semanticScore，
 * 計算方差和標準差，輸出報告。
 * 若平均 std > 0.1 → 建議加入 majority vote。
 */
import { semanticScore } from './semantic-judge.js';

const pairs = [
  { a: '修正 guards.js 的正則表達式漏判', b: '修復 guard 模組的 regex 問題', expected: '高相似' },
  { a: '新增心跳引擎模組', b: '刪除舊的 tokenizer', expected: '無關' },
  { a: '優化 hook response time 降低延遲', b: '改善 hook 效能減少回應時間', expected: '等價' },
  { a: '根因：catch 靜默吞錯', b: '根因：本地模型 timeout', expected: '主題相關但不同' },
  { a: '建立 eval 基礎設施', b: '建立測試案例和評估腳本', expected: '高相似' },
];

const RUNS = 5;

function mean(arr) {
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function variance(arr) {
  const m = mean(arr);
  return arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
}

function stddev(arr) {
  return Math.sqrt(variance(arr));
}

async function runPair(pair, idx) {
  const scores = [];
  for (let i = 0; i < RUNS; i++) {
    const s = await semanticScore(pair.a, pair.b);
    scores.push(s);
  }
  return { pair, idx, scores };
}

async function main() {
  console.log('=== semanticScore 一致性驗證 ===\n');
  console.log(`每個 pair 跑 ${RUNS} 次，序列執行中...\n`);

  const results = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    process.stdout.write(`Pair ${i + 1}/${pairs.length} [${pair.expected}] 執行中...`);
    const result = await runPair(pair, i);
    results.push(result);
    process.stdout.write(' 完成\n');
  }

  console.log('\n--- 結果報告 ---\n');

  const allStds = [];

  for (const { pair, idx, scores } of results) {
    const m = mean(scores);
    const std = stddev(scores);
    allStds.push(std);

    const scoresDisplay = scores.map(s => s.toFixed(3)).join(', ');
    console.log(`Pair ${idx + 1}：${pair.expected}`);
    console.log(`  A: "${pair.a}"`);
    console.log(`  B: "${pair.b}"`);
    console.log(`  5 次分數：[${scoresDisplay}]`);
    console.log(`  平均值：${m.toFixed(4)}　標準差：${std.toFixed(4)}`);
    console.log('');
  }

  const overallMeanStd = mean(allStds);
  console.log('--- 整體統計 ---\n');
  console.log(`各 pair 標準差：[${allStds.map(s => s.toFixed(4)).join(', ')}]`);
  console.log(`整體平均標準差：${overallMeanStd.toFixed(4)}`);
  console.log('');

  if (overallMeanStd > 0.1) {
    console.log('結論：不可信（平均 std > 0.1）— 建議加入 majority vote');
    process.exitCode = 1;
  } else {
    console.log('結論：穩定（平均 std <= 0.1）— 無需 majority vote');
    process.exitCode = 0;
  }
}

main().catch(err => {
  console.error('執行失敗：', err);
  process.exit(1);
});
