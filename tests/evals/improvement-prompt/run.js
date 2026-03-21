/**
 * F 級改善建議 prompt Eval（#8）
 *
 * 測量 judge-improvements.js 的 improvementSystem prompt 品質。
 * 對每個 case，讀取元件檔案，用本地模型重新生成建議，
 * 比較建議是否涵蓋 ground truth 的核心問題。
 *
 * 主指標：coverage（生成建議涵蓋 ground truth 關鍵詞的比例）
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync } from 'fs';

const HOME = homedir();

const localModel = await import(join(HOME, '.claude/scripts/local-model.js'));
const askLocalModelJSON = localModel.askLocalModelJSON;

const data = await import('./cases.json');
const { name, variable_file, variable_description, cases } = data.default ?? data;

// improvementSystem prompt（來自 judge-improvements.js）
const IMPROVEMENT_SYSTEM = `你是 Nova 系統的品質改善顧問。

規則：
- issue 必須具體指出程式碼中的問題位置（檔名、函式名、行為）
- fix 必須是可執行的修正步驟，不是建議
- 範例好 issue：「frontmatter 缺少 description 欄位」
- 範例差 issue：「結構需要改善」
- 最多 3 個，按嚴重度排序

只回覆 JSON 陣列。`;

/**
 * 讀取元件檔案內容（最多 2000 字）
 */
function readComponentContent(path, type) {
  try {
    const filePath =
      type === 'skill'
        ? join(HOME, '.claude', path, 'SKILL.md')
        : join(HOME, '.claude', path);

    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, 'utf-8').slice(0, 2000);
  } catch {
    return null;
  }
}

/**
 * 從 ground truth suggestions 提取核心關鍵詞
 * 每條 suggestion 取前 2 個中文實質詞（排除常見停用詞）
 */
function extractKeywords(suggestions) {
  const stopWords = new Set(['的', '了', '在', '是', '都', '有', '和', '與', '或', '但', '而', '等', '及', '並', '且']);
  const keywords = [];

  for (const s of suggestions) {
    // 去掉開頭的 "- " 前綴
    const text = s.replace(/^[-\s]+/, '');

    // 提取前 15 個字的核心詞（冒號前的問題描述）
    const mainPart = text.split('：')[0] || text;
    const words = mainPart.slice(0, 20).split('').filter(c => /[\u4e00-\u9fff]/.test(c) && !stopWords.has(c));
    if (words.length >= 3) {
      // 取前 3 個字組成關鍵詞
      keywords.push(words.slice(0, 3).join(''));
    }
  }

  return keywords;
}

/**
 * 計算生成建議對 ground truth 的覆蓋率
 * 策略：ground truth 中每個關鍵詞，看是否出現在生成的建議中
 */
function calculateCoverage(generated, groundTruth) {
  if (!generated || generated.length === 0) return 0;
  if (!groundTruth || groundTruth.length === 0) return 1;

  const gtKeywords = extractKeywords(groundTruth);
  if (gtKeywords.length === 0) return 0;

  const generatedText = generated.join(' ');
  let hits = 0;

  for (const kw of gtKeywords) {
    if (generatedText.includes(kw)) {
      hits++;
    }
  }

  return hits / gtKeywords.length;
}

/**
 * 對單一 case 生成改善建議，回傳覆蓋率
 */
async function evaluateCase(c) {
  const content = readComponentContent(c.path, c.type);
  if (!content) {
    return { label: c.label, coverage: 0, skipped: true, reason: '找不到元件檔案' };
  }

  const detScore = 25; // eval 中使用固定值
  const semScore = 25;
  const weakSide = c.weakDimension || '語意（知識深度/清晰度）';

  const prompt = `以下元件品質評分為 F（${c.score}/100），需要改善。

類型：${c.type}
路徑：${c.path}
確定性分數：${detScore}/50
語意分數：${semScore}/50
改善重點：${weakSide}

內容前 2000 字：
${content}

回覆 JSON 陣列，最多 3 個：[{"issue":"具體問題","fix":"具體修正"},...]`;

  const parsed = await askLocalModelJSON(prompt, null, null, {
    system: IMPROVEMENT_SYSTEM,
    temperature: 0.2,
  });

  if (!parsed) {
    return { label: c.label, coverage: 0, skipped: false, reason: '模型無回應' };
  }

  let suggestions = [];
  try {
    const arr = Array.isArray(parsed) ? parsed : null;
    if (arr) {
      suggestions = arr
        .filter((s) => s.issue && s.fix)
        .slice(0, 3)
        .map((s) => `- ${s.issue}：${s.fix}`);
    }
  } catch {
    return { label: c.label, coverage: 0, skipped: false, reason: '解析失敗' };
  }

  const coverage = calculateCoverage(suggestions, c.ground_truth_suggestions);

  return {
    label: c.label,
    path: c.path,
    type: c.type,
    coverage,
    skipped: false,
    generatedCount: suggestions.length,
    groundTruthCount: c.ground_truth_suggestions.length,
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
const totalCoverage = validResults.reduce((sum, r) => sum + r.coverage, 0);
const avgCoverage = validResults.length > 0 ? totalCoverage / validResults.length : 0;

// 分組統計（按 type）
const byType = {};
for (const r of validResults) {
  const t = r.type || 'unknown';
  if (!byType[t]) byType[t] = { total: 0, coverage: 0 };
  byType[t].total++;
  byType[t].coverage += r.coverage;
}

// 報告
console.log('='.repeat(55));
console.log(`  ${name} Eval Report`);
console.log('='.repeat(55));
console.log(`  Total cases:    ${cases.length}`);
console.log(`  Valid cases:    ${validResults.length}`);
console.log(`  Skipped:        ${skipped.length}`);
console.log(`  Avg coverage:   ${(avgCoverage * 100).toFixed(1)}%`);
console.log();

for (const [type, stats] of Object.entries(byType)) {
  const avg = stats.coverage / stats.total;
  console.log(`  ${type}: ${(avg * 100).toFixed(1)}% avg coverage (${stats.total} cases)`);
}

const lowCoverage = validResults.filter((r) => r.coverage < 0.3);
if (lowCoverage.length > 0) {
  console.log(`\n  低覆蓋率 case (${lowCoverage.length}):`);
  for (const r of lowCoverage) {
    console.log(`    [${(r.coverage * 100).toFixed(0)}%] ${r.label}`);
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
console.log(`metric:${avgCoverage.toFixed(6)}`);
