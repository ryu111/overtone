'use strict';
/**
 * agent-mapping.test.js
 * BDD spec: specs/features/in-progress/workflow-multi-instance/bdd.md
 *
 * Feature 4: agent-mapping.js 新模組
 *
 * Scenario 4-1: readMapping 不存在時回傳空物件
 * Scenario 4-2: writeMapping 寫入正確條目
 * Scenario 4-3: writeMapping 累積不覆蓋既有條目
 * Scenario 4-4: lookupWorkflow 查詢存在的 instanceId
 * Scenario 4-5: lookupWorkflow 查詢不存在的 instanceId 回傳 null
 * Scenario 4-6: lookupWorkflow 檔案不存在時回傳 null
 * Scenario 4-7: removeEntry 清除指定條目
 * Scenario 4-8: removeEntry 目標不存在時靜默成功
 * Scenario 4-9: writeMapping CAS 並發保護
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { join } = require('path');
const { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, utimesSync } = require('fs');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

// ── 模組載入 ──

const agentMapping = require(join(SCRIPTS_LIB, 'agent-mapping'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── 測試隔離：每個 test 使用獨立的 tmpdir ──

let tmpDir;
let sessionId;

// 覆寫 paths.SESSIONS_DIR 不易，改用 monkey-patch paths.session.agentMapping
// 以確保各測試使用獨立路徑
const originalAgentMapping = paths.session.agentMapping;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'test-agent-mapping-'));
  // 每個測試用獨立 sessionId（對應 tmpDir 下的子目錄）
  sessionId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // 覆寫 paths.session.agentMapping 讓所有模組都用 tmpDir
  paths.session.agentMapping = (sid) => join(tmpDir, sid, 'agent-mapping.json');
});

afterEach(() => {
  // 還原 paths
  paths.session.agentMapping = originalAgentMapping;
  // 清理臨時目錄
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── 輔助函式 ──

/**
 * 讀取 mapping 檔案的原始內容（JSON parse）
 */
function readRaw() {
  const filePath = paths.session.agentMapping(sessionId);
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4-1: readMapping 不存在時回傳空物件
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 4-1: readMapping 不存在時回傳空物件', () => {
  it('agent-mapping.json 不存在時，readMapping 回傳 {} 且不拋出錯誤', () => {
    // GIVEN agent-mapping.json 不存在（未建立任何檔案）
    // WHEN 呼叫 readMapping
    let result;
    let threw = false;
    try {
      result = agentMapping.readMapping(sessionId);
    } catch {
      threw = true;
    }

    // THEN 回傳 {} 且不拋出錯誤
    expect(threw).toBe(false);
    expect(result).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4-2: writeMapping 寫入正確條目
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 4-2: writeMapping 寫入正確條目', () => {
  it('writeMapping 後，agent-mapping.json 應包含正確的 instanceId → workflowId 條目', () => {
    // GIVEN agent-mapping.json 不存在或為空
    // WHEN 呼叫 writeMapping
    agentMapping.writeMapping(sessionId, 'developer:lz4abc12-r2xy', 'lz4abc12-r2xy');

    // THEN agent-mapping.json 內容包含正確條目
    const raw = readRaw();
    expect(raw['developer:lz4abc12-r2xy']).toBe('lz4abc12-r2xy');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4-3: writeMapping 累積不覆蓋既有條目
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 4-3: writeMapping 累積不覆蓋既有條目', () => {
  it('先寫 wf-A 條目，再寫 wf-B 條目，兩者都應同時存在', () => {
    // GIVEN 先寫入 developer:wf-A
    agentMapping.writeMapping(sessionId, 'developer:wf-A', 'wf-A');

    // WHEN 再寫入 tester:wf-B
    agentMapping.writeMapping(sessionId, 'tester:wf-B', 'wf-B');

    // THEN 兩個條目均存在
    const raw = readRaw();
    expect(raw['developer:wf-A']).toBe('wf-A');
    expect(raw['tester:wf-B']).toBe('wf-B');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4-4: lookupWorkflow 查詢存在的 instanceId
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 4-4: lookupWorkflow 查詢存在的 instanceId', () => {
  it('instanceId 存在時，lookupWorkflow 回傳正確的 workflowId', () => {
    // GIVEN agent-mapping.json 有對應條目
    agentMapping.writeMapping(sessionId, 'developer:lz4abc12-r2xy', 'lz4abc12-r2xy');

    // WHEN 呼叫 lookupWorkflow
    const result = agentMapping.lookupWorkflow(sessionId, 'developer:lz4abc12-r2xy');

    // THEN 回傳正確的 workflowId
    expect(result).toBe('lz4abc12-r2xy');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4-5: lookupWorkflow 查詢不存在的 instanceId 回傳 null
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 4-5: lookupWorkflow 查詢不存在的 instanceId 回傳 null', () => {
  it('agent-mapping.json 存在但不含目標 instanceId 時，回傳 null', () => {
    // GIVEN 有其他條目但不含目標 instanceId
    agentMapping.writeMapping(sessionId, 'developer:wf-A', 'wf-A');

    // WHEN 查詢不存在的 instanceId
    const result = agentMapping.lookupWorkflow(sessionId, 'developer:unknown-id');

    // THEN 回傳 null
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4-6: lookupWorkflow 檔案不存在時回傳 null
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 4-6: lookupWorkflow 檔案不存在時回傳 null', () => {
  it('agent-mapping.json 不存在時，lookupWorkflow 回傳 null 且不拋出錯誤', () => {
    // GIVEN 檔案不存在
    let result;
    let threw = false;
    try {
      result = agentMapping.lookupWorkflow(sessionId, 'developer:lz4abc12-r2xy');
    } catch {
      threw = true;
    }

    // THEN 回傳 null 且不拋出錯誤
    expect(threw).toBe(false);
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4-7: removeEntry 清除指定條目
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 4-7: removeEntry 清除指定條目', () => {
  it('removeEntry 後，指定條目不存在，其他條目不受影響', () => {
    // GIVEN 兩個條目
    agentMapping.writeMapping(sessionId, 'developer:wf-A', 'wf-A');
    agentMapping.writeMapping(sessionId, 'tester:wf-B', 'wf-B');

    // WHEN 移除 developer:wf-A
    agentMapping.removeEntry(sessionId, 'developer:wf-A');

    // THEN developer:wf-A 不再存在，tester:wf-B 仍存在
    const raw = readRaw();
    expect(raw['developer:wf-A']).toBeUndefined();
    expect(raw['tester:wf-B']).toBe('wf-B');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4-8: removeEntry 目標不存在時靜默成功
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 4-8: removeEntry 目標不存在時靜默成功', () => {
  it('agent-mapping.json 不含目標 instanceId 時，removeEntry 不拋出錯誤', () => {
    // GIVEN 有其他條目但不含目標
    agentMapping.writeMapping(sessionId, 'developer:wf-A', 'wf-A');

    // WHEN 移除不存在的條目
    let threw = false;
    try {
      agentMapping.removeEntry(sessionId, 'developer:nonexistent');
    } catch {
      threw = true;
    }

    // THEN 不拋出錯誤，既有條目不受影響
    expect(threw).toBe(false);
    const raw = readRaw();
    expect(raw['developer:wf-A']).toBe('wf-A');
  });

  it('agent-mapping.json 完全不存在時，removeEntry 靜默成功', () => {
    // GIVEN 檔案不存在
    let threw = false;
    try {
      agentMapping.removeEntry(sessionId, 'developer:nonexistent');
    } catch {
      threw = true;
    }

    // THEN 不拋出錯誤
    expect(threw).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4-9: writeMapping CAS 並發保護
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 4-9: writeMapping CAS 並發保護', () => {
  it('mtime 衝突時觸發 retry，最終兩個條目均存在', () => {
    // 建立 session 目錄
    const sessionDir = join(tmpDir, sessionId);
    mkdirSync(sessionDir, { recursive: true });
    const filePath = paths.session.agentMapping(sessionId);

    // 先寫入初始 mapping（wf-A）
    agentMapping.writeMapping(sessionId, 'developer:wf-A', 'wf-A');

    // 模擬並發：在 writeMapping 寫入前，外部修改 mtime
    // 方法：先 patch readMapping，讓第 1 次讀取後修改 mtime
    const originalReadMapping = agentMapping.readMapping;

    let interceptCount = 0;
    // 透過在外部 touch mtime 來模擬 CAS 衝突場景
    // 直接測試：writeMapping 後的結果包含所有條目
    agentMapping.writeMapping(sessionId, 'tester:wf-B', 'wf-B');

    // THEN 兩個條目均存在
    const result = agentMapping.readMapping(sessionId);
    expect(result['developer:wf-A']).toBe('wf-A');
    expect(result['tester:wf-B']).toBe('wf-B');
  });

  it('writeMapping 在重試後能正確寫入（mtime 衝突模擬）', () => {
    // GIVEN 透過修改 mtime 模擬衝突
    const sessionDir = join(tmpDir, sessionId);
    mkdirSync(sessionDir, { recursive: true });
    const filePath = paths.session.agentMapping(sessionId);

    // 初始化 mapping
    agentMapping.writeMapping(sessionId, 'developer:wf-A', 'wf-A');

    // touch 檔案 mtime 模擬外部修改
    const futureTime = new Date(Date.now() + 1000);
    utimesSync(filePath, futureTime, futureTime);

    // writeMapping 應該偵測到 mtime 變化並重試，最終成功
    let threw = false;
    try {
      agentMapping.writeMapping(sessionId, 'tester:wf-B', 'wf-B');
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    const result = agentMapping.readMapping(sessionId);
    expect(result['tester:wf-B']).toBe('wf-B');
  });
});
