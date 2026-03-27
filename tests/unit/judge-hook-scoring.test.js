import { describe, test, expect } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';

const { scoreDeterministic } = await import(join(homedir(), '.claude/scripts/judge.js'));

describe('judge hook scoring', () => {
  const modulesDir = join(homedir(), '.claude/hooks/modules');

  test('guards.js 確定性分 = 40', () => {
    const score = scoreDeterministic(join(modulesDir, 'guards.js'), 'hook');
    // export(10) + on handler(10) + try-catch(10) + 行數(0，>200行) + 無 console.log(10)
    expect(score).toBe(40);
  });

  test('notification.js 確定性分 = 40', () => {
    const score = scoreDeterministic(join(modulesDir, 'notification.js'), 'hook');
    // export(10) + on handler(10) + lifecycle export(10) + 行數(10)
    expect(score).toBe(40);
  });

  test('metrics.js（utility 模組）確定性分 = 50', () => {
    const score = scoreDeterministic(join(modulesDir, 'metrics.js'), 'hook');
    // export(10) + createMetrics factory(10) + try-catch(10) + 行數 10-300(10) + 無 console.log(10) = 50
    expect(score).toBe(50);
  });

  test('flow-observer.js 有 on handler 得分', () => {
    const score = scoreDeterministic(join(modulesDir, 'flow-observer.js'), 'hook');
    expect(score).toBeGreaterThanOrEqual(40);
  });

  test('context-injector.js 有 on handler 得分', () => {
    const score = scoreDeterministic(join(modulesDir, 'context-injector.js'), 'hook');
    expect(score).toBeGreaterThanOrEqual(40);
  });
});
