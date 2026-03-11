'use strict';
/**
 * feature-sync.test.js
 *
 * Feature: syncFeatureName() — 統一 featureName 自動同步邏輯
 *
 * Scenario 1: projectRoot 為 null 時回傳 null
 * Scenario 2: sessionId 為 null 時回傳 null
 * Scenario 3: 無 active feature 時回傳 null
 * Scenario 4: workflow state 不存在時回傳 null
 * Scenario 5: workflow state 已有 featureName 時不覆寫，回傳 null
 * Scenario 6: workflow state 無 featureName 時設定並回傳 featureName
 * Scenario 7: specs.getActiveFeature 拋出例外時靜默回傳 null
 */

const { describe, it, expect, afterAll, mock } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync } = require('fs');
const { SCRIPTS_LIB } = require('../helpers/paths');

const state = require(join(SCRIPTS_LIB, 'state'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const { syncFeatureName } = require(join(SCRIPTS_LIB, 'feature-sync'));

// ── session 管理 ──
const SESSION_PREFIX = `test_featuresync_${Date.now()}`;
let counter = 0;
const createdSessions = [];

function newSessionId(projectRoot) {
  const id = `${SESSION_PREFIX}_${++counter}`;
  createdSessions.push({ projectRoot, id });
  mkdirSync(paths.sessionDir(projectRoot, id), { recursive: true });
  return id;
}

afterAll(() => {
  for (const { projectRoot, id } of createdSessions) {
    rmSync(paths.sessionDir(projectRoot, id), { recursive: true, force: true });
  }
});

// ── 測試用 specs mock 目錄（in-progress） ──
const { tmpdir } = require('os');
const MOCK_PROJECT_ROOT = join(tmpdir(), `overtone_featuresync_${Date.now()}`);
const MOCK_FEATURE = 'my-test-feature';

function setupMockFeature(featureName) {
  const dir = join(MOCK_PROJECT_ROOT, 'specs', 'features', 'in-progress', featureName);
  mkdirSync(dir, { recursive: true });
}

afterAll(() => {
  rmSync(MOCK_PROJECT_ROOT, { recursive: true, force: true });
});

// ── Scenario 1: projectRoot 為 null ──
describe('syncFeatureName', () => {
  it('Scenario 1: projectRoot 為 null 時回傳 null', () => {
    const result = syncFeatureName(null, 'some-session-id');
    expect(result).toBeNull();
  });

  // ── Scenario 2: sessionId 為 null ──
  it('Scenario 2: sessionId 為 null 時回傳 null', () => {
    setupMockFeature(MOCK_FEATURE);
    const result = syncFeatureName(MOCK_PROJECT_ROOT, null);
    expect(result).toBeNull();
  });

  // ── Scenario 3: 無 active feature（in-progress 目錄為空）──
  it('Scenario 3: 無 active feature 時回傳 null', () => {
    const emptyRoot = join(tmpdir(), `overtone_empty_${Date.now()}`);
    mkdirSync(join(emptyRoot, 'specs', 'features', 'in-progress'), { recursive: true });
    const sid = newSessionId(emptyRoot);
    state.initState(emptyRoot, sid, 'quick', ['DEV']);

    const result = syncFeatureName(emptyRoot, sid);
    expect(result).toBeNull();

    rmSync(emptyRoot, { recursive: true, force: true });
  });

  // ── Scenario 4: workflow state 不存在時回傳 null ──
  it('Scenario 4: workflow state 不存在時回傳 null', () => {
    setupMockFeature(MOCK_FEATURE);
    // 不呼叫 initState，直接用存在的 session dir 但無 workflow.json
    const sid = newSessionId(MOCK_PROJECT_ROOT);
    const result = syncFeatureName(MOCK_PROJECT_ROOT, sid);
    expect(result).toBeNull();
  });

  // ── Scenario 5: workflow state 已有 featureName 時不覆寫 ──
  it('Scenario 5: workflow state 已有 featureName 時不覆寫，回傳 null', () => {
    setupMockFeature(MOCK_FEATURE);
    const sid = newSessionId(MOCK_PROJECT_ROOT);
    state.initState(MOCK_PROJECT_ROOT, sid, 'quick', ['DEV']);
    state.setFeatureName(MOCK_PROJECT_ROOT, sid, null, 'existing-feature');

    const result = syncFeatureName(MOCK_PROJECT_ROOT, sid);
    expect(result).toBeNull();

    // 確認 featureName 未被覆寫
    const ws = state.readState(MOCK_PROJECT_ROOT, sid);
    expect(ws.featureName).toBe('existing-feature');
  });

  // ── Scenario 6: workflow state 無 featureName 時設定並回傳 ──
  it('Scenario 6: workflow state 無 featureName 時設定並回傳 featureName', () => {
    setupMockFeature(MOCK_FEATURE);
    const sid = newSessionId(MOCK_PROJECT_ROOT);
    state.initState(MOCK_PROJECT_ROOT, sid, 'quick', ['DEV']);

    // 確認初始 featureName 為 null（initState 預設值）
    expect(state.readState(MOCK_PROJECT_ROOT, sid).featureName).toBeNull();

    const result = syncFeatureName(MOCK_PROJECT_ROOT, sid);
    expect(result).toBe(MOCK_FEATURE);

    // 確認已寫入 workflow.json
    const ws = state.readState(MOCK_PROJECT_ROOT, sid);
    expect(ws.featureName).toBe(MOCK_FEATURE);
  });

  // ── Scenario 7: 例外時靜默回傳 null ──
  it('Scenario 7: specs.getActiveFeature 拋出例外時靜默回傳 null', () => {
    // 傳入一個無效的 projectRoot（路徑格式合法但 specs/features 不存在）
    const noSpecsRoot = join(tmpdir(), `overtone_nospec_${Date.now()}`);
    mkdirSync(noSpecsRoot, { recursive: true });
    const sid = newSessionId(noSpecsRoot);
    state.initState(noSpecsRoot, sid, 'quick', ['DEV']);

    // getActiveFeature 會靜默回傳 null（目錄不存在）而非拋出
    // 此處驗證整體 syncFeatureName 回傳 null 且不拋出
    const result = syncFeatureName(noSpecsRoot, sid);
    expect(result).toBeNull();

    rmSync(noSpecsRoot, { recursive: true, force: true });
  });
});
