/**
 * Feedback Loop Skill 品質 Eval
 *
 * 測量 feedback-loop SKILL.md 的場景覆蓋率。
 * 對每個 case，檢查 Skill 內容是否涵蓋該場景的關鍵概念。
 *
 * 混合評分：
 * - 關鍵詞命中率（50%）：expected_keywords 在 SKILL.md 中出現的比例
 * - 語意覆蓋率（50%）：用本地模型判斷場景描述 vs Skill 相關段落的語意匹配
 *
 * 主指標：加權平均覆蓋率（0-1）
 */

import { join } from 'path';
import { homedir } from 'os';
import { readFileSync } from 'fs';
import { requireLlm } from '../eval-runner.js';

const HOME = homedir();

await requireLlm('feedback-loop');

const localModel = await import(join(HOME, '.claude/scripts/local-model.js'));
const askLocalModel = localModel.askLocalModel;

const data = await import('./cases.json');
const { name, variable_file, variable_description, cases } = data.default ?? data;

// 讀取 Skill 內容
const skillPath = join(HOME, '.claude/skills/feedback-loop/SKILL.md');
const skillContent = readFileSync(skillPath, 'utf-8');

// 語意比較（800 字窗口）
async function semanticScore(text, groundTruth) {
  if (!text || !groundTruth) return 0;
  const JUDGE_SYSTEM = `你是 Skill 覆蓋率裁判。判斷 Skill 文件是否包含針對給定場景的具體指引。
只回覆一個數字 0-5：
0 = Skill 完全沒提到這個場景
1 = Skill 提到相關主題但沒有具體指引
2 = Skill 有相關原則但沒有針對此場景的步驟
3 = Skill 有流程或規則涵蓋此場景，但缺少具體範例
4 = Skill 有流程 + 規則 + 反例涵蓋此場景
5 = Skill 有完整的流程 + 規則 + 範例 + 反模式涵蓋此場景
只回覆數字，不要其他文字。`;

  const prompt = `場景：${text.slice(0, 300)}

Skill 內容：${groundTruth.slice(0, 500)}

覆蓋程度（0-5）：`;

  const result = await askLocalModel(prompt, '0', null, {
    system: JUDGE_SYSTEM,
    temperature: 0.1,
  });
  const score = parseInt((result || '0').trim().match(/\d/)?.[0] || '0', 10);
  return Math.min(score, 5) / 5;
}

/**
 * 從 Skill 內容中提取與場景最相關的 500 字（滑動窗口 + 關鍵詞密度）
 */
function extractRelevantSection(content, protocolName, keywords) {
  // 先嘗試按 protocol 名稱找段落
  const sections = content.split(/###\s+\d+\.\s+/);
  for (const section of sections) {
    if (section.includes(protocolName)) {
      return section.slice(0, 800);
    }
  }
  // fallback: 用關鍵詞滑動窗口找最相關的 500 字
  if (keywords && keywords.length > 0) {
    let bestStart = 0;
    let bestScore = 0;
    const lower = content.toLowerCase();
    for (let i = 0; i < content.length - 500; i += 100) {
      const window = lower.slice(i, i + 500);
      let score = 0;
      for (const kw of keywords) {
        if (window.includes(kw.toLowerCase())) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestStart = i;
      }
    }
    if (bestScore > 0) return content.slice(bestStart, bestStart + 500);
  }
  return content.slice(0, 800);
}

/**
 * 計算關鍵詞命中率
 */
function keywordHitRate(content, keywords) {
  if (!keywords || keywords.length === 0) return 1;
  const lowerContent = content.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (lowerContent.includes(kw.toLowerCase())) hits++;
  }
  return hits / keywords.length;
}

/**
 * 對單一 case 評估
 */
async function evaluateCase(c) {
  const section = extractRelevantSection(skillContent, c.expected_protocol, c.expected_keywords);

  // 50% 關鍵詞命中
  const kwScore = keywordHitRate(skillContent, c.expected_keywords);

  // 50% 語意覆蓋（場景 + 期望行動 vs Skill 段落）
  const scenarioText = `${c.scenario} → ${c.expected_action}`;
  const semScore = await semanticScore(scenarioText, section);

  const combined = kwScore * 0.5 + semScore * 0.5;

  return {
    label: c.label,
    coverage: combined,
    kwScore,
    semScore,
    skipped: false,
  };
}

// 執行
console.log(`\n執行 ${name} Eval（${cases.length} 個 cases）...`);
console.log(`variable: ${variable_file}`);
console.log(`variable_description: ${variable_description}\n`);

const results = [];
for (const c of cases) {
  results.push(await evaluateCase(c));
}

// 計算指標
const validResults = results.filter((r) => !r.skipped);
const totalCoverage = validResults.reduce((sum, r) => sum + r.coverage, 0);
const avgCoverage = validResults.length > 0 ? totalCoverage / validResults.length : 0;

// 報告
console.log('='.repeat(55));
console.log(`  ${name} Eval Report`);
console.log('='.repeat(55));
console.log(`  Total cases:    ${cases.length}`);
console.log(`  Valid cases:    ${validResults.length}`);
console.log(`  Avg coverage:   ${(avgCoverage * 100).toFixed(1)}%`);
console.log(`  Avg keyword:    ${(validResults.reduce((s, r) => s + r.kwScore, 0) / validResults.length * 100).toFixed(1)}%`);
console.log(`  Avg semantic:   ${(validResults.reduce((s, r) => s + r.semScore, 0) / validResults.length * 100).toFixed(1)}%`);
console.log();

// 列出所有 case 的分數
for (const r of validResults) {
  console.log(`  [${(r.coverage * 100).toFixed(0)}%] ${r.label} (kw=${(r.kwScore * 100).toFixed(0)}% sem=${(r.semScore * 100).toFixed(0)}%)`);
}

console.log('='.repeat(55));
console.log();

// 機器可讀指標
console.log(`metric:${avgCoverage.toFixed(6)}`);
