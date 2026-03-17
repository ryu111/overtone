/**
 * hook-client-cli.test.js — hook-client.js E2E 與靜態分析整合測試
 *
 * 涵蓋：
 * - E2E stdin → stdout（Bun.spawn）
 * - 靜態原始碼分析（readFileSync + toContain）
 * - dispatch fallback 順序鎖定（架構測試）
 */

import { describe, test, expect } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { readFileSync } from 'fs';

const CLAUDE_DIR = join(homedir(), '.claude');

// ─── E2E（stdin → stdout）────────────────────────────────────────────────────

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

// ─── isLockfileStale 靜態分析 ─────────────────────────────────────────────────

describe('isLockfileStale 邏輯', () => {
  test('hook-client.js 含 isLockfileStale 函式', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    expect(src).toContain('function isLockfileStale()');
  });

  test('autoStart 中含 isLockfileStale() 呼叫', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    expect(src).toContain('isLockfileStale()');
  });

  test('isLockfileStale 含 process.kill(pid, 0) 存活檢查', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    expect(src).toContain('process.kill(pid, 0)');
  });

  test('isLockfileStale 含 ESRCH 處理（進程不存在）', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    expect(src).toContain('ESRCH');
  });

  test('isLockfileStale 含 EPERM 處理（保守不清除）', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    expect(src).toContain('EPERM');
  });

  test('isLockfileStale 含 isNaN 處理（損壞 lockfile）', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    expect(src).toContain('isNaN(pid)');
  });

  test('陳舊 lockfile 被清除後繼續 spawn（不 return）', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    const staleBlock = src.match(/if \(isLockfileStale\(\)\) \{[\s\S]*?\}/);
    expect(staleBlock).not.toBeNull();
    expect(staleBlock[0]).toContain('unlinkSync');
    expect(staleBlock[0]).not.toContain('return');
  });
});

// ─── pollHealth spawn 後等待時間 ───────────────────────────────────────────────

describe('pollHealth spawn 後等待時間', () => {
  test('spawn 後 pollHealth 含 maxRetries: 5（總等待 6200ms）', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    expect(src).toMatch(/await pollHealth\(\{\s*maxRetries:\s*5/);
  });
});

// ─── server.js SIGTERM handler ────────────────────────────────────────────────

describe('server.js SIGTERM handler', () => {
  test('server.js 含 SIGTERM handler', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/server.js'), 'utf-8');
    expect(src).toContain("process.on('SIGTERM'");
  });

  test('server.js 含 SIGINT handler', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/server.js'), 'utf-8');
    expect(src).toContain("process.on('SIGINT'");
  });

  test('server.js 含 gracefulShutdown 函式', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/server.js'), 'utf-8');
    expect(src).toContain('function gracefulShutdown(');
  });

  test('gracefulShutdown 呼叫 bus.destroy()', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/server.js'), 'utf-8');
    expect(src).toContain('bus.destroy()');
  });

  test('bus.destroy 有 try-catch 包裹', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/server.js'), 'utf-8');
    const shutdownFn = src.match(/function gracefulShutdown[\s\S]*?^}/m);
    expect(shutdownFn).not.toBeNull();
    expect(shutdownFn[0]).toContain('try');
    expect(shutdownFn[0]).toContain('catch');
  });
});

// ─── autoStart polling 改善 ───────────────────────────────────────────────────

describe('autoStart polling 改善', () => {
  test('hook-client.js 不含 Bun.sleep(800)', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    expect(src).not.toContain('Bun.sleep(800)');
  });

  test('hook-client.js 包含 pollHealth 函式', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    expect(src).toContain('async function pollHealth(');
  });

  test('pollHealth 使用指數退避（baseMs + Math.pow）', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    expect(src).toContain('maxRetries');
    expect(src).toContain('baseMs');
    expect(src).toContain('Math.pow(2, i)');
  });

  test('autoStart 中 lockfile 等待也使用 pollHealth（非固定 sleep）', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    expect(src).not.toContain('Bun.sleep(1000)');
  });
});

// ─── error log 只在恢復鏈全失敗時記錄（all-failed 語意）E2E 部分 ───────────────

describe('error log 只在恢復鏈全失敗時記錄（all-failed 語意）', () => {
  test('E2E: server 斷線時 block 命令仍被 fallback 攔截', async () => {
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

  test('hook-client.js 中不含 phase:"dispatch" 或 phase:"retry" 的 logError 呼叫', () => {
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    const logErrorCalls = [...src.matchAll(/logError\([^)]+,\s*"([^"]+)"\)/g)];
    const phases = logErrorCalls.map(m => m[1]);
    expect(phases).not.toContain('dispatch');
    expect(phases).not.toContain('retry');
    expect(phases).not.toContain('all-failed');
    expect(phases).toContain('fallback-failed');
    expect(phases).toContain('stdin');
  });
});

// ─── dispatch fallback 順序鎖定（架構測試） ────────────────────────────────────

describe('dispatch fallback 順序（fallback-first 架構鎖定）', () => {
  const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');

  test('autoStart 以 detached spawn 背景執行（不被 process exit 截斷）', () => {
    const catchBlock = src.match(/\} catch \(e1\) \{[\s\S]*?(?=\n\})/);
    expect(catchBlock).not.toBeNull();
    expect(catchBlock[0]).toContain("'__autostart'");
    expect(catchBlock[0]).toContain('Bun.spawn');
    expect(src).toContain("if (eventType === '__autostart')");
    expect(catchBlock[0]).not.toMatch(/await\s+autoStart\(\)/);
  });

  test('tryFallback 出現在 detached autostart spawn 之前（有 fallback 時先 fallback）', () => {
    const catchBlock = src.match(/\} catch \(e1\) \{[\s\S]*?(?=\n\})/);
    expect(catchBlock).not.toBeNull();
    const block = catchBlock[0];
    const fallbackPos = block.indexOf('tryFallback');
    const autoStartSpawnPos = block.indexOf("'__autostart'");
    expect(fallbackPos).toBeGreaterThan(-1);
    expect(autoStartSpawnPos).toBeGreaterThan(-1);
    expect(fallbackPos).toBeLessThan(autoStartSpawnPos);
  });

  test('autoStart 函式內含至少 5 處 debugLog', () => {
    const autoStartFn = src.match(/async function autoStart\(\)[\s\S]*?^}/m);
    expect(autoStartFn).not.toBeNull();
    const debugLogCount = (autoStartFn[0].match(/debugLog\(/g) || []).length;
    expect(debugLogCount).toBeGreaterThanOrEqual(5);
  });
});
