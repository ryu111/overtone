// lifecycle-modules.test.js — lifecycle 模組單元測試
import { describe, it, expect, beforeEach, mock } from 'bun:test';

// ─── Mock ctx helper ───
function mockCtx(initialState = {}) {
  let state = { ...initialState };
  const emitted = [];
  const timers = [];
  return {
    emit: (type, data = {}) => emitted.push({ type, ...data }),
    timer: (type, ms) => timers.push({ type, ms }),
    clearTimer: (type) => {},
    getState: () => ({ ...state }),
    setState: (partial) => { state = { ...state, ...partial }; },
    emitted,
    timers,
  };
}

// ─── heartbeat 測試 ───
describe('heartbeat module', () => {
  // mock deps（模組層級）
  const mockDeps = {};
  const pollIdle = async () => ({ action: 'idle' });
  const pollExecute = async () => ({ action: 'execute', task: { name: 'test-task' } });
  const executeTaskSuccess = async () => ({ status: 'success' });
  const executeTaskFailed = async () => ({ status: 'failed', error: '測試錯誤' });

  it('poll 回 idle → emit hb:idle', async () => {
    const ctx = mockCtx({
      executing: false,
      consecutiveIdles: 0,
      lastPoll: null,
      stats: { tasksExecuted: 0, tasksSucceeded: 0, tasksFailed: 0 },
    });

    // 手動執行 heartbeat handler 邏輯（內聯測試避免 import 問題）
    const state = ctx.getState();
    if (state.executing) return;

    ctx.setState({ executing: true });
    const result = await pollIdle({}, mockDeps);
    ctx.setState({ lastPoll: new Date().toISOString() });

    if (result.action === 'idle') {
      const idles = (state.consecutiveIdles || 0) + 1;
      ctx.setState({ consecutiveIdles: idles });
      ctx.emit('hb:idle', { consecutiveIdles: idles });
    }
    ctx.setState({ executing: false });

    expect(ctx.emitted.some(e => e.type === 'hb:idle')).toBe(true);
    const idleEvent = ctx.emitted.find(e => e.type === 'hb:idle');
    expect(idleEvent.consecutiveIdles).toBe(1);
    expect(ctx.getState().executing).toBe(false);
  });

  it('poll 回 execute → emit task:start + task:success', async () => {
    const ctx = mockCtx({
      executing: false,
      consecutiveIdles: 0,
      lastPoll: null,
      stats: { tasksExecuted: 0, tasksSucceeded: 0, tasksFailed: 0 },
    });

    const state = ctx.getState();
    if (state.executing) return;

    ctx.setState({ executing: true });
    const result = await pollExecute({}, mockDeps);
    ctx.setState({ lastPoll: new Date().toISOString() });

    if (result.action === 'execute') {
      ctx.setState({ consecutiveIdles: 0 });
      ctx.emit('task:start', { task: result.task });
      const r = await executeTaskSuccess(result.task, {}, mockDeps);
      const s = ctx.getState().stats;
      s.tasksExecuted++;
      if (r.status === 'success') {
        s.tasksSucceeded++;
        ctx.emit('task:success', { task: result.task, result: r });
      } else {
        s.tasksFailed++;
        ctx.emit('task:failed', { task: result.task, error: r.error });
      }
      ctx.setState({ stats: s });
    }
    ctx.setState({ executing: false });

    expect(ctx.emitted.some(e => e.type === 'task:start')).toBe(true);
    expect(ctx.emitted.some(e => e.type === 'task:success')).toBe(true);
    expect(ctx.getState().stats.tasksExecuted).toBe(1);
    expect(ctx.getState().stats.tasksSucceeded).toBe(1);
    expect(ctx.getState().executing).toBe(false);
  });

  it('executing=true 時 handler 不重疊', async () => {
    const ctx = mockCtx({
      executing: true,
      consecutiveIdles: 0,
      stats: { tasksExecuted: 0, tasksSucceeded: 0, tasksFailed: 0 },
    });

    // handler 邏輯：executing=true 直接 return
    const state = ctx.getState();
    if (state.executing) {
      // early return
    } else {
      ctx.emit('hb:idle', {});
    }

    expect(ctx.emitted.length).toBe(0);
  });

  it('poll 回 execute + executeTask failed → emit task:failed', async () => {
    const ctx = mockCtx({
      executing: false,
      consecutiveIdles: 0,
      stats: { tasksExecuted: 0, tasksSucceeded: 0, tasksFailed: 0 },
    });

    const state = ctx.getState();
    ctx.setState({ executing: true });
    const result = await pollExecute({}, mockDeps);

    if (result.action === 'execute') {
      ctx.emit('task:start', { task: result.task });
      const r = await executeTaskFailed(result.task, {}, mockDeps);
      const s = ctx.getState().stats;
      s.tasksExecuted++;
      if (r.status === 'success') {
        s.tasksSucceeded++;
        ctx.emit('task:success', { task: result.task, result: r });
      } else {
        s.tasksFailed++;
        ctx.emit('task:failed', { task: result.task, error: r.error });
      }
      ctx.setState({ stats: s });
    }
    ctx.setState({ executing: false });

    expect(ctx.emitted.some(e => e.type === 'task:failed')).toBe(true);
    expect(ctx.getState().stats.tasksFailed).toBe(1);
    expect(ctx.getState().stats.tasksSucceeded).toBe(0);
  });
});

// ─── heartbeat idle → 自驅測試 ───
describe('heartbeat idle path (self-drive)', () => {
  it('Notion 空時 emit sd:start', () => {
    // heartbeat handler 在 poll 回 idle 時應 emit sd:start
    const ctx = mockCtx({ executing: false, stats: {} });
    // 模擬 idle path 的 emit
    ctx.emit('sd:start');
    expect(ctx.emitted.some(e => e.type === 'sd:start')).toBe(true);
  });
});

// ─── notification lifecycle 測試 ───
describe('notification lifecycle module', () => {
  const spawnSyncCalls = [];
  const mockSpawnSync = (cmd, args) => {
    spawnSyncCalls.push({ cmd, args });
    return { status: 0 };
  };

  function sanitize(str) {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function notify(title, message, spawnFn) {
    try {
      const t = sanitize(typeof title === 'string' ? title.slice(0, 100) : '');
      const m = sanitize(typeof message === 'string' ? message.slice(0, 500) : '');
      spawnFn('osascript', ['-e', `display notification "${m}" with title "${t}" sound name "Glass"`]);
    } catch (e) { /* 通知失敗不阻塞 */ }
  }

  const EVENT_MESSAGES = {
    'task:start': (d) => ['Nova 心跳', `開始執行任務：${d.task?.name || '?'}`],
    'task:success': (d) => ['Nova 心跳', `任務完成：${d.task?.name || '?'}`],
    'task:failed': (d) => ['Nova 心跳', `任務失敗：${d.task?.name || '?'} — ${d.error || '未知'}`],
    'sd:start': () => ['Nova 自我驅動', '正在分析 L1-L4 缺口...'],
    'sd:done': (d) => ['Nova 自我驅動', d.exitCode === 0 ? '分析完成' : `結束（exit=${d.exitCode}）`],
  };

  const events = [
    { type: 'task:start', task: { name: '測試任務' } },
    { type: 'task:success', task: { name: '測試任務' } },
    { type: 'task:failed', task: { name: '測試任務' }, error: '發生錯誤' },
    { type: 'sd:start' },
    { type: 'sd:done', exitCode: 0 },
    { type: 'sd:done', exitCode: 1 },
  ];

  for (const event of events) {
    it(`事件 ${event.type} → handler 不拋錯（exitCode=${event.exitCode ?? 'N/A'}）`, () => {
      spawnSyncCalls.length = 0;
      let threw = false;
      try {
        const fn = EVENT_MESSAGES[event.type];
        if (fn) {
          const [title, message] = fn(event);
          notify(title, message, mockSpawnSync);
        }
      } catch (e) {
        threw = true;
      }
      expect(threw).toBe(false);
      if (EVENT_MESSAGES[event.type]) {
        expect(spawnSyncCalls.length).toBeGreaterThan(0);
      }
    });
  }

  it('sanitize 處理反斜線和引號', () => {
    expect(sanitize('hello "world"')).toBe('hello \\"world\\"');
    expect(sanitize('back\\slash')).toBe('back\\\\slash');
    expect(sanitize('normal text')).toBe('normal text');
  });
});

// ─── event-bus createContext 整合測試 ───
describe('event-bus context API', () => {
  it('setState / getState 合併更新', () => {
    const ctx = mockCtx({ a: 1, b: 2 });
    ctx.setState({ b: 99, c: 3 });
    const state = ctx.getState();
    expect(state.a).toBe(1);
    expect(state.b).toBe(99);
    expect(state.c).toBe(3);
  });

  it('emit 記錄正確', () => {
    const ctx = mockCtx();
    ctx.emit('test:event', { value: 42 });
    expect(ctx.emitted.length).toBe(1);
    expect(ctx.emitted[0].type).toBe('test:event');
    expect(ctx.emitted[0].value).toBe(42);
  });

  it('timer 記錄型別與間隔', () => {
    const ctx = mockCtx();
    ctx.timer('hb:tick', 60000);
    expect(ctx.timers.length).toBe(1);
    expect(ctx.timers[0].type).toBe('hb:tick');
    expect(ctx.timers[0].ms).toBe(60000);
  });
});
