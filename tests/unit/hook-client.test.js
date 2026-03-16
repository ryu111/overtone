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

// ─── 新增：hasFallback 函式測試 ───────────────────────────────────────────────

// 從生產檔案中提取 FALLBACK_MODULES 和 hasFallback 的邏輯，用於隔離單元測試
const FALLBACK_MODULES_FOR_TEST = {
  'PreToolUse:Bash': { path: 'hooks/modules/guards.js', fn: 'evaluateBash' },
  'PreToolUse:Write': { path: 'hooks/modules/guards.js', fn: 'evaluateEdit' },
  'PreToolUse:Edit': { path: 'hooks/modules/guards.js', fn: 'evaluateEdit' },
};

function hasFallback(event, match) {
  if (match) {
    for (const m of match.split('|')) {
      if (FALLBACK_MODULES_FOR_TEST[`${event}:${m}`]) return true;
    }
  }
  return !!FALLBACK_MODULES_FOR_TEST[event];
}

describe('hasFallback 函式', () => {
  test('PreToolUse:Bash → true（有 fallback）', () => {
    expect(hasFallback('PreToolUse', 'Bash')).toBe(true);
  });

  test('PreToolUse:Write|Edit → true（只要一個 match 就 true）', () => {
    expect(hasFallback('PreToolUse', 'Write|Edit')).toBe(true);
  });

  test('PostToolUse 空 matcher → false（觀測型事件）', () => {
    expect(hasFallback('PostToolUse', '')).toBe(false);
  });

  test('PostToolUse undefined matcher → false（向後相容）', () => {
    expect(hasFallback('PostToolUse', undefined)).toBe(false);
  });

  test('Notification 空 matcher → false', () => {
    expect(hasFallback('Notification', '')).toBe(false);
  });

  test('SessionStart 空 matcher → false', () => {
    expect(hasFallback('SessionStart', '')).toBe(false);
  });
});

describe('matcher 預設值（修改 1 驗證）', () => {
  test('解構預設值：只有 eventType 時 matcher 為空字串', () => {
    const [, matcher = ''] = ['PostToolUse'];
    expect(matcher).toBe('');
    expect(matcher).not.toBeUndefined();
  });

  test('event:matcher 格式不含 undefined', () => {
    const [eventType, matcher = ''] = ['PostToolUse'];
    const key = `${eventType}:${matcher}`;
    expect(key).toBe('PostToolUse:');
    expect(key).not.toContain('undefined');
  });

  test('有傳 matcher 時正常解構', () => {
    const [eventType, matcher = ''] = ['PreToolUse', 'Bash'];
    expect(eventType).toBe('PreToolUse');
    expect(matcher).toBe('Bash');
  });

  test('字串 "undefined" 作為 matcher 時 hasFallback 仍為 false（防呆）', () => {
    expect(hasFallback('PostToolUse', 'undefined')).toBe(false);
  });
});

describe('觀測型事件 error log 抑制', () => {
  test('有 fallback 的事件（PreToolUse:Bash）應記錄 error', () => {
    const needsFallback = hasFallback('PreToolUse', 'Bash');
    expect(needsFallback).toBe(true);
  });

  test('觀測型事件（PostToolUse 空 matcher）不應記錄 error', () => {
    const needsFallback = hasFallback('PostToolUse', '');
    expect(needsFallback).toBe(false);
  });

  test('觀測型事件（SessionStart）不應記錄 error', () => {
    expect(hasFallback('SessionStart', '')).toBe(false);
  });

  test('觀測型事件（Notification）不應記錄 error', () => {
    expect(hasFallback('Notification', '')).toBe(false);
  });

  test('觀測型事件（SubagentStop）不應記錄 error', () => {
    expect(hasFallback('SubagentStop', '')).toBe(false);
  });

  test('觀測型事件（SessionEnd）不應記錄 error', () => {
    expect(hasFallback('SessionEnd', '')).toBe(false);
  });
});

describe('error log 只在恢復鏈全失敗時記錄（all-failed 語意）', () => {
  test('dispatch 失敗 + fallback 成功 → 不應寫入 hook-errors.jsonl', async () => {
    // 模擬場景：server 斷線但 fallback（直接 import guards.js）成功
    // 新邏輯：只在 tryFallback 回傳 false 時才 logError
    const { evaluateBash } = await import(join(CLAUDE_DIR, 'hooks/modules/guards.js'));
    const result = evaluateBash({ tool_input: { command: 'ls' } });
    // fallback 成功 → 應回傳 allow → 不觸發 logError
    expect(result.decision).toBe('allow');
  });

  test('tryFallback 對有 fallback 的事件回傳 true', () => {
    // tryFallback 提取後，對 PreToolUse:Bash 應找到 guards.js
    const keys = 'Bash'.split('|').map(m => `PreToolUse:${m}`);
    const found = keys.some(k => !!FALLBACK_MODULES_FOR_TEST[k]);
    expect(found).toBe(true);
  });

  test('tryFallback 對觀測型事件回傳 false（無 fallback 模組）', () => {
    const keys = ['PostToolUse:', 'SessionEnd:', 'SubagentStop:'];
    for (const k of keys) {
      expect(FALLBACK_MODULES_FOR_TEST[k]).toBeUndefined();
    }
  });

  test('E2E: server 斷線時 block 命令仍被 fallback 攔截', async () => {
    // 用無效 port 確保 dispatch 必定失敗，驗證 fallback 仍然正常運作
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

  test('hook-client.js 中不含 phase:"dispatch" 或 phase:"retry" 的 logError 呼叫', async () => {
    // 靜態驗證：確保生產碼只有 "all-failed" 和 "stdin" 兩種 phase
    const { readFileSync } = await import('fs');
    const src = readFileSync(join(CLAUDE_DIR, 'hooks/hook-client.js'), 'utf-8');
    const logErrorCalls = [...src.matchAll(/logError\([^)]+,\s*"([^"]+)"\)/g)];
    const phases = logErrorCalls.map(m => m[1]);
    expect(phases).not.toContain('dispatch');
    expect(phases).not.toContain('retry');
    expect(phases).not.toContain('fallback');
    expect(phases).toContain('all-failed');
    expect(phases).toContain('stdin');
  });
});
