// @sequential
'use strict';
/**
 * failure-tracker.test.js — 跨 session 失敗模式追蹤單元測試
 *
 * 測試面向：
 *   1. recordFailure：正確 append JSONL + 欄位驗證
 *   2. getFailurePatterns：聚合 byStage / byAgent / topPattern
 *   3. getFailurePatterns：空檔案、window 截取
 *   4. formatFailureWarnings：threshold 控制 + 有無相關模式
 *   5. formatFailureSummary：無資料空字串 + 有資料 Markdown
 *   6. _trimIfNeeded：超過 maxRecords 時截斷
 *   7. 損壞 JSON 行靜默跳過
 *   8. NOVA_TEST 隔離保護
 *   9. recordResolution — 已解決過濾
 *  10. formatFailureSummary — 時間範圍顯示
 */

const { test, expect, describe, afterAll, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const failureTracker = require(join(SCRIPTS_LIB, 'failure-tracker'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const { failureDefaults } = require(join(SCRIPTS_LIB, 'registry'));

// ── 測試基礎設施 ──

const TIMESTAMP = Date.now();
const TEST_PROJECT_ROOT = join(homedir(), '.nova', 'test-failure-project-' + TIMESTAMP);
const dirsToClean = [TEST_PROJECT_ROOT];

/**
 * 取得或確認測試用的 failures.jsonl 路徑
 */
function getFailurePath(projectRoot) {
  return paths.global.failures(projectRoot);
}

/**
 * 寫入測試用的失敗記錄（直接操作 JSONL 檔案）
 */
function writeFailures(projectRoot, records) {
  const filePath = getFailurePath(projectRoot);
  mkdirSync(require('path').dirname(filePath), { recursive: true });
  writeFileSync(filePath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

/**
 * 清除測試用的失敗記錄
 */
function clearFailures(projectRoot) {
  const filePath = getFailurePath(projectRoot);
  if (existsSync(filePath)) rmSync(filePath);
}

/**
 * 建立標準測試失敗記錄
 */
function makeRecord(overrides = {}) {
  return {
    ts: new Date().toISOString(),
    sessionId: 'test-session-' + TIMESTAMP,
    workflowType: 'quick',
    stage: 'DEV',
    agent: 'developer',
    verdict: 'fail',
    retryAttempt: 1,
    ...overrides,
  };
}

afterAll(() => {
  for (const dir of dirsToClean) {
    rmSync(dir, { recursive: true, force: true });
    // 清理每個測試 projectRoot 對應的全域 hash 目錄
    const globalDir = paths.global.dir(dir);
    if (existsSync(globalDir)) rmSync(globalDir, { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 1. recordFailure — 正確 append JSONL
// ────────────────────────────────────────────────────────────────────────────

describe('recordFailure — JSONL append', () => {
  // 暫時清除 NOVA_TEST，讓 recordFailure 能實際寫入（驗證寫入行為）
  let savedOvertoneTest;
  beforeEach(() => { savedOvertoneTest = process.env.NOVA_TEST; delete process.env.NOVA_TEST; });
  afterEach(() => { if (savedOvertoneTest !== undefined) process.env.NOVA_TEST = savedOvertoneTest; else delete process.env.NOVA_TEST; });

  test('1-1 正確 append 一筆記錄到 JSONL', () => {
    const project = join(homedir(), '.nova', 'test-fail-append-' + TIMESTAMP);
    dirsToClean.push(project);
    clearFailures(project);

    const record = makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' });
    failureTracker.recordFailure(project, record);

    const filePath = getFailurePath(project);
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf8').trim();
    const lines = content.split('\n').filter(Boolean);
    expect(lines.length).toBe(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.stage).toBe('DEV');
    expect(parsed.agent).toBe('developer');
    expect(parsed.verdict).toBe('fail');
  });

  test('1-3 記錄 reason 欄位（可選）', () => {
    const project = join(homedir(), '.nova', 'test-fail-reason-' + TIMESTAMP);
    dirsToClean.push(project);
    clearFailures(project);

    const record = makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail', reason: '測試未通過：缺少邊界條件處理' });
    failureTracker.recordFailure(project, record);

    const filePath = getFailurePath(project);
    const content = readFileSync(filePath, 'utf8').trim();
    const parsed = JSON.parse(content.split('\n')[0]);
    expect(parsed.reason).toBe('測試未通過：缺少邊界條件處理');
  });

  test('1-4 reason 為 null 時正常寫入（不影響現有欄位）', () => {
    const project = join(homedir(), '.nova', 'test-fail-reason-null-' + TIMESTAMP);
    dirsToClean.push(project);
    clearFailures(project);

    const record = makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail', reason: null });
    failureTracker.recordFailure(project, record);

    const filePath = getFailurePath(project);
    const content = readFileSync(filePath, 'utf8').trim();
    const parsed = JSON.parse(content.split('\n')[0]);
    expect(parsed.stage).toBe('DEV');
    expect(parsed.reason).toBeNull();
  });

  test('1-2 多次呼叫累積多筆記錄', () => {
    const project = join(homedir(), '.nova', 'test-fail-multi-' + TIMESTAMP);
    dirsToClean.push(project);
    clearFailures(project);

    failureTracker.recordFailure(project, makeRecord({ stage: 'DEV', verdict: 'fail' }));
    failureTracker.recordFailure(project, makeRecord({ stage: 'REVIEW', verdict: 'reject' }));
    failureTracker.recordFailure(project, makeRecord({ stage: 'TEST', verdict: 'fail' }));

    const content = readFileSync(getFailurePath(project), 'utf8').trim();
    const lines = content.split('\n').filter(Boolean);
    expect(lines.length).toBe(3);

    const parsed = lines.map(l => JSON.parse(l));
    expect(parsed[0].stage).toBe('DEV');
    expect(parsed[1].stage).toBe('REVIEW');
    expect(parsed[2].stage).toBe('TEST');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. recordFailure — 欄位驗證
// ────────────────────────────────────────────────────────────────────────────

describe('recordFailure — 欄位驗證', () => {
  test('2-1 缺少必要欄位時不寫入', () => {
    const project = join(homedir(), '.nova', 'test-fail-validate-' + TIMESTAMP);
    dirsToClean.push(project);
    clearFailures(project);

    // 缺少 stage
    failureTracker.recordFailure(project, { ts: new Date().toISOString(), sessionId: 'sid', agent: 'developer', verdict: 'fail' });
    // 缺少 agent
    failureTracker.recordFailure(project, { ts: new Date().toISOString(), sessionId: 'sid', stage: 'DEV', verdict: 'fail' });
    // 缺少 verdict
    failureTracker.recordFailure(project, { ts: new Date().toISOString(), sessionId: 'sid', stage: 'DEV', agent: 'developer' });

    // 這三筆都缺必要欄位，不應寫入任何記錄
    const filePath = getFailurePath(project);
    expect(existsSync(filePath)).toBe(false);
  });

  test('2-2 projectRoot 為空時靜默跳過', () => {
    // 不拋出錯誤
    expect(() => failureTracker.recordFailure(null, makeRecord())).not.toThrow();
    expect(() => failureTracker.recordFailure('', makeRecord())).not.toThrow();
    expect(() => failureTracker.recordFailure(null, null)).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. getFailurePatterns — 聚合邏輯
// ────────────────────────────────────────────────────────────────────────────

describe('getFailurePatterns — 聚合邏輯', () => {
  test('3-1 正確聚合 byStage', () => {
    const project = join(homedir(), '.nova', 'test-fail-stage-' + TIMESTAMP);
    dirsToClean.push(project);

    writeFailures(project, [
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ stage: 'REVIEW', agent: 'code-reviewer', verdict: 'reject' }),
    ]);

    const patterns = failureTracker.getFailurePatterns(project);
    expect(patterns.totalFailures).toBe(3);
    expect(patterns.byStage['DEV'].count).toBe(2);
    expect(patterns.byStage['REVIEW'].count).toBe(1);
    // rate：DEV = 2/3, REVIEW = 1/3
    expect(patterns.byStage['DEV'].rate).toBeCloseTo(0.6667, 3);
    expect(patterns.byStage['REVIEW'].rate).toBeCloseTo(0.3333, 3);
  });

  test('3-2 正確聚合 byAgent', () => {
    const project = join(homedir(), '.nova', 'test-fail-agent-' + TIMESTAMP);
    dirsToClean.push(project);

    writeFailures(project, [
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ stage: 'TEST', agent: 'tester', verdict: 'fail' }),
    ]);

    const patterns = failureTracker.getFailurePatterns(project);
    expect(patterns.byAgent['developer'].count).toBe(2);
    expect(patterns.byAgent['tester'].count).toBe(1);
  });

  test('3-3 正確識別 topPattern（stage + agent 組合）', () => {
    const project = join(homedir(), '.nova', 'test-fail-top-' + TIMESTAMP);
    dirsToClean.push(project);

    writeFailures(project, [
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ stage: 'REVIEW', agent: 'code-reviewer', verdict: 'reject' }),
    ]);

    const patterns = failureTracker.getFailurePatterns(project);
    expect(patterns.topPattern).not.toBeNull();
    expect(patterns.topPattern.stage).toBe('DEV');
    expect(patterns.topPattern.agent).toBe('developer');
    expect(patterns.topPattern.count).toBe(3);
  });

  test('3-4 空檔案回傳零值', () => {
    const patterns = failureTracker.getFailurePatterns('/tmp/no-such-failure-project-' + TIMESTAMP);
    expect(patterns.totalFailures).toBe(0);
    expect(patterns.byStage).toEqual({});
    expect(patterns.byAgent).toEqual({});
    expect(patterns.topPattern).toBeNull();
  });

  test('3-5 window 參數正確截取最近 N 筆', () => {
    const project = join(homedir(), '.nova', 'test-fail-window-' + TIMESTAMP);
    dirsToClean.push(project);

    // 寫入 10 筆（前 7 筆 DEV，後 3 筆 REVIEW）
    const records = [];
    for (let i = 0; i < 7; i++) {
      records.push(makeRecord({ stage: 'DEV', ts: new Date(Date.now() - (10 - i) * 1000).toISOString() }));
    }
    for (let i = 0; i < 3; i++) {
      records.push(makeRecord({ stage: 'REVIEW', ts: new Date(Date.now() - (3 - i) * 1000).toISOString() }));
    }
    writeFailures(project, records);

    // window=5：只看最後 5 筆（都是 REVIEW）
    const patterns = failureTracker.getFailurePatterns(project, 5);
    expect(patterns.totalFailures).toBe(5);
    // 最後 5 筆：4 REVIEW + 1 前面的 DEV? 不對，最後 5 筆 = index 5,6,7,8,9
    // index 5,6 = DEV；index 7,8,9 = REVIEW
    // 實際：最後 5 筆 = index 5,6（DEV）和 index 7,8,9（REVIEW）
    expect(patterns.byStage['REVIEW']).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. formatFailureWarnings — threshold 控制
// ────────────────────────────────────────────────────────────────────────────

describe('formatFailureWarnings — threshold 控制', () => {
  test('4-1 有足夠失敗次數時產生警告', () => {
    const project = join(homedir(), '.nova', 'test-fail-warn-yes-' + TIMESTAMP);
    dirsToClean.push(project);

    // 寫入 warningThreshold 筆同 stage 失敗
    const records = [];
    for (let i = 0; i < failureDefaults.warningThreshold; i++) {
      records.push(makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }));
    }
    writeFailures(project, records);

    const warning = failureTracker.formatFailureWarnings(project, 'DEV');
    expect(warning).not.toBeNull();
    expect(typeof warning).toBe('string');
    expect(warning.length).toBeGreaterThan(0);
    expect(warning).toContain('DEV');
  });

  test('4-2 低於 warningThreshold 時回傳 null', () => {
    const project = join(homedir(), '.nova', 'test-fail-warn-no-' + TIMESTAMP);
    dirsToClean.push(project);

    // 只有 threshold - 1 筆
    const records = [];
    for (let i = 0; i < failureDefaults.warningThreshold - 1; i++) {
      records.push(makeRecord({ stage: 'DEV', verdict: 'fail' }));
    }
    writeFailures(project, records);

    const warning = failureTracker.formatFailureWarnings(project, 'DEV');
    expect(warning).toBeNull();
  });

  test('4-3 targetStage 無相關失敗時回傳 null', () => {
    const project = join(homedir(), '.nova', 'test-fail-warn-other-' + TIMESTAMP);
    dirsToClean.push(project);

    // 只有 REVIEW 的失敗
    writeFailures(project, [
      makeRecord({ stage: 'REVIEW', verdict: 'reject' }),
      makeRecord({ stage: 'REVIEW', verdict: 'reject' }),
      makeRecord({ stage: 'REVIEW', verdict: 'reject' }),
    ]);

    // 查詢 DEV → 無相關模式
    const warning = failureTracker.formatFailureWarnings(project, 'DEV');
    expect(warning).toBeNull();
  });

  test('4-4 無資料時回傳 null', () => {
    const warning = failureTracker.formatFailureWarnings('/tmp/no-failures-' + TIMESTAMP, 'DEV');
    expect(warning).toBeNull();
  });

  test('4-5 警告包含建議文字', () => {
    const project = join(homedir(), '.nova', 'test-fail-warn-text-' + TIMESTAMP);
    dirsToClean.push(project);

    const records = [];
    for (let i = 0; i < failureDefaults.warningThreshold + 1; i++) {
      records.push(makeRecord({ stage: 'TEST', agent: 'tester', verdict: 'fail' }));
    }
    writeFailures(project, records);

    const warning = failureTracker.formatFailureWarnings(project, 'TEST');
    expect(warning).toContain('TEST');
    expect(warning).toContain('建議');
  });

  test('4-6 有 reason 時警告包含根因文字', () => {
    const project = join(homedir(), '.nova', 'test-fail-warn-reason-' + TIMESTAMP);
    dirsToClean.push(project);

    const records = [
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail', reason: '缺少 null 檢查' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail', reason: '缺少 null 檢查' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail', reason: '型別錯誤' }),
    ];
    writeFailures(project, records);

    const warning = failureTracker.formatFailureWarnings(project, 'DEV');
    expect(warning).not.toBeNull();
    expect(warning).toContain('常見失敗原因');
    expect(warning).toContain('缺少 null 檢查');
    expect(warning).toContain('型別錯誤');
  });

  test('4-7 無 reason 欄位時警告不含根因區塊', () => {
    const project = join(homedir(), '.nova', 'test-fail-warn-no-reason-' + TIMESTAMP);
    dirsToClean.push(project);

    const records = [
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
    ];
    writeFailures(project, records);

    const warning = failureTracker.formatFailureWarnings(project, 'DEV');
    expect(warning).not.toBeNull();
    expect(warning).not.toContain('常見失敗原因');
  });

  test('4-8 reason 去重後最多顯示 3 個', () => {
    const project = join(homedir(), '.nova', 'test-fail-warn-dedup-' + TIMESTAMP);
    dirsToClean.push(project);

    const records = [
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail', reason: '原因 A' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail', reason: '原因 B' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail', reason: '原因 C' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail', reason: '原因 D' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail', reason: '原因 A' }),  // 重複
    ];
    writeFailures(project, records);

    const warning = failureTracker.formatFailureWarnings(project, 'DEV');
    expect(warning).not.toBeNull();
    // 去重後最多 3 個，原因 A 重複只算一次
    const reasonLines = warning.split('\n').filter(l => l.trim().startsWith('- '));
    // 確認不超過 3 個 reason 項目（reasonLines 可能也包含其他項目，用根因區塊段計算更準確）
    const reasonSectionMatch = warning.match(/常見失敗原因：([\s\S]*?)(?=\n[^\s-]|$)/);
    if (reasonSectionMatch) {
      const reasonEntries = reasonSectionMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
      expect(reasonEntries.length).toBeLessThanOrEqual(3);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. formatFailureSummary — 無資料 / 有資料
// ────────────────────────────────────────────────────────────────────────────

describe('formatFailureSummary — 摘要格式', () => {
  test('5-1 無資料時回傳空字串', () => {
    const summary = failureTracker.formatFailureSummary('/tmp/no-failures-summary-' + TIMESTAMP);
    expect(summary).toBe('');
  });

  test('5-2 有資料時回傳 Markdown 摘要', () => {
    const project = join(homedir(), '.nova', 'test-fail-summary-' + TIMESTAMP);
    dirsToClean.push(project);

    writeFailures(project, [
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ stage: 'REVIEW', agent: 'code-reviewer', verdict: 'reject' }),
    ]);

    const summary = failureTracker.formatFailureSummary(project);
    expect(summary).not.toBe('');
    expect(typeof summary).toBe('string');
    // 包含 stage 名稱
    expect(summary).toContain('DEV');
    expect(summary).toContain('REVIEW');
    // 包含次數
    expect(summary).toContain('2');
  });

  test('5-3 摘要包含 topPattern', () => {
    const project = join(homedir(), '.nova', 'test-fail-summary-top-' + TIMESTAMP);
    dirsToClean.push(project);

    writeFailures(project, [
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' }),
    ]);

    const summary = failureTracker.formatFailureSummary(project);
    expect(summary).toContain('developer');
    expect(summary).toContain('DEV');
  });

  test('5-4 projectRoot 為空時回傳空字串', () => {
    expect(failureTracker.formatFailureSummary(null)).toBe('');
    expect(failureTracker.formatFailureSummary('')).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. _trimIfNeeded — 超過上限自動截斷
// ────────────────────────────────────────────────────────────────────────────

describe('_trimIfNeeded — 自動截斷', () => {
  // 暫時清除 NOVA_TEST，讓 recordFailure 能實際寫入（觸發 trim）
  let savedOvertoneTest;
  beforeEach(() => { savedOvertoneTest = process.env.NOVA_TEST; delete process.env.NOVA_TEST; });
  afterEach(() => { if (savedOvertoneTest !== undefined) process.env.NOVA_TEST = savedOvertoneTest; else delete process.env.NOVA_TEST; });

  test('6-1 超過 maxRecords 時截斷至上限', () => {
    const project = join(homedir(), '.nova', 'test-fail-trim-' + TIMESTAMP);
    dirsToClean.push(project);

    // 寫入 maxRecords + 10 筆
    const count = failureDefaults.maxRecords + 10;
    const records = [];
    for (let i = 0; i < count; i++) {
      records.push(makeRecord({ stage: `STAGE${i}`, ts: new Date(Date.now() - (count - i) * 1000).toISOString() }));
    }
    writeFailures(project, records);

    // 再寫一筆觸發 trim
    failureTracker.recordFailure(project, makeRecord({ stage: 'TRIGGER' }));

    const content = readFileSync(getFailurePath(project), 'utf8').trim();
    const lines = content.split('\n').filter(Boolean);
    // 應截斷至 maxRecords（舊記錄被截去，保留最新的）
    expect(lines.length).toBeLessThanOrEqual(failureDefaults.maxRecords);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. 損壞 JSON 行靜默跳過
// ────────────────────────────────────────────────────────────────────────────

describe('損壞 JSON 行靜默跳過', () => {
  test('7-1 損壞行不影響讀取其他記錄', () => {
    const project = join(homedir(), '.nova', 'test-fail-corrupt-' + TIMESTAMP);
    dirsToClean.push(project);
    dirsToClean.push(paths.global.dir(project));

    const filePath = getFailurePath(project);
    mkdirSync(require('path').dirname(filePath), { recursive: true });

    // 混入損壞的 JSON 行
    writeFileSync(filePath, [
      JSON.stringify(makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' })),
      'INVALID_JSON_LINE',
      JSON.stringify(makeRecord({ stage: 'REVIEW', agent: 'code-reviewer', verdict: 'reject' })),
    ].join('\n') + '\n', 'utf8');

    // 不拋出錯誤，讀到 2 筆有效記錄
    const patterns = failureTracker.getFailurePatterns(project);
    expect(patterns.totalFailures).toBe(2);
    expect(patterns.byStage['DEV'].count).toBe(1);
    expect(patterns.byStage['REVIEW'].count).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. NOVA_TEST 隔離保護
// ────────────────────────────────────────────────────────────────────────────

describe('NOVA_TEST 隔離保護', () => {
  test('8-1 NOVA_TEST=1 時 recordFailure 不寫入檔案', () => {
    const project = join(homedir(), '.nova', 'test-fail-isolation-' + TIMESTAMP);
    dirsToClean.push(project);
    clearFailures(project);

    // 確保 NOVA_TEST 已設置（setup.js 已設置）
    const saved = process.env.NOVA_TEST;
    process.env.NOVA_TEST = '1';

    const record = makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' });
    failureTracker.recordFailure(project, record);

    // 應不寫入
    expect(existsSync(getFailurePath(project))).toBe(false);

    // 恢復
    if (saved !== undefined) process.env.NOVA_TEST = saved;
    else delete process.env.NOVA_TEST;
  });

  test('8-2 清除 NOVA_TEST 後 recordFailure 正常寫入', () => {
    const project = join(homedir(), '.nova', 'test-fail-isolation-write-' + TIMESTAMP);
    dirsToClean.push(project);
    clearFailures(project);

    // 暫時清除保護
    const saved = process.env.NOVA_TEST;
    delete process.env.NOVA_TEST;

    const record = makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail' });
    failureTracker.recordFailure(project, record);

    // 應正常寫入
    expect(existsSync(getFailurePath(project))).toBe(true);

    // 恢復
    if (saved !== undefined) process.env.NOVA_TEST = saved;
    else delete process.env.NOVA_TEST;
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9. recordResolution — 已解決過濾
// ────────────────────────────────────────────────────────────────────────────

describe('recordResolution — 已解決過濾', () => {
  test('9-1 有 resolved 記錄時，該 session+stage 的 fail 被排除', () => {
    const project = join(homedir(), '.nova', 'test-fail-resolved-' + TIMESTAMP);
    dirsToClean.push(project);

    const sid = 'sess-resolved-' + TIMESTAMP;

    // 寫入：同一 session+stage 先 fail 後 resolved
    writeFailures(project, [
      makeRecord({ sessionId: sid, stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      makeRecord({ sessionId: sid, stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      { ...makeRecord({ sessionId: sid, stage: 'DEV' }), verdict: 'resolved' },
    ]);

    const patterns = failureTracker.getFailurePatterns(project);
    // 兩筆 fail 因 resolved 而被排除
    expect(patterns.totalFailures).toBe(0);
    expect(patterns.byStage['DEV']).toBeUndefined();
  });

  test('9-2 不同 session 的 fail 不受 resolved 影響', () => {
    const project = join(homedir(), '.nova', 'test-fail-resolved-other-' + TIMESTAMP);
    dirsToClean.push(project);

    const sid1 = 'sess-a-' + TIMESTAMP;
    const sid2 = 'sess-b-' + TIMESTAMP;

    // session A resolved，session B 未 resolved
    writeFailures(project, [
      makeRecord({ sessionId: sid1, stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      { ...makeRecord({ sessionId: sid1, stage: 'DEV' }), verdict: 'resolved' },
      makeRecord({ sessionId: sid2, stage: 'DEV', agent: 'developer', verdict: 'fail' }),
    ]);

    const patterns = failureTracker.getFailurePatterns(project);
    // 只剩 session B 的 fail
    expect(patterns.totalFailures).toBe(1);
    expect(patterns.byStage['DEV'].count).toBe(1);
  });

  test('9-3 不同 stage 的 resolved 只影響對應 stage', () => {
    const project = join(homedir(), '.nova', 'test-fail-resolved-stage-' + TIMESTAMP);
    dirsToClean.push(project);

    const sid = 'sess-mixed-' + TIMESTAMP;

    writeFailures(project, [
      makeRecord({ sessionId: sid, stage: 'DEV', agent: 'developer', verdict: 'fail' }),
      { ...makeRecord({ sessionId: sid, stage: 'DEV' }), verdict: 'resolved' },
      makeRecord({ sessionId: sid, stage: 'TEST', agent: 'tester', verdict: 'fail' }),
    ]);

    const patterns = failureTracker.getFailurePatterns(project);
    // DEV resolved → 排除，TEST 未 resolved → 保留
    expect(patterns.totalFailures).toBe(1);
    expect(patterns.byStage['DEV']).toBeUndefined();
    expect(patterns.byStage['TEST'].count).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 10. formatFailureSummary — 時間範圍顯示
// ────────────────────────────────────────────────────────────────────────────

describe('formatFailureSummary — 時間範圍顯示', () => {
  test('10-1 有多筆不同日期的失敗時，摘要包含時間範圍', () => {
    const project = join(homedir(), '.nova', 'test-fail-timerange-' + TIMESTAMP);
    dirsToClean.push(project);

    writeFailures(project, [
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail', ts: '2026-02-01T10:00:00.000Z' }),
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail', ts: '2026-02-15T10:00:00.000Z' }),
      makeRecord({ stage: 'TEST', agent: 'tester', verdict: 'fail', ts: '2026-03-01T10:00:00.000Z' }),
    ]);

    const summary = failureTracker.formatFailureSummary(project);
    expect(summary).not.toBe('');
    // 應包含日期範圍格式（M/DD - M/DD）
    expect(summary).toMatch(/\d+\/\d+/);
  });

  test('10-2 只有一個日期時，顯示單一日期而非範圍', () => {
    const project = join(homedir(), '.nova', 'test-fail-singledate-' + TIMESTAMP);
    dirsToClean.push(project);

    writeFailures(project, [
      makeRecord({ stage: 'DEV', agent: 'developer', verdict: 'fail', ts: '2026-03-01T10:00:00.000Z' }),
      makeRecord({ stage: 'TEST', agent: 'tester', verdict: 'fail', ts: '2026-03-01T20:00:00.000Z' }),
    ]);

    const summary = failureTracker.formatFailureSummary(project);
    expect(summary).not.toBe('');
    // 同一天，應顯示（3/1）而不是範圍
    expect(summary).toContain('3/1');
    expect(summary).not.toMatch(/3\/1 - 3\/1/);
  });

  test('10-3 無資料時 formatFailureSummary 回傳空字串（無時間範圍計算）', () => {
    const summary = failureTracker.formatFailureSummary('/tmp/no-failures-timerange-' + TIMESTAMP);
    expect(summary).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 11. getWorkflowFailureRates — 按 workflowType 聚合失敗率
// ────────────────────────────────────────────────────────────────────────────

describe('getWorkflowFailureRates', () => {
  test('B-1 failures.jsonl 不存在時回傳空物件', () => {
    const result = failureTracker.getWorkflowFailureRates('/tmp/no-workflow-failures-' + TIMESTAMP);
    expect(result).toEqual({});
  });

  test('B-2 有失敗記錄時正確按 workflowType 聚合', () => {
    const project = join(homedir(), '.nova', 'test-wf-rates-b2-' + TIMESTAMP);
    dirsToClean.push(project);

    writeFailures(project, [
      makeRecord({ workflowType: 'standard', stage: 'DEV', verdict: 'fail' }),
      makeRecord({ workflowType: 'standard', stage: 'TEST', verdict: 'fail' }),
      makeRecord({ workflowType: 'quick', stage: 'DEV', verdict: 'fail' }),
      makeRecord({ workflowType: 'standard', stage: 'REVIEW', verdict: 'reject' }),
    ]);

    const result = failureTracker.getWorkflowFailureRates(project);
    expect(Object.keys(result)).toContain('standard');
    expect(Object.keys(result)).toContain('quick');
    expect(result.standard.count).toBe(3);
    expect(result.quick.count).toBe(1);
    expect(result.standard.rate).toBe(0.75);
    expect(result.quick.rate).toBe(0.25);
  });

  test('B-3 workflowType 為 null 的記錄跳過不計入', () => {
    const project = join(homedir(), '.nova', 'test-wf-rates-b3-' + TIMESTAMP);
    dirsToClean.push(project);

    writeFailures(project, [
      makeRecord({ workflowType: 'standard', stage: 'DEV', verdict: 'fail' }),
      makeRecord({ workflowType: null, stage: 'DEV', verdict: 'fail' }),
      { ts: new Date().toISOString(), sessionId: 'test-session', stage: 'TEST', agent: 'developer', verdict: 'fail' },
    ]);

    const result = failureTracker.getWorkflowFailureRates(project);
    expect(Object.keys(result)).toEqual(['standard']);
    expect(result.standard.count).toBe(1);
    expect(result.standard.rate).toBe(1.0);
  });

  test('B-4 回傳的 rate 四捨五入至小數點後 4 位（1/3 → 0.3333）', () => {
    const project = join(homedir(), '.nova', 'test-wf-rates-b4-' + TIMESTAMP);
    dirsToClean.push(project);

    writeFailures(project, [
      makeRecord({ workflowType: 'standard', verdict: 'fail' }),
      makeRecord({ workflowType: 'standard', verdict: 'fail' }),
      makeRecord({ workflowType: 'standard', verdict: 'fail' }),
      makeRecord({ workflowType: 'quick', verdict: 'fail' }),
    ]);

    const result = failureTracker.getWorkflowFailureRates(project);
    expect(result.standard.rate).toBe(0.75);
    expect(result.quick.rate).toBe(0.25);

    // 驗證 1/3 情境（精確測試四捨五入行為）
    const project2 = join(homedir(), '.nova', 'test-wf-rates-b4b-' + TIMESTAMP);
    dirsToClean.push(project2);
    writeFailures(project2, [
      makeRecord({ workflowType: 'standard', verdict: 'fail' }),
      makeRecord({ workflowType: 'quick', verdict: 'fail' }),
      makeRecord({ workflowType: 'full', verdict: 'fail' }),
    ]);
    const result2 = failureTracker.getWorkflowFailureRates(project2);
    // 每個 rate 應為 0.3333（1/3 四捨五入至 4 位）
    expect(result2.standard.rate).toBe(0.3333);
    expect(result2.quick.rate).toBe(0.3333);
    expect(result2.full.rate).toBe(0.3333);
  });

  test('B-5 已 resolved 的失敗記錄不計入失敗率', () => {
    const project = join(homedir(), '.nova', 'test-wf-rates-b5-' + TIMESTAMP);
    dirsToClean.push(project);

    const sessionId = 'test-session-resolved-' + TIMESTAMP;
    writeFailures(project, [
      { ts: new Date().toISOString(), sessionId, workflowType: 'standard', stage: 'DEV', agent: 'developer', verdict: 'fail' },
      { ts: new Date().toISOString(), sessionId, workflowType: 'standard', stage: 'DEV', agent: 'developer', verdict: 'resolved' },
      { ts: new Date().toISOString(), sessionId: 'other-session-' + TIMESTAMP, workflowType: 'standard', stage: 'TEST', agent: 'tester', verdict: 'fail' },
    ]);

    const result = failureTracker.getWorkflowFailureRates(project);
    // 第一筆 fail 被 resolved 過濾，只剩第三筆
    expect(result.standard.count).toBe(1);
    expect(result.standard.rate).toBe(1.0);
  });
});
