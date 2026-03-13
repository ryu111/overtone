import { describe, test, expect } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';

const { evaluate } = await import(join(homedir(), '.claude/hooks/scripts/tool/pre-bash-guard.js'));

describe('pre-bash-guard', () => {
  describe('危險命令阻擋', () => {
    const dangerousCases = [
      ['rm -rf /', 'rm -rf'],
      ['rm -fr /tmp', 'rm -fr'],
      ['rm --no-preserve-root /', 'rm --no-preserve-root'],
      ['killall node', 'killall'],
      ['kill -9 -1', 'kill -9 -1'],
      ['git push --force origin main', 'git push --force'],
      ['git push -f origin main', 'git push -f'],
      ['git reset --hard HEAD~3', 'git reset --hard'],
      ['git clean -fd', 'git clean -f'],
      ['mkfs.ext4 /dev/sda1', 'mkfs'],
      ['dd if=/dev/zero of=/dev/sda', 'dd of=/dev/'],
      ['chmod -R 777 /', 'chmod -R 777'],
      ['chown -R root:root /', 'chown -R root'],
      ['unset PATH', 'unset PATH'],
    ];

    for (const [command, label] of dangerousCases) {
      test(`阻擋 ${label}`, () => {
        const result = evaluate({ tool_input: { command } });
        expect(result.decision).toBe('block');
        expect(result.reason).toContain('危險命令被阻擋');
      });
    }
  });

  describe('安全命令放行', () => {
    const safeCases = [
      'ls -la',
      'git status',
      'git push origin main',
      'rm file.txt',
      'npm install',
      'bun test',
      'echo "hello"',
      'cat ~/.claude/CLAUDE.md',
    ];

    for (const command of safeCases) {
      test(`放行 ${command}`, () => {
        const result = evaluate({ tool_input: { command } });
        expect(result.decision).toBe('allow');
      });
    }
  });

  describe('邊界情況', () => {
    test('空 input', () => {
      expect(evaluate({}).decision).toBe('allow');
    });

    test('null command', () => {
      expect(evaluate({ tool_input: { command: null } }).decision).toBe('allow');
    });

    test('undefined tool_input', () => {
      expect(evaluate({ tool_input: undefined }).decision).toBe('allow');
    });
  });
});
