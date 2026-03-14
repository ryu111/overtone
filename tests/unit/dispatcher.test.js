import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';

const TEST_MODULES_DIR = join(import.meta.dir, '__test_modules__');

// --- 從 dispatcher.js 提取核心邏輯進行單元測試 ---

function testDispatch(handlerMap, eventType, matcher, input) {
  const found = [];

  if (matcher) {
    for (const m of matcher.split('|')) {
      const key = `${eventType}:${m}`;
      if (handlerMap.has(key)) found.push(...handlerMap.get(key));
    }
  }

  if (handlerMap.has(eventType)) found.push(...handlerMap.get(eventType));

  const seen = new Set();
  const unique = found.filter(h => {
    if (seen.has(h.fn)) return false;
    seen.add(h.fn);
    return true;
  });

  let decision = 'allow';
  let reason = null;
  const allEvents = [];

  for (const { fn } of unique) {
    try {
      const result = fn(input);
      if (result?.decision === 'block') {
        decision = 'block';
        reason = result.reason;
      }
      if (result?.events) allEvents.push(...result.events);
    } catch {}
  }

  return { decision, reason, events: allEvents, handlers: unique.length };
}

function testLoadModules(dir) {
  const { readdirSync } = require('fs');
  const map = new Map();
  if (!existsSync(dir)) return map;
  const files = readdirSync(dir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      const filePath = join(dir, file);
      delete require.cache[filePath];
      const mod = require(filePath);
      const handlers = mod.default?.on || mod.on || {};
      for (const [key, fn] of Object.entries(handlers)) {
        if (typeof fn !== 'function') continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ fn, module: file });
      }
    } catch {}
  }
  return map;
}

// --- Tests ---

describe('Dispatcher dispatch 路由', () => {
  test('精確 key 匹配', () => {
    const handlerMap = new Map();
    handlerMap.set('PreToolUse:Bash', [{ fn: () => ({ decision: 'block', reason: 'danger' }), module: 'test' }]);

    const result = testDispatch(handlerMap, 'PreToolUse', 'Bash', {});
    expect(result.decision).toBe('block');
    expect(result.reason).toBe('danger');
  });

  test('寬鬆 key 匹配（無 matcher）', () => {
    const handlerMap = new Map();
    handlerMap.set('PostToolUse', [{ fn: () => ({ decision: 'allow', events: [{ type: 'tool_use' }] }), module: 'test' }]);

    const result = testDispatch(handlerMap, 'PostToolUse', null, {});
    expect(result.decision).toBe('allow');
    expect(result.events).toHaveLength(1);
  });

  test('| 分隔 matcher 展開查找', () => {
    const handlerMap = new Map();
    handlerMap.set('PreToolUse:Write', [{ fn: () => ({ decision: 'allow' }), module: 'a' }]);
    handlerMap.set('PreToolUse:Edit', [{ fn: () => ({ decision: 'allow' }), module: 'b' }]);

    const result = testDispatch(handlerMap, 'PreToolUse', 'Write|Edit', {});
    expect(result.handlers).toBe(2);
  });

  test('無匹配 handler 返回 allow', () => {
    const result = testDispatch(new Map(), 'Unknown', null, {});
    expect(result.decision).toBe('allow');
    expect(result.handlers).toBe(0);
  });

  test('精確 + 寬鬆同時匹配', () => {
    const fn1 = () => ({ decision: 'allow', events: [{ type: 'a' }] });
    const fn2 = () => ({ decision: 'allow', events: [{ type: 'b' }] });
    const handlerMap = new Map();
    handlerMap.set('PreToolUse:Agent', [{ fn: fn1, module: 'flow' }]);
    handlerMap.set('PreToolUse', [{ fn: fn2, module: 'other' }]);

    const result = testDispatch(handlerMap, 'PreToolUse', 'Agent', {});
    expect(result.handlers).toBe(2);
    expect(result.events).toHaveLength(2);
  });
});

describe('Dispatcher 結果聚合', () => {
  test('block AND 語意：任一 block → 整體 block', () => {
    const handlerMap = new Map();
    handlerMap.set('PreToolUse:Bash', [
      { fn: () => ({ decision: 'allow' }), module: 'a' },
      { fn: () => ({ decision: 'block', reason: 'danger' }), module: 'b' },
    ]);

    const result = testDispatch(handlerMap, 'PreToolUse', 'Bash', {});
    expect(result.decision).toBe('block');
    expect(result.reason).toBe('danger');
  });

  test('全部 allow → 整體 allow', () => {
    const handlerMap = new Map();
    handlerMap.set('SessionStart', [
      { fn: () => ({ decision: 'allow' }), module: 'a' },
      { fn: () => ({ decision: 'allow' }), module: 'b' },
    ]);

    const result = testDispatch(handlerMap, 'SessionStart', null, {});
    expect(result.decision).toBe('allow');
  });

  test('事件從多個 handler 收集', () => {
    const handlerMap = new Map();
    handlerMap.set('SessionStart', [
      { fn: () => ({ decision: 'allow', events: [{ type: 'session_start' }] }), module: 'a' },
      { fn: () => ({ decision: 'allow', events: [{ type: 'extra_info' }] }), module: 'b' },
    ]);

    const result = testDispatch(handlerMap, 'SessionStart', null, {});
    expect(result.events).toHaveLength(2);
    expect(result.events[0].type).toBe('session_start');
    expect(result.events[1].type).toBe('extra_info');
  });

  test('handler 拋出例外不影響其他 handler', () => {
    const handlerMap = new Map();
    handlerMap.set('Test', [
      { fn: () => { throw new Error('boom'); }, module: 'bad' },
      { fn: () => ({ decision: 'allow', events: [{ type: 'ok' }] }), module: 'good' },
    ]);

    const result = testDispatch(handlerMap, 'Test', null, {});
    expect(result.decision).toBe('allow');
    expect(result.events).toHaveLength(1);
  });
});

describe('Dispatcher handler 去重', () => {
  test('同一 handler 精確+寬鬆匹配只執行一次', () => {
    const fn = () => ({ decision: 'allow' });
    const handlerMap = new Map();
    handlerMap.set('PreToolUse:Agent', [{ fn, module: 'flow' }]);
    handlerMap.set('PreToolUse', [{ fn, module: 'flow' }]);

    const result = testDispatch(handlerMap, 'PreToolUse', 'Agent', {});
    expect(result.handlers).toBe(1);
  });

  test('不同 handler 函式不被去重', () => {
    const fn1 = () => ({ decision: 'allow' });
    const fn2 = () => ({ decision: 'allow' });
    const handlerMap = new Map();
    handlerMap.set('PreToolUse:Bash', [{ fn: fn1, module: 'a' }, { fn: fn2, module: 'b' }]);

    const result = testDispatch(handlerMap, 'PreToolUse', 'Bash', {});
    expect(result.handlers).toBe(2);
  });
});

describe('Dispatcher 模組載入', () => {
  beforeEach(() => {
    mkdirSync(TEST_MODULES_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_MODULES_DIR)) rmSync(TEST_MODULES_DIR, { recursive: true });
  });

  test('掃描 *.js 並解析 on 物件', () => {
    writeFileSync(join(TEST_MODULES_DIR, 'test-mod.js'),
      `module.exports = { on: { 'TestEvent': (input) => ({ decision: 'allow' }) } };`
    );

    const map = testLoadModules(TEST_MODULES_DIR);
    expect(map.has('TestEvent')).toBe(true);
    expect(map.get('TestEvent')).toHaveLength(1);
  });

  test('忽略非 .js 檔案', () => {
    writeFileSync(join(TEST_MODULES_DIR, 'readme.md'), '# not a module');
    const map = testLoadModules(TEST_MODULES_DIR);
    expect(map.size).toBe(0);
  });

  test('載入失敗不影響其他模組', () => {
    writeFileSync(join(TEST_MODULES_DIR, 'bad.js'), 'throw new Error("broken");');
    writeFileSync(join(TEST_MODULES_DIR, 'good.js'),
      `module.exports = { on: { 'Good': () => ({ decision: 'allow' }) } };`
    );

    const map = testLoadModules(TEST_MODULES_DIR);
    expect(map.has('Good')).toBe(true);
  });

  test('多個模組的 handler 合併到同一個 key', () => {
    writeFileSync(join(TEST_MODULES_DIR, 'mod-a.js'),
      `module.exports = { on: { 'Shared': () => ({ decision: 'allow' }) } };`
    );
    writeFileSync(join(TEST_MODULES_DIR, 'mod-b.js'),
      `module.exports = { on: { 'Shared': () => ({ decision: 'allow' }) } };`
    );

    const map = testLoadModules(TEST_MODULES_DIR);
    expect(map.get('Shared')).toHaveLength(2);
  });

  test('非函式的 on 值被忽略', () => {
    writeFileSync(join(TEST_MODULES_DIR, 'bad-handler.js'),
      `module.exports = { on: { 'Test': 'not a function', 'Good': () => ({ decision: 'allow' }) } };`
    );

    const map = testLoadModules(TEST_MODULES_DIR);
    expect(map.has('Test')).toBe(false);
    expect(map.has('Good')).toBe(true);
  });
});
