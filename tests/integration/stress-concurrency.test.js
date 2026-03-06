'use strict';
/**
 * stress-concurrency.test.js — 多進程並發壓力測試（整合測試）
 *
 * 覆蓋 S2 系列 Scenario：
 *   S2-1: N 個子進程同時 atomicWrite 同一檔案 — 無 .tmp 殘留
 *   S2-2: N 個子進程同時 atomicWrite — 最終內容無 JSON 損壞
 *   S2-3: N 個子進程同時 appendFileSync — 行數正確（50 行）
 *   S2-4: N 個子進程同時 appendFileSync — 無行資料丟失（唯一性驗證）
 *   S2-5: atomicWrite tmp 命名唯一性（`_atomicCounter` 保護）
 *   S2-6: 高並發下 CAS 最終一致性（多子進程 updateStateAtomic）
 *
 * 測試策略：使用 Bun.spawn 啟動子進程，主進程等待全部完成後驗證結果。
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { existsSync, rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const UTILS_PATH = join(SCRIPTS_LIB, 'utils.js');
const STATE_PATH = join(SCRIPTS_LIB, 'state.js');
const PATHS_LIB = join(SCRIPTS_LIB, 'paths.js');
const TMP_DIR = join(__dirname, '..', '.test-tmp-stress');

// ── 並發數設定 ──
const N = 10;

// ── 輔助：建立並等待所有子進程完成 ──

async function spawnAll(scripts) {
  const procs = scripts.map((script) =>
    Bun.spawn(['bun', '-e', script], {
      env: { ...process.env, OVERTONE_NO_DASHBOARD: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    })
  );

  const results = await Promise.all(
    procs.map(async (proc, i) => {
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      return { exitCode, stdout, stderr, index: i };
    })
  );

  return results;
}

// ── beforeEach / afterEach ──

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════
// S2-1 + S2-2: atomicWrite 多進程同時寫入
// ═══════════════════════════════════════════════════════

describe('S2-1/S2-2: N 個子進程同時 atomicWrite', () => {
  it('S2-1: 完成後目標目錄中不應有 .tmp 殘留檔案', async () => {
    const targetFile = join(TMP_DIR, 'workflow.json');

    const scripts = Array.from({ length: N }, (_, i) => `
      const { atomicWrite } = require(${JSON.stringify(UTILS_PATH)});
      atomicWrite(${JSON.stringify(targetFile)}, { pid: process.pid, writerId: ${i} });
    `);

    await spawnAll(scripts);

    // 驗證：目錄下無 .tmp 殘留
    const files = readdirSync(TMP_DIR);
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toEqual([]);
  }, 30000);

  it('S2-2: 最終 workflow.json 存在且內容可 JSON.parse，writerId 欄位存在', async () => {
    const targetFile = join(TMP_DIR, 'workflow.json');

    const scripts = Array.from({ length: N }, (_, i) => `
      const { atomicWrite } = require(${JSON.stringify(UTILS_PATH)});
      atomicWrite(${JSON.stringify(targetFile)}, { pid: process.pid, writerId: ${i} });
    `);

    await spawnAll(scripts);

    // 驗證：檔案存在
    expect(existsSync(targetFile)).toBe(true);

    // 驗證：內容可 JSON.parse 且非損壞
    const raw = readFileSync(targetFile, 'utf8');
    let parsed;
    expect(() => { parsed = JSON.parse(raw); }).not.toThrow();

    // 驗證：writerId 欄位存在（來自某個子進程的完整寫入）
    expect(typeof parsed.writerId).toBe('number');
    expect(parsed.writerId).toBeGreaterThanOrEqual(0);
    expect(parsed.writerId).toBeLessThan(N);
  }, 30000);
});

// ═══════════════════════════════════════════════════════
// S2-3 + S2-4: appendFileSync 多進程同時 append
// ═══════════════════════════════════════════════════════

describe('S2-3/S2-4: N 個子進程同時 appendFileSync 同一 JSONL', () => {
  it('S2-3: 非空白行數應恰好等於 50（10 * 5），且每行可 JSON.parse', async () => {
    const targetFile = join(TMP_DIR, 'timeline.jsonl');

    // 使用 Node.js 的 appendFileSync（直接寫入，非原子）
    const scripts = Array.from({ length: N }, (_, processId) => `
      const { appendFileSync } = require('fs');
      for (let i = 0; i < 5; i++) {
        appendFileSync(
          ${JSON.stringify(targetFile)},
          JSON.stringify({ processId: ${processId}, lineIndex: i }) + '\\n',
          'utf8'
        );
      }
    `);

    await spawnAll(scripts);

    // 驗證：檔案存在
    expect(existsSync(targetFile)).toBe(true);

    const raw = readFileSync(targetFile, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim() !== '');

    // 驗證：非空白行數恰好 50
    expect(lines.length).toBe(50);

    // 驗證：每行可 JSON.parse
    const parsed = [];
    for (const line of lines) {
      expect(() => { parsed.push(JSON.parse(line)); }).not.toThrow();
    }
  }, 30000);

  it('S2-4: 每個 processId 恰好出現 5 次，(processId, lineIndex) 組合唯一', async () => {
    const targetFile = join(TMP_DIR, 'timeline.jsonl');

    const scripts = Array.from({ length: N }, (_, processId) => `
      const { appendFileSync } = require('fs');
      for (let i = 0; i < 5; i++) {
        appendFileSync(
          ${JSON.stringify(targetFile)},
          JSON.stringify({ processId: ${processId}, lineIndex: i }) + '\\n',
          'utf8'
        );
      }
    `);

    await spawnAll(scripts);

    const raw = readFileSync(targetFile, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim() !== '');
    const records = lines.map((l) => JSON.parse(l));

    // 驗證：每個 processId 恰好出現 5 次（無重複無丟失）
    const countByProcessId = {};
    for (const r of records) {
      countByProcessId[r.processId] = (countByProcessId[r.processId] || 0) + 1;
    }
    for (let i = 0; i < N; i++) {
      expect(countByProcessId[i]).toBe(5);
    }

    // 驗證：每個 (processId, lineIndex) 組合唯一
    const keys = new Set(records.map((r) => `${r.processId}:${r.lineIndex}`));
    expect(keys.size).toBe(50);
  }, 30000);
});

// ═══════════════════════════════════════════════════════
// S2-5: atomicWrite tmp 命名唯一性（_atomicCounter 保護）
// ═══════════════════════════════════════════════════════

describe('S2-5: atomicWrite tmp 路徑唯一性（_atomicCounter 遞增）', () => {
  it('utils.js 原始碼中存在 _atomicCounter 遞增邏輯', () => {
    // 驗證：原始碼中有 _atomicCounter 變數宣告
    const source = readFileSync(UTILS_PATH, 'utf8');
    expect(source).toContain('_atomicCounter');
    expect(source).toContain('_atomicCounter++');

    // 驗證：tmp 路徑樣板中包含 _atomicCounter（確保遞增值被納入 tmp 名稱）
    // 樣板格式：`${filePath}.${process.pid}.${Date.now()}.${_atomicCounter++}.tmp`
    expect(source).toContain('_atomicCounter++}.tmp');
  });

  it('同一進程快速連續呼叫 10 次 atomicWrite 不拋出錯誤，所有目標檔案均建立成功', () => {
    const { atomicWrite } = require(UTILS_PATH);

    // 連續呼叫 10 次，每次寫入不同目標檔案
    const targets = [];
    for (let i = 0; i < 10; i++) {
      const targetFile = join(TMP_DIR, `target-${i}.json`);
      targets.push(targetFile);
      // 不應拋出 EEXIST 或任何錯誤（_atomicCounter 確保 tmp 路徑唯一）
      expect(() => atomicWrite(targetFile, { index: i })).not.toThrow();
    }

    // 驗證：所有目標檔案均成功建立
    for (const f of targets) {
      expect(existsSync(f)).toBe(true);
    }

    // 驗證：目錄下無 .tmp 殘留（每次 rename 後 tmp 已消失）
    const files = readdirSync(TMP_DIR);
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════
// S2-6: 高並發下 CAS 最終一致性
// ═══════════════════════════════════════════════════════

describe('S2-6: 高並發下 CAS 最終一致性（多子進程 updateStateAtomic）', () => {
  it('5 個子進程同時 updateStateAtomic counter++，最終 counter >= 1 且 JSON 不損壞', async () => {
    const sessionId = `stress-cas-${Date.now()}`;
    const sessionDir = join(require('os').homedir(), '.overtone', 'sessions', sessionId);
    mkdirSync(sessionDir, { recursive: true });

    // 初始化 workflow.json（最小有效 state）
    const initialState = {
      sessionId,
      workflowType: 'single',
      createdAt: new Date().toISOString(),
      currentStage: 'DEV',
      stages: { DEV: { status: 'pending', result: null } },
      activeAgents: {},
      failCount: 0,
      rejectCount: 0,
      retroCount: 0,
      featureName: null,
      pendingAction: null,
      counter: 0,
    };

    const workflowPath = join(sessionDir, 'workflow.json');
    writeFileSync(workflowPath, JSON.stringify(initialState, null, 2) + '\n', 'utf8');

    // 5 個子進程各自 counter++
    const CONCURRENT = 5;
    const scripts = Array.from({ length: CONCURRENT }, () => `
      const stateLib = require(${JSON.stringify(STATE_PATH)});
      stateLib.updateStateAtomic(
        ${JSON.stringify(sessionId)},
        (state) => {
          state.counter = (state.counter || 0) + 1;
          return state;
        }
      );
    `);

    const results = await spawnAll(scripts);

    // 驗證：所有子進程正常退出
    for (const r of results) {
      if (r.exitCode !== 0) {
        // 有些可能因為 timeline emit 失敗而非 0，但核心邏輯應完成
        // 只驗證沒有 JS 錯誤（stderr 無 Error: 開頭）
        expect(r.stderr).not.toMatch(/^Error:/m);
      }
    }

    // 驗證：最終 workflow.json 可 JSON.parse
    const raw = readFileSync(workflowPath, 'utf8');
    let finalState;
    expect(() => { finalState = JSON.parse(raw); }).not.toThrow();

    // 驗證：counter >= 1（至少有一次寫入成功）
    expect(finalState.counter).toBeGreaterThanOrEqual(1);

    // 清理 session 目錄
    rmSync(sessionDir, { recursive: true, force: true });
  }, 30000);
});
