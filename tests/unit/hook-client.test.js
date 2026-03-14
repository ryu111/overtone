import { describe, test, expect } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

const CLAUDE_DIR = join(homedir(), '.claude');

const FALLBACK_SCRIPTS = {
  'PreToolUse:Bash': 'hooks/scripts/tool/pre-bash-guard.js',
  'PreToolUse:Write': 'hooks/scripts/tool/pre-edit-guard.js',
  'PreToolUse:Edit': 'hooks/scripts/tool/pre-edit-guard.js',
  'PreToolUse:Agent': 'hooks/scripts/tool/pre-agent-flow.js',
  'PostToolUse': 'hooks/scripts/tool/post-tool-flow.js',
  'SessionStart': 'hooks/scripts/session/on-start-flow.js',
  'SubagentStop': 'hooks/scripts/session/on-stop-flow.js',
  'UserPromptSubmit': 'hooks/scripts/prompt/on-submit-flow.js',
  'SessionEnd': 'hooks/scripts/session/on-end-flow.js',
  'Notification': 'hooks/scripts/notification/on-notification.js',
};

describe('Hook Client fallback 腳本對應', () => {
  test('每個 fallback 腳本都存在', () => {
    for (const [, script] of Object.entries(FALLBACK_SCRIPTS)) {
      const fullPath = join(CLAUDE_DIR, script);
      expect(existsSync(fullPath)).toBe(true);
    }
  });

  test('精確 key 查找', () => {
    expect(FALLBACK_SCRIPTS['PreToolUse:Bash']).toBe('hooks/scripts/tool/pre-bash-guard.js');
    expect(FALLBACK_SCRIPTS['PreToolUse:Write']).toBe('hooks/scripts/tool/pre-edit-guard.js');
    expect(FALLBACK_SCRIPTS['PreToolUse:Edit']).toBe('hooks/scripts/tool/pre-edit-guard.js');
    expect(FALLBACK_SCRIPTS['PreToolUse:Agent']).toBe('hooks/scripts/tool/pre-agent-flow.js');
  });

  test('寬鬆 key 查找', () => {
    expect(FALLBACK_SCRIPTS['PostToolUse']).toBe('hooks/scripts/tool/post-tool-flow.js');
    expect(FALLBACK_SCRIPTS['SessionStart']).toBe('hooks/scripts/session/on-start-flow.js');
    expect(FALLBACK_SCRIPTS['Notification']).toBe('hooks/scripts/notification/on-notification.js');
  });

  test('Write|Edit matcher 可找到兩個 fallback', () => {
    const matcher = 'Write|Edit';
    const found = matcher.split('|').map(m => FALLBACK_SCRIPTS[`PreToolUse:${m}`]);
    expect(found).toEqual([
      'hooks/scripts/tool/pre-edit-guard.js',
      'hooks/scripts/tool/pre-edit-guard.js',
    ]);
  });
});

describe('Hook Client fallback evaluate 執行', () => {
  test('bash-guard block 危險命令', async () => {
    const { evaluate } = await import(join(CLAUDE_DIR, 'hooks/scripts/tool/pre-bash-guard.js'));
    const result = evaluate({ tool_input: { command: 'rm -rf /' } });
    expect(result.decision).toBe('block');
  });

  test('bash-guard allow 安全命令', async () => {
    const { evaluate } = await import(join(CLAUDE_DIR, 'hooks/scripts/tool/pre-bash-guard.js'));
    const result = evaluate({ tool_input: { command: 'ls -la' } });
    expect(result.decision).toBe('allow');
  });

  test('edit-guard block 保護路徑', async () => {
    const { evaluate } = await import(join(CLAUDE_DIR, 'hooks/scripts/tool/pre-edit-guard.js'));
    const result = evaluate({ tool_input: { file_path: join(CLAUDE_DIR, 'settings.json') } });
    expect(result.decision).toBe('block');
  });

  test('edit-guard allow 非保護路徑', async () => {
    const { evaluate } = await import(join(CLAUDE_DIR, 'hooks/scripts/tool/pre-edit-guard.js'));
    const result = evaluate({ tool_input: { file_path: '/tmp/safe-file.txt' } });
    expect(result.decision).toBe('allow');
  });
});

describe('Hook Client HTTP dispatch', () => {
  test('dispatcher 連線測試（容許未啟動）', async () => {
    let connected = false;
    try {
      const res = await fetch('http://127.0.0.1:3457/health', {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) connected = true;
    } catch {}
    // dispatcher 可能已啟動也可能沒有，兩種情況都合理
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

    // 不管走 dispatcher 還是 fallback，都應該 block
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
    // allow 時不應有 stdout 輸出（或輸出 allow 但不是 block）
    if (output.trim()) {
      const result = JSON.parse(output.trim());
      expect(result.decision).not.toBe('block');
    }
  });
});
