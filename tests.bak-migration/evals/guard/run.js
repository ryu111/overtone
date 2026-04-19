/**
 * Guard Eval — 測量 evaluateBash 的 precision/recall
 *
 * 純函式評估，無需 LLM，毫秒級完成。
 * positive = block（危險）, negative = allow（安全）
 */
import { join } from 'path';
import { homedir } from 'os';
import { calculateMetrics, printReport } from '../eval-runner.js';

const { evaluateBash } = await import(join(homedir(), '.claude/hooks/modules/guards.js'));
const { cases } = await import('./cases.json');

const results = [];
const errors = [];

for (const c of cases) {
  const result = evaluateBash({ tool_input: { command: c.command } });
  const actual = result.decision === 'block' ? 'positive' : 'negative';

  results.push({ expected: c.expected, actual });

  if (actual !== c.expected) {
    errors.push({ expected: c.expected, actual, label: `${c.label}: ${c.command}` });
  }
}

const metrics = printReport('Guard Bash', calculateMetrics(results), { errors });
process.exit(metrics.f1 >= 1.0 ? 0 : 1);
