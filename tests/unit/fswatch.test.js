'use strict';
/**
 * fswatch.test.js — fswatch.js 單元測試
 *
 * 對照 specs/features/in-progress/p3-3-system/bdd.md 中的
 * watchPath / stopWatch / listWatchers 情境（共 14 個 scenario + 1 整合）。
 */

const { describe, it, expect, afterEach } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_DIR } = require('../helpers/paths');

// ── 路徑 ──
const FSWATCH_MODULE = join(SCRIPTS_DIR, 'os', 'fswatch');

// ── 平台覆寫工具 ──
let originalPlatformDesc;

function mockPlatform(value) {
  originalPlatformDesc = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

function restorePlatform() {
  if (originalPlatformDesc) {
    Object.defineProperty(process, 'platform', originalPlatformDesc);
  }
}

// ── fs.watch Mock 工具 ──

/**
 * 建立可觸發事件的 fs.watch mock
 * 回傳函式本身作為 watchFn，並附加 trigger / watcher 屬性
 */
function makeFsWatchMock() {
  let eventCallback;
  const watcher = {
    close: () => {},
  };
  const watchFn = (_path, cb) => {
    eventCallback = cb;
    return watcher;
  };
  // 提供觸發事件的方式
  watchFn.trigger = (eventType, filename) => {
    if (eventCallback) eventCallback(eventType, filename);
  };
  watchFn.watcher = watcher;
  return watchFn;
}

/**
 * 建立會拋出例外的 fs.watch mock
 */
function makeFsWatchFail(msg) {
  return () => {
    throw new Error(msg);
  };
}

// ── watchPath ──

describe('watchPath', () => {
  afterEach(() => {
    restorePlatform();
    const { _resetForTest } = require(FSWATCH_MODULE);
    _resetForTest();
  });

  it('Scenario: 成功開始監控有效路徑 → ok + watcherId 格式正確', () => {
    mockPlatform('darwin');
    const { watchPath } = require(FSWATCH_MODULE);
    const mockWatch = makeFsWatchMock();
    const callback = () => {};

    const result = watchPath('/tmp/test-dir', callback, { watch: mockWatch });

    expect(result.ok).toBe(true);
    expect(typeof result.watcherId).toBe('string');
    expect(result.watcherId.length).toBeGreaterThan(0);
    // 驗證格式：{timestamp}-{random}，如 1709500000000-abc123
    expect(/^\d+-[a-z0-9]+$/.test(result.watcherId)).toBe(true);
  });

  it('Scenario: watcher 已記錄在 module-level Map 中', () => {
    mockPlatform('darwin');
    const { watchPath, listWatchers } = require(FSWATCH_MODULE);
    const mockWatch = makeFsWatchMock();

    const result = watchPath('/tmp/test-dir', () => {}, { watch: mockWatch });

    const listed = listWatchers();
    expect(listed.ok).toBe(true);
    expect(listed.watchers.some(w => w.id === result.watcherId)).toBe(true);
  });

  it('Scenario: 檔案變更時 callback 被呼叫一次', () => {
    mockPlatform('darwin');
    const { watchPath } = require(FSWATCH_MODULE);
    const mockWatch = makeFsWatchMock();

    let callCount = 0;
    watchPath('/tmp/test-dir', () => { callCount++; }, { watch: mockWatch });

    mockWatch.trigger('change', 'file.txt');

    expect(callCount).toBe(1);
  });

  it('Scenario: callback 收到帶有完整欄位的 WatchEvent', () => {
    mockPlatform('darwin');
    const { watchPath } = require(FSWATCH_MODULE);
    const mockWatch = makeFsWatchMock();

    let receivedEvent = null;
    const result = watchPath('/tmp/test-dir', (event) => {
      receivedEvent = event;
    }, { watch: mockWatch });

    mockWatch.trigger('change', 'test.txt');

    expect(receivedEvent).not.toBeNull();
    expect(receivedEvent.watcherId).toBe(result.watcherId);
    expect(receivedEvent.path).toBe('/tmp/test-dir');
    expect(receivedEvent.eventType).toBe('change');
    expect(receivedEvent.filename).toBe('test.txt');
    // timestamp 為 ISO 8601 格式
    expect(typeof receivedEvent.timestamp).toBe('string');
    expect(() => new Date(receivedEvent.timestamp)).not.toThrow();
    expect(new Date(receivedEvent.timestamp).toISOString()).toBe(receivedEvent.timestamp);
  });

  it('Scenario: targetPath 為空字串時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { watchPath } = require(FSWATCH_MODULE);

    const result = watchPath('', () => {});

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: targetPath 為 null 時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { watchPath } = require(FSWATCH_MODULE);

    const result = watchPath(null, () => {});

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: targetPath 為 undefined 時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { watchPath } = require(FSWATCH_MODULE);

    const result = watchPath(undefined, () => {});

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: targetPath 無效時不呼叫 watch', () => {
    mockPlatform('darwin');
    const { watchPath } = require(FSWATCH_MODULE);
    let watchCalled = false;
    const mockWatch = (_p, _cb) => { watchCalled = true; return { close: () => {} }; };

    watchPath('', () => {}, { watch: mockWatch });

    expect(watchCalled).toBe(false);
  });

  it('Scenario: callback 不是 function 時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { watchPath } = require(FSWATCH_MODULE);

    const result = watchPath('/tmp/test-dir', 'not-a-function');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: callback 無效時不呼叫 watch', () => {
    mockPlatform('darwin');
    const { watchPath } = require(FSWATCH_MODULE);
    let watchCalled = false;
    const mockWatch = (_p, _cb) => { watchCalled = true; return { close: () => {} }; };

    watchPath('/tmp/test-dir', 'not-a-function', { watch: mockWatch });

    expect(watchCalled).toBe(false);
  });

  it('Scenario: watch 啟動失敗時回傳 COMMAND_FAILED', () => {
    mockPlatform('darwin');
    const { watchPath } = require(FSWATCH_MODULE);
    const mockWatch = makeFsWatchFail('ENOENT: no such file or directory');

    const result = watchPath('/nonexistent/path', () => {}, { watch: mockWatch });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: watch 啟動失敗時不拋出例外', () => {
    mockPlatform('darwin');
    const { watchPath } = require(FSWATCH_MODULE);
    const mockWatch = makeFsWatchFail('some failure');

    expect(() => watchPath('/bad/path', () => {}, { watch: mockWatch })).not.toThrow();
  });

  it('Scenario: 非 macOS 平台時回傳 UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { watchPath } = require(FSWATCH_MODULE);

    const result = watchPath('/tmp/test-dir', () => {});

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario: 非 macOS 平台時不拋出例外', () => {
    mockPlatform('win32');
    const { watchPath } = require(FSWATCH_MODULE);

    expect(() => watchPath('/tmp/test-dir', () => {})).not.toThrow();
  });
});

// ── stopWatch ──

describe('stopWatch', () => {
  afterEach(() => {
    restorePlatform();
    const { _resetForTest } = require(FSWATCH_MODULE);
    _resetForTest();
  });

  it('Scenario: 使用有效 watcherId 成功停止監控 → ok', () => {
    mockPlatform('darwin');
    const { watchPath, stopWatch } = require(FSWATCH_MODULE);
    const mockWatch = makeFsWatchMock();

    const startResult = watchPath('/tmp/test-dir', () => {}, { watch: mockWatch });
    const result = stopWatch(startResult.watcherId);

    expect(result.ok).toBe(true);
  });

  it('Scenario: stopWatch 後 watcher 從 Map 中移除', () => {
    mockPlatform('darwin');
    const { watchPath, stopWatch, listWatchers } = require(FSWATCH_MODULE);
    const mockWatch = makeFsWatchMock();

    const startResult = watchPath('/tmp/test-dir', () => {}, { watch: mockWatch });
    stopWatch(startResult.watcherId);

    const listed = listWatchers();
    expect(listed.watchers.some(w => w.id === startResult.watcherId)).toBe(false);
  });

  it('Scenario: stopWatch 後底層 FSWatcher 的 close() 被呼叫', () => {
    mockPlatform('darwin');
    const { watchPath, stopWatch } = require(FSWATCH_MODULE);
    const mockWatch = makeFsWatchMock();
    let closeCalled = false;
    mockWatch.watcher.close = () => { closeCalled = true; };

    const startResult = watchPath('/tmp/test-dir', () => {}, { watch: mockWatch });
    stopWatch(startResult.watcherId);

    expect(closeCalled).toBe(true);
  });

  it('Scenario: 使用不存在的 watcherId 時回傳 WATCHER_NOT_FOUND', () => {
    const { stopWatch } = require(FSWATCH_MODULE);

    const result = stopWatch('nonexistent-id');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('WATCHER_NOT_FOUND');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: 不存在的 watcherId 時不拋出例外', () => {
    const { stopWatch } = require(FSWATCH_MODULE);

    expect(() => stopWatch('nonexistent-id')).not.toThrow();
  });

  it('Scenario: watcherId 為空字串時回傳 WATCHER_NOT_FOUND', () => {
    const { stopWatch } = require(FSWATCH_MODULE);

    const result = stopWatch('');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('WATCHER_NOT_FOUND');
    expect(result.message).toBeTruthy();
  });
});

// ── listWatchers ──

describe('listWatchers', () => {
  afterEach(() => {
    restorePlatform();
    const { _resetForTest } = require(FSWATCH_MODULE);
    _resetForTest();
  });

  it('Scenario: 有活躍監控器時回傳完整清單', () => {
    mockPlatform('darwin');
    const { watchPath, listWatchers } = require(FSWATCH_MODULE);

    const mockWatchA = makeFsWatchMock();
    const mockWatchB = makeFsWatchMock();
    watchPath('/tmp/dir-a', () => {}, { watch: mockWatchA });
    watchPath('/tmp/dir-b', () => {}, { watch: mockWatchB });

    const result = listWatchers();

    expect(result.ok).toBe(true);
    expect(result.watchers.length).toBe(2);
    const paths = result.watchers.map(w => w.path);
    expect(paths).toContain('/tmp/dir-a');
    expect(paths).toContain('/tmp/dir-b');
  });

  it('Scenario: 每個元素包含 id、path、startedAt 欄位', () => {
    mockPlatform('darwin');
    const { watchPath, listWatchers } = require(FSWATCH_MODULE);
    const mockWatch = makeFsWatchMock();

    watchPath('/tmp/dir-a', () => {}, { watch: mockWatch });

    const result = listWatchers();
    const entry = result.watchers[0];

    expect(typeof entry.id).toBe('string');
    expect(typeof entry.path).toBe('string');
    expect(typeof entry.startedAt).toBe('string');
    // startedAt 為 ISO 8601
    expect(new Date(entry.startedAt).toISOString()).toBe(entry.startedAt);
  });

  it('Scenario: 沒有活躍監控器時回傳空陣列', () => {
    const { listWatchers } = require(FSWATCH_MODULE);

    const result = listWatchers();

    expect(result.ok).toBe(true);
    expect(result.watchers).toEqual([]);
  });

  it('Scenario: listWatchers 永遠成功（ok 永遠為 true）', () => {
    const { listWatchers } = require(FSWATCH_MODULE);

    const result = listWatchers();

    expect(result.ok).toBe(true);
  });

  it('Scenario: listWatchers 不拋出例外', () => {
    const { listWatchers } = require(FSWATCH_MODULE);

    expect(() => listWatchers()).not.toThrow();
  });
});

// ── 整合場景 ──

describe('fswatch 完整生命週期', () => {
  afterEach(() => {
    restorePlatform();
    const { _resetForTest } = require(FSWATCH_MODULE);
    _resetForTest();
  });

  it('Scenario: 開始監控 → listWatchers 確認 → 觸發事件 → stopWatch → listWatchers 確認移除', () => {
    mockPlatform('darwin');
    const { watchPath, stopWatch, listWatchers } = require(FSWATCH_MODULE);
    const mockWatch = makeFsWatchMock();

    let callbackCount = 0;
    // 1. 開始監控
    const startResult = watchPath('/tmp/lifecycle-test', () => { callbackCount++; }, { watch: mockWatch });
    expect(startResult.ok).toBe(true);
    const { watcherId } = startResult;

    // 2. listWatchers 確認存在
    const listedBefore = listWatchers();
    expect(listedBefore.watchers.some(w => w.id === watcherId)).toBe(true);

    // 3. 觸發一次 change 事件
    mockWatch.trigger('change', 'lifecycle.txt');
    expect(callbackCount).toBe(1);

    // 4. 停止監控
    const stopResult = stopWatch(watcherId);
    expect(stopResult.ok).toBe(true);

    // 5. listWatchers 確認已移除
    const listedAfter = listWatchers();
    expect(listedAfter.watchers.some(w => w.id === watcherId)).toBe(false);
  });
});

// ── Module exports 完整性 ──

describe('fswatch.js module exports', () => {
  it('導出 watchPath、stopWatch、listWatchers、_resetForTest', () => {
    const fswatch = require(FSWATCH_MODULE);
    expect(typeof fswatch.watchPath).toBe('function');
    expect(typeof fswatch.stopWatch).toBe('function');
    expect(typeof fswatch.listWatchers).toBe('function');
    expect(typeof fswatch._resetForTest).toBe('function');
  });
});
