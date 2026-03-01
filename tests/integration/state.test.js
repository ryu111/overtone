'use strict';
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

// 使用獨立的測試 session ID 避免污染
const TEST_SESSION = `test_state_${Date.now()}`;
const SESSION_DIR = join(homedir(), '.overtone', 'sessions', TEST_SESSION);

const state = require(join(SCRIPTS_LIB, 'state'));

beforeEach(() => {
  mkdirSync(SESSION_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(SESSION_DIR, { recursive: true, force: true });
});

describe('readState', () => {
  test('不存在的 session 回傳 null', () => {
    expect(state.readState('nonexistent_session_id')).toBeNull();
  });

  test('損壞的 JSON 回傳 null', () => {
    const { writeFileSync } = require('fs');
    const paths = require(join(SCRIPTS_LIB, 'paths'));
    writeFileSync(paths.session.workflow(TEST_SESSION), 'not valid json', 'utf8');
    expect(state.readState(TEST_SESSION)).toBeNull();
  });
});

describe('writeState / readState 往返', () => {
  test('寫入後能正確讀回', () => {
    const data = { sessionId: TEST_SESSION, workflowType: 'quick', stages: {} };
    state.writeState(TEST_SESSION, data);
    const result = state.readState(TEST_SESSION);
    expect(result).toEqual(data);
  });

  test('原子寫入不留殘餘 tmp 檔案', () => {
    state.writeState(TEST_SESSION, { test: true });
    const paths = require(join(SCRIPTS_LIB, 'paths'));
    const dir = require('path').dirname(paths.session.workflow(TEST_SESSION));
    const files = require('fs').readdirSync(dir);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    expect(tmpFiles.length).toBe(0);
  });
});

describe('initState', () => {
  test('初始化正確的 stage 結構', () => {
    const result = state.initState(TEST_SESSION, 'quick', ['DEV', 'REVIEW', 'TEST']);
    expect(result.workflowType).toBe('quick');
    expect(result.currentStage).toBe('DEV');
    expect(Object.keys(result.stages)).toEqual(['DEV', 'REVIEW', 'TEST']);
    expect(result.stages.DEV.status).toBe('pending');
    expect(result.failCount).toBe(0);
  });

  test('重複 stage 自動加編號', () => {
    const result = state.initState(TEST_SESSION, 'tdd', ['TEST', 'DEV', 'TEST']);
    const keys = Object.keys(result.stages);
    expect(keys).toEqual(['TEST', 'DEV', 'TEST:2']);
  });

  test('TEST stage 正確標記 spec/verify mode', () => {
    const result = state.initState(TEST_SESSION, 'standard',
      ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST']);
    expect(result.stages.TEST.mode).toBe('spec');
    expect(result.stages['TEST:2'].mode).toBe('verify');
  });
});

describe('updateStage', () => {
  test('更新 stage 狀態並自動推進 currentStage', () => {
    state.initState(TEST_SESSION, 'quick', ['DEV', 'REVIEW', 'TEST']);
    const updated = state.updateStage(TEST_SESSION, 'DEV', {
      status: 'completed',
      result: 'pass',
    });
    expect(updated.stages.DEV.status).toBe('completed');
    expect(updated.stages.DEV.result).toBe('pass');
    expect(updated.currentStage).toBe('REVIEW');
  });

  test('不存在的 session 拋出錯誤', () => {
    expect(() => state.updateStage('nonexistent', 'DEV', {})).toThrow();
  });

  test('不存在的 stage 拋出錯誤', () => {
    state.initState(TEST_SESSION, 'single', ['DEV']);
    expect(() => state.updateStage(TEST_SESSION, 'NONEXISTENT', {})).toThrow();
  });
});

describe('setActiveAgent / removeActiveAgent', () => {
  test('新增和移除 active agent', () => {
    state.initState(TEST_SESSION, 'quick', ['DEV', 'REVIEW', 'TEST']);

    state.setActiveAgent(TEST_SESSION, 'developer', 'DEV');
    let s = state.readState(TEST_SESSION);
    expect(s.activeAgents.developer).toBeDefined();
    expect(s.activeAgents.developer.stage).toBe('DEV');

    state.removeActiveAgent(TEST_SESSION, 'developer');
    s = state.readState(TEST_SESSION);
    expect(s.activeAgents.developer).toBeUndefined();
  });

  test('不存在的 session 靜默處理', () => {
    // 不應拋出
    state.setActiveAgent('nonexistent', 'developer', 'DEV');
    state.removeActiveAgent('nonexistent', 'developer');
  });
});

describe('setFeatureName', () => {
  test('設定 featureName 後能正確讀回', () => {
    state.initState(TEST_SESSION, 'standard', ['PLAN', 'DEV']);
    state.setFeatureName(TEST_SESSION, 'my-feature');
    const s = state.readState(TEST_SESSION);
    expect(s.featureName).toBe('my-feature');
  });

  test('覆蓋已有的 featureName', () => {
    state.initState(TEST_SESSION, 'quick', ['DEV'], { featureName: 'old-feature' });
    state.setFeatureName(TEST_SESSION, 'new-feature');
    const s = state.readState(TEST_SESSION);
    expect(s.featureName).toBe('new-feature');
  });

  test('不存在的 session 靜默忽略（不拋出）', () => {
    expect(() => state.setFeatureName('nonexistent_session', 'my-feature')).not.toThrow();
  });

  test('setFeatureName 後 workflowType、stages、currentStage、failCount 不受影響', () => {
    // Scenario 2：其他 state 欄位不受 setFeatureName 影響
    state.initState(TEST_SESSION, 'quick', ['DEV', 'REVIEW', 'TEST']);
    const before = state.readState(TEST_SESSION);

    state.setFeatureName(TEST_SESSION, 'new-feature-name');

    const after = state.readState(TEST_SESSION);
    expect(after.featureName).toBe('new-feature-name');
    // 其他欄位值不變
    expect(after.workflowType).toBe(before.workflowType);
    expect(after.currentStage).toBe(before.currentStage);
    expect(after.failCount).toBe(before.failCount);
    expect(after.stages).toEqual(before.stages);
  });

  test('setFeatureName 不建立新檔案（session 不存在時）', () => {
    const nonexistentId = `nonexistent_sfn_${Date.now()}`;
    state.setFeatureName(nonexistentId, 'any-name');
    // session 目錄不應被建立
    expect(state.readState(nonexistentId)).toBeNull();
  });
});

describe('updateStateAtomic', () => {
  test('單次原子更新：合併多個修改', () => {
    state.initState(TEST_SESSION, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.setActiveAgent(TEST_SESSION, 'developer', 'DEV');

    const result = state.updateStateAtomic(TEST_SESSION, (s) => {
      delete s.activeAgents.developer;
      s.stages.DEV.status = 'completed';
      s.stages.DEV.result = 'pass';
      s.failCount = 1;
      // 推進 currentStage
      const keys = Object.keys(s.stages);
      const next = keys.find(k => s.stages[k].status === 'pending');
      if (next) s.currentStage = next;
      return s;
    });

    expect(result.activeAgents.developer).toBeUndefined();
    expect(result.stages.DEV.status).toBe('completed');
    expect(result.failCount).toBe(1);
    expect(result.currentStage).toBe('REVIEW');
  });

  test('不存在的 session 拋出錯誤', () => {
    expect(() => state.updateStateAtomic('nonexistent', s => s)).toThrow();
  });

  test('modifier 回傳值正確寫入', () => {
    state.initState(TEST_SESSION, 'single', ['DEV']);
    state.updateStateAtomic(TEST_SESSION, (s) => {
      s.rejectCount = 5;
      return s;
    });
    const s = state.readState(TEST_SESSION);
    expect(s.rejectCount).toBe(5);
  });
});
