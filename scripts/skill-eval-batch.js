#!/usr/bin/env bun
/**
 * skill-eval-batch.js — 批次評估所有 skill 的觸發精準度
 *
 * 用法：
 *   bun scripts/skill-eval-batch.js                     # 跑所有 skill
 *   bun scripts/skill-eval-batch.js commit-convention   # 跑單一 skill
 *
 * 流程：對每個 skill
 *   1. 讀取 SKILL.md frontmatter description
 *   2. 用本地模型生成 5 positive + 5 negative cases
 *   3. 用本地模型判斷每個 case 是否應觸發（YES/NO）
 *   4. 計算 F1 分數
 *   5. 輸出排名表，標記 F1 < 0.8 的弱項
 *
 * 注意：序列執行（每個 skill 間隔），避免打爆本地模型
 */

import { join } from 'path';
import { homedir } from 'os';
import { readdirSync, readFileSync, existsSync } from 'fs';

const SKILLS_DIR = join(homedir(), '.claude/skills');
const LOCAL_MODEL = join(homedir(), '.claude/scripts/local-model.js');

const { askLocalModel } = await import(LOCAL_MODEL);

// --- 常數 ---
const CASE_GEN_SYSTEM = `你是 eval case 生成器。根據 skill description，生成測試案例。
每行一個案例，格式嚴格如下，不要任何其他文字：
+: 任務描述
-: 任務描述

只回覆案例行，不要編號、不要解釋、不要標題。`;

const JUDGE_SYSTEM = `你是 skill 觸發判斷器。判斷給定的任務是否應該載入某個 skill。
只回覆 YES 或 NO，不要其他文字。不要思考過程。

判斷標準：
- skill 的 description 中明確涵蓋此任務類型 → YES
- 任務與 skill 無直接關係 → NO
- 模糊邊界 → 偏向 NO（避免不必要的 context 注入）`;

const WEAK_THRESHOLD = 0.8;

// --- 工具函式 ---

/**
 * 解析 YAML-like frontmatter，只取 description 欄位
 * 支援單行和多行帶引號的值
 */
function extractDescription(skillMdContent) {
  const fmMatch = skillMdContent.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const fm = fmMatch[1];

  // 嘗試帶引號的值（單行）
  const quotedMatch = fm.match(/^description:\s*["'](.+?)["']\s*$/m);
  if (quotedMatch) return quotedMatch[1];

  // 嘗試不帶引號的值（單行）
  const plainMatch = fm.match(/^description:\s*(.+)$/m);
  if (plainMatch) {
    const val = plainMatch[1].trim();
    // 去掉首尾引號（如果有）
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      return val.slice(1, -1);
    }
    return val;
  }

  return null;
}

/**
 * 列出 ~/.claude/skills/ 下所有有 SKILL.md 的 skill
 */
function listSkills() {
  const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const skills = [];
  for (const name of dirs) {
    const skillMdPath = join(SKILLS_DIR, name, 'SKILL.md');
    if (!existsSync(skillMdPath)) continue;

    const content = readFileSync(skillMdPath, 'utf-8');
    const description = extractDescription(content);
    if (!description) continue;

    skills.push({ name, description, skillMdPath });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 生成 5 positive + 5 negative cases
 */
async function generateCases(skillName, description) {
  const prompt = `Skill: ${skillName}
Description: ${description}

生成 5 個應該觸發此 skill 的任務描述（positive）和 5 個不應該觸發的（negative）。
每行格式：
+: 任務描述（positive）
-: 任務描述（negative）

共 10 行，5 個 + 開頭，5 個 - 開頭。不要編號、不要其他文字。`;

  const response = await askLocalModel(prompt, null, null, {
    system: CASE_GEN_SYSTEM,
    temperature: 0.5,
  });

  if (!response) return null;

  const cases = [];
  const lines = response.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('+:')) {
      const task = trimmed.slice(2).trim();
      if (task) cases.push({ task, expected: 'positive', label: task });
    } else if (trimmed.startsWith('-:')) {
      const task = trimmed.slice(2).trim();
      if (task) cases.push({ task, expected: 'negative', label: task });
    }
  }

  return cases.length >= 4 ? cases : null;
}

/**
 * 對單一 case 判斷是否應觸發 skill
 */
async function judgeCase(skillName, description, task) {
  const prompt = `Skill: ${skillName}
Description: ${description}

任務: ${task}

這個任務應該載入此 skill 嗎？只回覆 YES 或 NO。`;

  const response = await askLocalModel(prompt, 'NO', null, {
    system: JUDGE_SYSTEM,
    temperature: 0.1,
  });

  const answer = (response || '').trim().toUpperCase();
  return answer.startsWith('YES') ? 'positive' : 'negative';
}

/**
 * 計算分類指標
 */
function calculateMetrics(results) {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const r of results) {
    if (r.expected === 'positive' && r.actual === 'positive') tp++;
    else if (r.expected === 'negative' && r.actual === 'positive') fp++;
    else if (r.expected === 'negative' && r.actual === 'negative') tn++;
    else if (r.expected === 'positive' && r.actual === 'negative') fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  const accuracy = results.length > 0 ? (tp + tn) / results.length : 0;

  return { tp, fp, tn, fn, precision, recall, f1, accuracy, total: results.length };
}

/**
 * 評估單一 skill
 */
async function evalSkill(skill, verbose = false) {
  const { name, description } = skill;
  const startTime = Date.now();

  console.log(`\n[${name}] 生成 cases...`);

  // 生成 cases
  const cases = await generateCases(name, description);
  if (!cases) {
    console.log(`[${name}] 生成 cases 失敗，跳過`);
    return { name, error: '生成失敗', f1: 0 };
  }

  console.log(`[${name}] 生成 ${cases.length} cases，開始判斷...`);

  // 序列判斷每個 case（避免打爆模型）
  const results = [];
  const errors = [];

  for (const c of cases) {
    const actual = await judgeCase(name, description, c.task);
    results.push({ expected: c.expected, actual });

    if (actual !== c.expected) {
      errors.push({ expected: c.expected, actual, label: c.label });
    }

    if (verbose) {
      const mark = actual === c.expected ? '✓' : '✗';
      const type = c.expected === 'positive' ? '+' : '-';
      console.log(`  ${mark} [${type}] ${c.task.slice(0, 60)}`);
    }
  }

  const metrics = calculateMetrics(results);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`[${name}] F1=${(metrics.f1 * 100).toFixed(0)}% (P=${(metrics.precision * 100).toFixed(0)}% R=${(metrics.recall * 100).toFixed(0)}%) ${elapsed}s`);

  if (errors.length > 0 && verbose) {
    console.log(`  錯誤：`);
    for (const e of errors) {
      console.log(`    [${e.expected}→${e.actual}] ${e.label}`);
    }
  }

  return { name, description, metrics, errors, cases };
}

/**
 * 輸出匯總排名表
 */
function printSummary(skillResults) {
  const sorted = [...skillResults]
    .filter(r => r.metrics)
    .sort((a, b) => b.metrics.f1 - a.metrics.f1);

  const failed = skillResults.filter(r => r.error);

  console.log('\n' + '='.repeat(70));
  console.log('  Skill 觸發精準度排名');
  console.log('='.repeat(70));
  console.log(`  ${'Skill'.padEnd(28)} ${'F1'.padStart(6)} ${'P'.padStart(6)} ${'R'.padStart(6)}  狀態`);
  console.log('  ' + '-'.repeat(66));

  for (const r of sorted) {
    const { f1, precision, recall } = r.metrics;
    const f1Pct = (f1 * 100).toFixed(0) + '%';
    const pPct = (precision * 100).toFixed(0) + '%';
    const rPct = (recall * 100).toFixed(0) + '%';
    const status = f1 < WEAK_THRESHOLD ? '⚠ 弱項' : '  OK';
    console.log(`  ${r.name.padEnd(28)} ${f1Pct.padStart(6)} ${pPct.padStart(6)} ${rPct.padStart(6)}  ${status}`);
  }

  if (failed.length > 0) {
    console.log('\n  生成失敗：');
    for (const r of failed) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  console.log('='.repeat(70));

  const weakSkills = sorted.filter(r => r.metrics.f1 < WEAK_THRESHOLD);
  if (weakSkills.length > 0) {
    console.log(`\n  弱項 skill（F1 < ${(WEAK_THRESHOLD * 100).toFixed(0)}%）— description 可能需要改善：`);
    for (const r of weakSkills) {
      console.log(`\n  [${r.name}]`);
      console.log(`    description: ${r.description}`);
      if (r.errors?.length > 0) {
        console.log(`    錯誤案例：`);
        for (const e of r.errors.slice(0, 3)) {
          console.log(`      [${e.expected}→${e.actual}] ${e.label}`);
        }
      }
    }
  } else {
    console.log(`\n  所有 skill F1 >= ${(WEAK_THRESHOLD * 100).toFixed(0)}%`);
  }

  console.log('');

  // 整體平均
  const allF1 = sorted.map(r => r.metrics.f1);
  if (allF1.length > 0) {
    const avgF1 = allF1.reduce((a, b) => a + b, 0) / allF1.length;
    const minF1 = Math.min(...allF1);
    const maxF1 = Math.max(...allF1);
    console.log(`  平均 F1: ${(avgF1 * 100).toFixed(1)}%  最低: ${(minF1 * 100).toFixed(1)}%  最高: ${(maxF1 * 100).toFixed(1)}%`);
    console.log(`  評估 skill 數: ${sorted.length}  失敗: ${failed.length}\n`);
  }
}

// --- 主程式 ---

const args = process.argv.slice(2);
const targetSkill = args[0]; // 可指定單一 skill
const verbose = args.includes('--verbose') || args.includes('-v');

const allSkills = listSkills();
console.log(`掃描到 ${allSkills.length} 個 skill`);

const targetSkills = targetSkill && !targetSkill.startsWith('-')
  ? allSkills.filter(s => s.name === targetSkill)
  : allSkills;

if (targetSkill && !targetSkill.startsWith('-') && targetSkills.length === 0) {
  console.error(`找不到 skill: ${targetSkill}`);
  console.error(`可用的 skill：${allSkills.map(s => s.name).join(', ')}`);
  process.exit(1);
}

console.log(`評估 ${targetSkills.length} 個 skill...`);
const startTotal = Date.now();
const skillResults = [];

// 序列執行（避免打爆本地模型）
for (const skill of targetSkills) {
  const result = await evalSkill(skill, verbose || targetSkills.length === 1);
  skillResults.push(result);
}

const totalElapsed = ((Date.now() - startTotal) / 1000).toFixed(1);
console.log(`\n總耗時: ${totalElapsed}s`);

if (skillResults.length > 1) {
  printSummary(skillResults);
} else if (skillResults.length === 1 && skillResults[0].metrics) {
  // 單一 skill：輸出詳細報告
  const r = skillResults[0];
  const { f1, precision, recall, tp, fp, tn, fn, total } = r.metrics;
  console.log('\n' + '='.repeat(50));
  console.log(`  ${r.name} Eval Report`);
  console.log('='.repeat(50));
  console.log(`  Total cases: ${total}`);
  console.log(`  TP: ${tp} | FP: ${fp} | TN: ${tn} | FN: ${fn}`);
  console.log(`  Precision: ${(precision * 100).toFixed(1)}%`);
  console.log(`  Recall:    ${(recall * 100).toFixed(1)}%`);
  console.log(`  F1 Score:  ${(f1 * 100).toFixed(1)}%`);
  console.log('='.repeat(50));
  console.log(`\nmetric:${f1.toFixed(6)}`);
}
