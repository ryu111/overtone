/**
 * F 級改善建議 prompt Eval（#8）
 *
 * 測量 judge-improvements.js 的 improvementSystem prompt 品質。
 * 對每個 case，讀取元件檔案，用本地模型重新生成建議，
 * 比較建議是否涵蓋 ground truth 的核心問題。
 *
 * 主指標：semantic similarity（本地模型語意判斷，0-1）
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync } from 'fs';
import { requireLlm } from '../eval-runner.js';

const HOME = homedir();

await requireLlm('improvement-prompt');

const localModel = await import(join(HOME, '.claude/scripts/local-model.js'));
const askLocalModelJSON = localModel.askLocalModelJSON;
const askLocalModel = localModel.askLocalModel;

const data = await import('./cases.json');
const { name, variable_file, variable_description, cases } = data.default ?? data;

// improvementSystem prompt（來自 judge-improvements.js）
const BASE_SYSTEM = `你是 Nova 系統的品質改善顧問。

規則：
- issue 格式：「{函式名或區段} + {具體問題}」（如「evaluateEdit 函式因程式碼截斷導致語法錯誤」）
- fix 格式：「{具體修正動作}」（如「補全函式邏輯，確保 if 條件與結尾括號完整」）
- 不接受模糊描述：「結構需要改善」「程式碼品質不佳」
- 最多 3 個，按嚴重度排序：
  1. 安全風險（注入、權限繞過）
  2. 正確性（語法錯誤、截斷、邏輯缺陷）
  3. 可靠性（靜默失敗、缺少錯誤處理）
  4. 完整性（缺少欄位、文件不完整）`;

const TYPE_GUIDANCE = {
  hook: `

Hook 改善重點維度：
- 靜默失敗：catch 區塊是否吞掉錯誤而不通知（空 catch、只 return null）
- 安全風險：字串拼接是否有注入風險（如 AppleScript、SQL）、錯誤時預設放行
- timeout 缺失：await 呼叫是否有 timeout 保護、是否可能無限等待
- 函式未完成：是否有空函式、截斷的邏輯、TODO 標記
- 輸入驗證：是否檢查參數有效性（null/undefined/空字串）
- 錯誤處理：try-catch 是否回傳適當狀態或 emit 事件`,
  rule: `

Rule 改善重點維度：
- frontmatter：是否缺少 name/description/type 元數據
- 規則矛盾：不同章節的指令是否互相衝突（如「自動接續」vs「失敗時暫停」）
- 術語混用：同一概念是否有多個不同稱呼（agent/executor/worker 混用）
- 量化缺失：指令是否只有定性描述而缺乏具體閾值或數字
- 執行歧義：MUST/NEVER 指令是否足夠明確可執行
- 結構完整：是否有條件、動作、例外的完整格式`,
  skill: `

Skill 改善重點維度：
- 內容截斷：文件是否不完整、段落突然結束
- 語意映射：參數或概念是否有清楚的解釋和使用場景
- 決策樹完整：判斷流程是否有遺漏分支或缺乏量化閾值
- 知識深度：是否只有表面描述而缺乏實作細節
- 引用完整：參考路徑是否存在且正確`,
};

function getImprovementSystem(type) {
  return BASE_SYSTEM + (TYPE_GUIDANCE[type] || '') + '\n\n只回覆 JSON 陣列。';
}

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

import { semanticScore as _semanticScore } from '../semantic-judge.js';

// 覆寫 semanticScore：用 500 字窗口取代預設 200 字，讓更多建議被比較
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
 * 計算生成建議對 ground truth 的語意覆蓋率
 * 對每條 ground truth suggestion，找生成建議中最相似的，取最佳匹配分數
 */
async function calculateCoverage(generated, groundTruth) {
  if (!generated || generated.length === 0) return 0;
  if (!groundTruth || groundTruth.length === 0) return 1;

  const genText = generated.join('\n');
  const gtText = groundTruth.join('\n');

  return await semanticScore(genText, gtText);
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
    system: getImprovementSystem(c.type),
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

  const coverage = await calculateCoverage(suggestions, c.ground_truth_suggestions);

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

const results = [];
for (const c of cases) {
  results.push(await evaluateCase(c));
}

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
