import { describe, it, expect, mock } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';

const { createEventBus } = await import(join(homedir(), '.claude/hooks/event-bus.js'));

function makeBus(overrides = {}) {
  return createEventBus({
    writeFlowEvent: overrides.writeFlowEvent ?? (() => {}),
    broadcast: overrides.broadcast ?? (() => {}),
    onMetrics: overrides.onMetrics ?? (() => {}),
  });
}

// T1：emit → subscriber 收到事件
describe('emit', () => {
  it('subscriber 收到正確 type 和 data', async () => {
    const bus = makeBus();
    const received = [];
    bus.all$.subscribe({ next: (e) => received.push(e) });

    bus.emit('test:event', { value: 42 });

    await Promise.resolve(); // microtask flush
    expect(received.length).toBe(1);
    expect(received[0].type).toBe('test:event');
    expect(received[0].value).toBe(42);
    expect(typeof received[0].ts).toBe('string');

    bus.destroy();
  });
});

// T2：timer → 定時觸發事件
describe('timer', () => {
  it('短間隔 timer 觸發 → subscriber 收到事件', async () => {
    const bus = makeBus();
    const received = [];
    bus.all$.subscribe({ next: (e) => received.push(e) });

    bus.timer('tick:test', 30);

    await new Promise(r => setTimeout(r, 100));
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0].type).toBe('tick:test');

    bus.destroy();
  });

  it('重複 timer 忽略（不建立第二個）', async () => {
    const bus = makeBus();
    const received = [];
    bus.all$.subscribe({ next: (e) => received.push(e) });

    bus.timer('tick:dup', 30);
    bus.timer('tick:dup', 30); // 重複呼叫

    await new Promise(r => setTimeout(r, 80));
    // 只有一個 timer 在跑，數量應與單個 timer 相同（不會翻倍）
    const countAfterFirst = received.length;
    bus.clearTimer('tick:dup');

    await new Promise(r => setTimeout(r, 80));
    // clearTimer 後應停止
    const countAfterClear = received.length;
    expect(countAfterClear).toBe(countAfterFirst);

    bus.destroy();
  });
});

// T3：clearTimer → 停止觸發
describe('clearTimer', () => {
  it('clearTimer 後事件停止', async () => {
    const bus = makeBus();
    const received = [];
    bus.all$.subscribe({ next: (e) => received.push(e) });

    bus.timer('tick:clear', 20);
    await new Promise(r => setTimeout(r, 70));
    const beforeClear = received.length;
    expect(beforeClear).toBeGreaterThanOrEqual(1);

    bus.clearTimer('tick:clear');
    await new Promise(r => setTimeout(r, 80));
    expect(received.length).toBe(beforeClear); // 停止後數量不變

    bus.destroy();
  });
});

// T4：registerModule → init 被呼叫，handler 收到事件
describe('registerModule', () => {
  it('init 被呼叫，handler 收到匹配事件', async () => {
    const bus = makeBus();
    const initCalled = [];
    const handlerCalled = [];

    const mod = {
      name: 'test-mod',
      subscribe: ['task:start'],
      init: async (ctx) => { initCalled.push(ctx); },
      handler: async (event, ctx) => { handlerCalled.push(event); },
    };

    await bus.registerModule(mod);
    expect(initCalled.length).toBe(1);
    expect(typeof initCalled[0].emit).toBe('function');

    bus.emit('task:start', { task: 'foo' });
    await new Promise(r => setTimeout(r, 20));

    expect(handlerCalled.length).toBe(1);
    expect(handlerCalled[0].type).toBe('task:start');
    expect(handlerCalled[0].task).toBe('foo');

    bus.destroy();
  });
});

// T5：destroyModule → destroy 被呼叫 + timer 清除
describe('destroyModule', () => {
  it('destroy 被呼叫且模組 timer 清除', async () => {
    const bus = makeBus();
    const destroyCalled = [];
    const received = [];
    bus.all$.subscribe({ next: (e) => received.push(e) });

    const mod = {
      name: 'hb',
      subscribe: ['hb:tick'],
      init: async (ctx) => { ctx.timer('hb:tick', 20); },
      handler: async () => {},
      destroy: async (ctx) => { ctx.clearTimer('hb:tick'); destroyCalled.push(true); },
    };

    await bus.registerModule(mod);
    await new Promise(r => setTimeout(r, 60));
    const beforeDestroy = received.filter(e => e.type === 'hb:tick').length;
    expect(beforeDestroy).toBeGreaterThanOrEqual(1);

    await bus.destroyModule('hb');
    expect(destroyCalled.length).toBe(1);

    await new Promise(r => setTimeout(r, 60));
    const afterDestroy = received.filter(e => e.type === 'hb:tick').length;
    expect(afterDestroy).toBe(beforeDestroy); // timer 已停

    bus.destroy();
  });
});

// T6：fan-out → 只有 subscribe 匹配的模組收到事件
describe('fan-out', () => {
  it('模組 A 訂閱 x，模組 B 訂閱 y，emit x 只有 A 收到', async () => {
    const bus = makeBus();
    const aReceived = [];
    const bReceived = [];

    await bus.registerModule({
      name: 'mod-a',
      subscribe: ['ev:x'],
      handler: async (e) => { aReceived.push(e); },
    });
    await bus.registerModule({
      name: 'mod-b',
      subscribe: ['ev:y'],
      handler: async (e) => { bReceived.push(e); },
    });

    bus.emit('ev:x', { src: 'x' });
    await new Promise(r => setTimeout(r, 20));

    expect(aReceived.length).toBe(1);
    expect(aReceived[0].type).toBe('ev:x');
    expect(bReceived.length).toBe(0);

    bus.destroy();
  });
});

// T7：handler 拋錯不影響其他 subscriber
describe('handler 錯誤隔離', () => {
  it('拋錯的 handler 不影響其他模組', async () => {
    const bus = makeBus();
    const goodReceived = [];

    await bus.registerModule({
      name: 'bad-mod',
      subscribe: ['test:err'],
      handler: async () => { throw new Error('handler crash'); },
    });
    await bus.registerModule({
      name: 'good-mod',
      subscribe: ['test:err'],
      handler: async (e) => { goodReceived.push(e); },
    });

    bus.emit('test:err', {});
    await new Promise(r => setTimeout(r, 20));

    expect(goodReceived.length).toBe(1);

    bus.destroy();
  });
});

// T8：getState / setState 正確隔離
describe('getState / setState 隔離', () => {
  it('模組 A 的 state 不影響模組 B', async () => {
    const bus = makeBus();

    let ctxA, ctxB;
    await bus.registerModule({
      name: 'state-a',
      subscribe: [],
      init: async (ctx) => { ctxA = ctx; ctx.setState({ val: 'A' }); },
      handler: async () => {},
    });
    await bus.registerModule({
      name: 'state-b',
      subscribe: [],
      init: async (ctx) => { ctxB = ctx; ctx.setState({ val: 'B' }); },
      handler: async () => {},
    });

    expect(ctxA.getState().val).toBe('A');
    expect(ctxB.getState().val).toBe('B');

    ctxA.setState({ extra: 1 });
    expect(ctxA.getState().extra).toBe(1);
    expect(ctxB.getState().extra).toBeUndefined();

    // getModuleState API 也正確
    expect(bus.getModuleState('state-a').val).toBe('A');
    expect(bus.getModuleState('state-b').val).toBe('B');

    bus.destroy();
  });
});

// T9：side-effects writeFlowEvent / broadcast / onMetrics 被呼叫
describe('side-effects', () => {
  it('emit 觸發 writeFlowEvent、broadcast、onMetrics', async () => {
    const writeFlowEvent = mock(() => {});
    const broadcast = mock(() => {});
    const onMetrics = mock(() => {});
    const bus = makeBus({ writeFlowEvent, broadcast, onMetrics });

    bus.emit('side:test', { x: 1 });
    await Promise.resolve();

    expect(writeFlowEvent).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(onMetrics).toHaveBeenCalledTimes(1);
    expect(writeFlowEvent.mock.calls[0][0].type).toBe('side:test');

    bus.destroy();
  });

  it('side-effect 拋錯不影響其他 side-effect', async () => {
    const writeFlowEvent = mock(() => { throw new Error('write fail'); });
    const broadcast = mock(() => {});
    const onMetrics = mock(() => {});
    const bus = makeBus({ writeFlowEvent, broadcast, onMetrics });

    bus.emit('side:err', {});
    await Promise.resolve();

    // broadcast 和 onMetrics 仍應被呼叫
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(onMetrics).toHaveBeenCalledTimes(1);

    bus.destroy();
  });
});
