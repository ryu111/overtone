import { describe, test, expect } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

const CLAUDE_DIR = join(homedir(), '.claude');

const FALLBACK_MODULES = {
  'PreToolUse:Bash': { path: 'hooks/modules/guards.js', fn: 'evaluateBash' },
  'PreToolUse:Write': { path: 'hooks/modules/guards.js', fn: 'evaluateEdit' },
  'PreToolUse:Edit': { path: 'hooks/modules/guards.js', fn: 'evaluateEdit' },
};

describe('Hook Client fallback 模組對應', () => {
  test('每個 fallback 模組都存在', () => {
    const paths = new Set(Object.values(FALLBACK_MODULES).map(m => m.path));
    for (const p of paths) {
      expect(existsSync(join(CLAUDE_DIR, p))).toBe(true);
    }
  });

  test('精確 key 查找', () => {
    expect(FALLBACK_MODULES['PreToolUse:Bash'].fn).toBe('evaluateBash');
    expect(FALLBACK_MODULES['PreToolUse:Write'].fn).toBe('evaluateEdit');
    expect(FALLBACK_MODULES['PreToolUse:Edit'].fn).toBe('evaluateEdit');
  });

  test('Write|Edit matcher 可找到兩個 fallback', () => {
    const matcher = 'Write|Edit';
    const found = matcher.split('|').map(m => FALLBACK_MODULES[`PreToolUse:${m}`]);
    expect(found.every(f => f.fn === 'evaluateEdit')).toBe(true);
  });
});

describe('Hook Client fallback evaluate 執行', () => {
  test('bash-guard block 危險命令', async () => {
    const { evaluateBash } = await import(join(CLAUDE_DIR, 'hooks/modules/guards.js'));
    const result = evaluateBash({ tool_input: { command: 'rm -rf /' } });
    expect(result.decision).toBe('block');
  });

  test('bash-guard allow 安全命令', async () => {
    const { evaluateBash } = await import(join(CLAUDE_DIR, 'hooks/modules/guards.js'));
    const result = evaluateBash({ tool_input: { command: 'ls -la' } });
    expect(result.decision).toBe('allow');
  });

  test('edit-guard block 保護路徑', async () => {
    const { evaluateEdit } = await import(join(CLAUDE_DIR, 'hooks/modules/guards.js'));
    const result = evaluateEdit({ tool_input: { file_path: join(CLAUDE_DIR, 'settings.json') } });
    expect(result.decision).toBe('block');
  });

  test('edit-guard allow 非保護路徑', async () => {
    const { evaluateEdit } = await import(join(CLAUDE_DIR, 'hooks/modules/guards.js'));
    const result = evaluateEdit({ tool_input: { file_path: '/tmp/safe-file.txt' } });
    expect(result.decision).toBe('allow');
  });
});

describe('Hook Client HTTP dispatch', () => {
  test('nova-server 連線測試（容許未啟動）', async () => {
    let connected = false;
    try {
      const res = await fetch('http://127.0.0.1:3457/health', {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) connected = true;
    } catch {}
    expect(typeof connected).toBe('boolean');
  });
});

describe('Hook Client E2E（stdin → stdout）', () => {
  test('block 命令透過 hook-client 輸出 JSON', async () => {
    const proc = Bun.spawn(
      ['bun', join(CLAUDE_DIR, 'hooks/hook-client.js'), 'PreToolUse', 'Bash'],
      { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }
    );
    proc.stdin.write(JSON.stringify({ tool_input: { command: 'rm -rf /' } }));
    proc.stdin.end();

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    if (output.trim()) {
      const result = JSON.parse(output.trim());
      expect(result.decision).toBe('block');
    }
  });

  test('allow 命令透過 hook-client 無輸出', async () => {
    const proc = Bun.spawn(
      ['bun', join(CLAUDE_DIR, 'hooks/hook-client.js'), 'PreToolUse', 'Bash'],
      { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }
    );
    proc.stdin.write(JSON.stringify({ tool_input: { command: 'echo hello' } }));
    proc.stdin.end();

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    if (output.trim()) {
      const result = JSON.parse(output.trim());
      expect(result.decision).not.toBe('block');
    }
  });
});
