import { describe, test, expect } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';

const { evaluateBash: evaluate } = await import(join(homedir(), '.claude/hooks/modules/guards.js'));

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

  describe('旗標分離繞過防護', () => {
    const bypassCases = [
      ['rm -f -r /tmp', '旗標分離 -f -r'],
      ['rm -r -f /tmp', '旗標反序 -r -f'],
      ['rm  -rf /tmp', '多空格'],
      ['rm --recursive --force /tmp', '長旗標'],
      ['rm --force --recursive /tmp', '長旗標反序'],
      ['rm -r -f -v /tmp', '混合旗標 -r -f -v'],
    ];

    for (const [command, label] of bypassCases) {
      test(`阻擋 ${label}: ${command}`, () => {
        const result = evaluate({ tool_input: { command } });
        expect(result.decision).toBe('block');
      });
    }

    test('放行 rm -r（無 -f）', () => {
      const result = evaluate({ tool_input: { command: 'rm -r /tmp/test' } });
      expect(result.decision).toBe('allow');
    });

    test('放行 rm -f file.txt（無 -r）', () => {
      const result = evaluate({ tool_input: { command: 'rm -f file.txt' } });
      expect(result.decision).toBe('allow');
    });
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
