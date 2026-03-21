/**
 * 行為分類 prompt Eval（#3）
 *
 * 測量 learner-suggestions.js 的分類 system prompt 準確度。
 * 對 polarity=1 的行為，LLM 分類成 rule/automation/skill；
 * 對 polarity=-1 的行為，程式碼固定輸出 fix。
 *
 * 主指標：accuracy（exact match）
 */

import { join } from 'path';
import { homedir } from 'os';

const HOME = homedir();

// 讀取 learner-suggestions.js 的 askLocalModel 和分類邏輯
const { stripThinking } = await import(join(HOME, '.claude/scripts/learner-suggestions.js'));
const localModel = await import(join(HOME, '.claude/scripts/local-model.js'));
const askLocalModel = localModel.askLocalModel;

const data = await import('./cases.json');
const { name, variable_file, variable_description, cases } = data.default ?? data;

// 分類 system prompt（來自 learner-suggestions.js generateSuggestions）
const CLASSIFY_SYSTEM = `你是 Nova 系統的行為分析器。判斷反覆出現的開發行為應固化為 Rule、腳本或 Skill。Rule：每次都需遵守的行為規範。腳本：可自動化的重複操作。Skill：領域知識。只回覆一行：數字 + 理由。`;

/**
 * 對單一 case 執行分類，回傳預測的 type
 */
async function classifyBehavior(c) {
  // polarity=-1 的行為固定是 fix（由程式碼決定，非 LLM）
  if (c.polarity === -1) {
    return 'fix';
  }

  // polarity=1 — 使用 LLM 分類（同 generateSuggestions 邏輯）
  const prompt = `以下是一個在開發過程中反覆出現的行為模式：

模式：${c.pattern}
出現次數：${c.occurrences}
時間跨度：${c.firstSeen} ~ ${c.lastSeen}

這個模式應該固化為什麼？選一個：
1. Rule（行為規範，寫入 rules/*.md）
2. 自動化腳本（寫入 scripts/）
3. Skill 知識（寫入 skills/）

只回覆一行：數字 + 簡述理由。`;

  const rawResult = await askLocalModel(prompt, '1. 建議固化為 Rule', null, {
    system: CLASSIFY_SYSTEM,
    temperature: 0.1,
  });

  const result = stripThinking(rawResult);

  // 同 generateSuggestions 的解析邏輯
  if (result?.includes('2')) return 'automation';
  if (result?.includes('3')) return 'skill';
  return 'rule';
}

// 並行跑所有 case
console.log(`\n執行 ${name} Eval（${cases.length} 個 cases）...`);
console.log(`variable: ${variable_file}`);
console.log(`variable_description: ${variable_description}\n`);

const results = await Promise.all(
  cases.map(async (c) => {
    const predicted = await classifyBehavior(c);
    return {
      label: c.label,
      pattern: c.pattern,
      polarity: c.polarity,
      expected: c.expected_type,
      actual: predicted,
      correct: predicted === c.expected_type,
    };
  })
);

// 計算指標
const total = results.length;
const correct = results.filter((r) => r.correct).length;
const accuracy = total > 0 ? correct / total : 0;

// 分組統計（polarity=1 的 LLM 分類 vs polarity=-1 的 code 決定）
const posResults = results.filter((r) => r.polarity === 1);
const negResults = results.filter((r) => r.polarity === -1);
const posCorrect = posResults.filter((r) => r.correct).length;
const negCorrect = negResults.filter((r) => r.correct).length;

// 報告
console.log('='.repeat(50));
console.log(`  ${name} Eval Report`);
console.log('='.repeat(50));
console.log(`  Total cases:  ${total}`);
console.log(`  Correct:      ${correct}`);
console.log(`  Accuracy:     ${(accuracy * 100).toFixed(1)}%`);
console.log();
console.log(`  polarity=+1（LLM 分類）: ${posCorrect}/${posResults.length}`);
console.log(`  polarity=-1（code 固定）: ${negCorrect}/${negResults.length}`);

const errors = results.filter((r) => !r.correct);
if (errors.length > 0) {
  console.log(`\n  分類錯誤 (${errors.length}):`);
  for (const e of errors) {
    console.log(`    [期望:${e.expected} → 實際:${e.actual}] ${e.label} (${e.pattern})`);
  }
}

console.log('='.repeat(50));
console.log();

// 輸出機器可讀指標（供 autoresearch loop 使用）
console.log(`metric:${accuracy.toFixed(6)}`);
