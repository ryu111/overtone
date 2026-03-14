import { describe, test, expect } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';

const { evaluateEdit: evaluate } = await import(join(homedir(), '.claude/hooks/modules/guards.js'));

const CLAUDE_DIR = join(homedir(), '.claude');

describe('pre-edit-guard', () => {
  describe('保護路徑阻擋', () => {
    const protectedCases = [
      [`${CLAUDE_DIR}/CLAUDE.md`, 'CLAUDE.md'],
      [`${CLAUDE_DIR}/settings.json`, 'settings.json'],
      [`${CLAUDE_DIR}/agents/planner.md`, 'agents/'],
      [`${CLAUDE_DIR}/agents/executor.md`, 'agents/'],
      [`${CLAUDE_DIR}/skills/testing/SKILL.md`, 'skills/'],
      [`${CLAUDE_DIR}/hooks/scripts/tool/guard.js`, 'hooks/'],
      [`${CLAUDE_DIR}/commands/auto.md`, 'commands/'],
    ];

    for (const [filePath, label] of protectedCases) {
      test(`阻擋 ${label} 路徑`, () => {
        const result = evaluate({ tool_input: { file_path: filePath } });
        expect(result.decision).toBe('block');
        expect(result.reason).toContain('保護');
      });
    }
  });

  describe('一般路徑放行', () => {
    const allowedCases = [
      '/Users/sbu/projects/overtone/src/index.js',
      '/tmp/test.txt',
      `${CLAUDE_DIR}/projects/test/state.json`,
      `${CLAUDE_DIR}/memory/MEMORY.md`,
    ];

    for (const filePath of allowedCases) {
      test(`放行 ${filePath}`, () => {
        const result = evaluate({ tool_input: { file_path: filePath } });
        expect(result.decision).toBe('allow');
      });
    }
  });

  describe('邊界情況', () => {
    test('空 input', () => {
      expect(evaluate({}).decision).toBe('allow');
    });

    test('null file_path', () => {
      expect(evaluate({ tool_input: { file_path: null } }).decision).toBe('allow');
    });
  });
});
