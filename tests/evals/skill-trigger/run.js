/**
 * Skill Trigger Eval — 測量 skill description 的觸發精準度
 *
 * 用本地模型作為 proxy judge：
 *   「給定這個任務描述和 skill description，這個 skill 應該被載入嗎？」
 *
 * positive = 應觸發, negative = 不應觸發
 */
import { join } from 'path';
import { homedir } from 'os';
import { calculateMetrics, printReport, requireLlm } from '../eval-runner.js';

await requireLlm('skill-trigger');

const { askLocalModel } = await import(join(homedir(), '.claude/scripts/local-model.js'));
const data = await import('./cases.json');
const { cases, skill_description, skill_name } = data.default ?? data;

const JUDGE_SYSTEM = `你是 skill 觸發判斷器。判斷給定的任務是否應該載入某個 skill。
只回覆 YES 或 NO，不要其他文字。不要思考過程。

判斷標準：
- skill 的 description 中明確涵蓋此任務類型 → YES
- 任務與 skill 無直接關係 → NO
- 模糊邊界 → 偏向 NO（避免不必要的 context 注入）`;

const results = [];
const errors = [];

// 並行跑所有 case
const promises = cases.map(async (c) => {
  const prompt = `Skill: ${skill_name}
Description: ${skill_description}

任務: ${c.task}

這個任務應該載入此 skill 嗎？只回覆 YES 或 NO。`;

  const response = await askLocalModel(prompt, 'NO', null, {
    system: JUDGE_SYSTEM,
    temperature: 0.1,
  });

  const answer = (response || '').trim().toUpperCase();
  const actual = answer.startsWith('YES') ? 'positive' : 'negative';

  return { expected: c.expected, actual, label: c.label, raw: response };
});

const settled = await Promise.all(promises);

for (let i = 0; i < settled.length; i++) {
  const r = settled[i];
  results.push({ expected: r.expected, actual: r.actual });

  if (r.actual !== r.expected) {
    errors.push({
      expected: r.expected,
      actual: r.actual,
      label: `${r.label} (raw: ${r.raw})`,
    });
  }
}

const metrics = printReport(`Skill Trigger [${skill_name}]`, calculateMetrics(results), { errors });
process.exit(metrics.f1 >= 0.9 ? 0 : 1);
