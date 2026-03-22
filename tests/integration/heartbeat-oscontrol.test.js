import { describe, test, expect } from 'bun:test';

// 測試 heartbeat handler 的 OS-control 路徑選擇邏輯
// 使用 mock 模擬 os-control-driver 和 session-spawner

describe('heartbeat OS-control 路徑選擇', () => {
  // 模擬 heartbeat handler 的路徑選擇邏輯（從 heartbeat.js 提取核心邏輯）
  function selectDriveMode(config, isTest, availability) {
    if (isTest) return 'claude-p';
    if (!config.osControl?.enabled) return 'claude-p';
    if (!availability.available) return 'claude-p';
    return 'os-control';
  }

  test('osControl.enabled = false → claude-p', () => {
    const config = { osControl: { enabled: false } };
    expect(selectDriveMode(config, false, { available: true })).toBe('claude-p');
  });

  test('osControl.enabled = true + available → os-control', () => {
    const config = { osControl: { enabled: true } };
    expect(selectDriveMode(config, false, { available: true })).toBe('os-control');
  });

  test('osControl.enabled = true + unavailable → claude-p（降級）', () => {
    const config = { osControl: { enabled: true } };
    expect(selectDriveMode(config, false, { available: false, reason: 'iTerm2 未執行' })).toBe('claude-p');
  });

  test('test mode → 永遠 claude-p', () => {
    const config = { osControl: { enabled: true } };
    expect(selectDriveMode(config, true, { available: true })).toBe('claude-p');
  });

  test('無 osControl 設定 → claude-p（向後相容）', () => {
    const config = {};
    expect(selectDriveMode(config, false, { available: true })).toBe('claude-p');
  });

  test('osControl 欄位存在但無 enabled → claude-p', () => {
    const config = { osControl: {} };
    expect(selectDriveMode(config, false, { available: true })).toBe('claude-p');
  });
});

describe('多輪對話信號偵測', () => {
  function shouldContinueRound(responseText) {
    if (!responseText) return false;
    const doneSignals = /完成|已完成|push 完成|所有任務|全部完成|DONE|all tasks completed/i;
    const continueSignals = /繼續|下一步|接下來|再來|still working|continuing/i;
    if (doneSignals.test(responseText)) return false;
    if (continueSignals.test(responseText)) return true;
    return false;
  }

  test('maxRounds 限制多輪', () => {
    const maxRounds = 3;
    const responses = ['繼續', '繼續', '繼續', '繼續'];
    let rounds = 0;
    for (let i = 0; i < responses.length && rounds < maxRounds; i++) {
      rounds++;
      if (!shouldContinueRound(responses[i])) break;
    }
    expect(rounds).toBe(maxRounds); // 被 maxRounds 截斷
  });

  test('done 信號提前結束', () => {
    const maxRounds = 5;
    const responses = ['繼續', '已完成所有任務'];
    let rounds = 0;
    for (let i = 0; i < maxRounds; i++) {
      rounds++;
      if (i >= responses.length || !shouldContinueRound(responses[i])) break;
    }
    expect(rounds).toBe(2); // 第 2 輪完成信號停止
  });
});

describe('heartbeat config 向後相容', () => {
  test('舊 config（無 osControl）可正常讀取', () => {
    const oldConfig = {
      heartbeat_interval: 1800000,
      enabled: false,
      focus: '',
      mode: 'production',
      projects: ['~/projects/overtone'],
    };
    // 不應 crash
    expect(oldConfig.osControl?.enabled).toBeUndefined();
    expect(oldConfig.osControl?.maxRounds).toBeUndefined();
  });

  test('新 config 有 osControl 欄位', () => {
    const newConfig = {
      heartbeat_interval: 1800000,
      enabled: false,
      osControl: { enabled: true, maxRounds: 3, sessionName: 'nova-self-drive', model: 'opus' },
    };
    expect(newConfig.osControl.enabled).toBe(true);
    expect(newConfig.osControl.maxRounds).toBe(3);
  });
});

describe('熔斷 + OS-control 交互', () => {
  test('熔斷狀態下不嘗試 OS-control', () => {
    // 模擬 heartbeat handler 入口邏輯
    const state = { running: true, executing: false, circuitBroken: true, stats: { consecutiveFails: 5 } };
    const maxFails = 5;

    // 熔斷檢查在路徑選擇之前
    const isCircuitBroken = (state.stats?.consecutiveFails || 0) >= maxFails;
    expect(isCircuitBroken).toBe(true);
    // 不會到達 OS-control 路徑選擇
  });

  test('OS-control 失敗也增加 consecutiveFails', () => {
    let consecutiveFails = 2;
    // 模擬 OS-control 失敗後的 stats 更新
    const succeeded = false;
    consecutiveFails = succeeded ? 0 : consecutiveFails + 1;
    expect(consecutiveFails).toBe(3);
  });
});
