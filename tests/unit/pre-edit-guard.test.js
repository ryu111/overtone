import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';

const { evaluateEdit: evaluate } = await import(join(homedir(), '.claude/hooks/modules/guards.js'));

const CLAUDE_DIR = join(homedir(), '.claude');

// HARD GATE 需要 routing file 才能放行非 query 操作
// 測試環境中 cwd 未設定，projName 為 "unknown"
const ROUTING_FILE = '/tmp/nova-routing-level-unknown.txt';

describe('pre-edit-guard', () => {
  beforeAll(() => { writeFileSync(ROUTING_FILE, 'D1'); });
  afterAll(() => { try { unlinkSync(ROUTING_FILE); } catch {} });
  describe('保護路徑阻擋', () => {
    const protectedCases = [
      [`${CLAUDE_DIR}/CLAUDE.md`, 'CLAUDE.md'],
      [`${CLAUDE_DIR}/settings.json`, 'settings.json'],
      [`${CLAUDE_DIR}/remote.env`, 'remote.env'],
      [`${CLAUDE_DIR}/biome.json`, 'biome.json'],
      [`${CLAUDE_DIR}/package.json`, 'package.json'],
      [`${CLAUDE_DIR}/agents/planner.md`, 'agents/'],
      [`${CLAUDE_DIR}/agents/executor.md`, 'agents/'],
      [`${CLAUDE_DIR}/skills/testing/SKILL.md`, 'skills/'],
      [`${CLAUDE_DIR}/hooks/scripts/tool/guard.js`, 'hooks/'],
      [`${CLAUDE_DIR}/commands/auto.md`, 'commands/'],
      [`${CLAUDE_DIR}/data/behaviors.jsonl`, 'data/'],
      [`${CLAUDE_DIR}/data/scores.jsonl`, 'data/'],
      [`${CLAUDE_DIR}/data/decision-log.jsonl`, 'data/'],
    ];

    for (const [filePath, label] of protectedCases) {
      test(`阻擋 ${label} 路徑`, () => {
        const result = evaluate({ tool_input: { file_path: filePath } });
        expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
        expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('保護');
      });
    }
  });

  describe('一般路徑放行', () => {
    const allowedCases = [
      '/Users/sbu/projects/nova-brain/src/index.js',
      '/tmp/test.txt',
      `${CLAUDE_DIR}/projects/test/state.json`,
      `${CLAUDE_DIR}/memory/MEMORY.md`,
    ];

    for (const filePath of allowedCases) {
      test(`放行 ${filePath}`, () => {
        const result = evaluate({ tool_input: { file_path: filePath } });
        expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
      });
    }
  });

  describe('邊界情況', () => {
    test('空 input', () => {
      expect(evaluate({}).hookSpecificOutput?.permissionDecision).toBe('allow');
    });

    test('null file_path', () => {
      expect(evaluate({ tool_input: { file_path: null } }).hookSpecificOutput?.permissionDecision).toBe('allow');
    });
  });

  describe('寫入內容安全檢查', () => {
    const dangerousCases = [
      ['eval(code)', 'eval('],
      ['new Function("return 1")', 'new Function('],
      ['dangerouslySetInnerHTML={{ __html: x }}', 'dangerouslySetInnerHTML'],
      ['el.innerHTML = userInput', 'innerHTML ='],
      ['document.write(data)', 'document.write('],
      ['child_process.exec(cmd)', 'child_process.exec('],
      ['os.system("rm -rf /")', 'os.system('],
      ['from os import system', 'from os import system'],
      ['pickle.load(f)', 'pickle.load'],
    ];

    for (const [content, label] of dangerousCases) {
      test(`阻擋危險內容：${label}`, () => {
        const result = evaluate({
          tool_input: { file_path: '/tmp/test.js', new_string: content },
        });
        expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
        expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('危險');
      });
    }

    test('Write tool content 也檢查', () => {
      const result = evaluate({
        tool_input: { file_path: '/tmp/test.js', content: 'eval(code)' },
      });
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    });

    test('排除 hooks/modules/ 路徑', () => {
      const result = evaluate({
        tool_input: {
          file_path: `${CLAUDE_DIR}/hooks/modules/test.js`,
          new_string: 'child_process.exec(cmd)',
        },
      });
      // hooks/modules/ 下的檔案會被 PROTECTED_PATHS 的 hooks/ 規則阻擋，
      // 但阻擋原因是路徑保護而非內容安全
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
      expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('保護');
    });

    test('安全內容放行', () => {
      const result = evaluate({
        tool_input: { file_path: '/tmp/test.js', new_string: 'console.log("hello")' },
      });
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
    });

    test('空 content 放行', () => {
      const result = evaluate({
        tool_input: { file_path: '/tmp/test.js', new_string: '' },
      });
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
    });
  });
});
