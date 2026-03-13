import { describe, test, expect } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';

const { SSEPool } = await import(join(homedir(), '.claude/scripts/flow/sse.js'));

describe('SSEPool', () => {
  test('add/remove 基本操作', () => {
    const pool = new SSEPool();
    const messages = [];
    const mockController = { enqueue: (data) => messages.push(new TextDecoder().decode(data)) };

    pool.add(mockController);
    expect(pool.size).toBe(1);

    pool.remove(mockController);
    expect(pool.size).toBe(0);
  });

  test('size 屬性正確反映 client 數量', () => {
    const pool = new SSEPool();
    const ctrl1 = { enqueue: () => {} };
    const ctrl2 = { enqueue: () => {} };
    const ctrl3 = { enqueue: () => {} };

    expect(pool.size).toBe(0);
    pool.add(ctrl1);
    expect(pool.size).toBe(1);
    pool.add(ctrl2);
    pool.add(ctrl3);
    expect(pool.size).toBe(3);
    pool.remove(ctrl2);
    expect(pool.size).toBe(2);
  });

  test('broadcast 發送到所有 client', () => {
    const pool = new SSEPool();
    const messages1 = [];
    const messages2 = [];
    const ctrl1 = { enqueue: (data) => messages1.push(new TextDecoder().decode(data)) };
    const ctrl2 = { enqueue: (data) => messages2.push(new TextDecoder().decode(data)) };

    pool.add(ctrl1);
    pool.add(ctrl2);

    const event = { type: 'test', payload: 'hello' };
    pool.broadcast(event);

    expect(messages1.length).toBe(1);
    expect(messages2.length).toBe(1);

    const parsed1 = JSON.parse(messages1[0].replace('data: ', '').trim());
    const parsed2 = JSON.parse(messages2[0].replace('data: ', '').trim());
    expect(parsed1).toEqual(event);
    expect(parsed2).toEqual(event);
  });

  test('broadcast 格式為 SSE data: ... 格式', () => {
    const pool = new SSEPool();
    const messages = [];
    const mockController = { enqueue: (data) => messages.push(new TextDecoder().decode(data)) };

    pool.add(mockController);
    pool.broadcast({ type: 'ping' });

    expect(messages[0]).toMatch(/^data: /);
    expect(messages[0]).toMatch(/\n\n$/);
  });

  test('斷線 client（enqueue throws）自動從池中移除', () => {
    const pool = new SSEPool();
    const messages = [];
    const goodCtrl = { enqueue: (data) => messages.push(new TextDecoder().decode(data)) };
    const badCtrl = {
      enqueue: () => {
        throw new Error('client disconnected');
      },
    };

    pool.add(goodCtrl);
    pool.add(badCtrl);
    expect(pool.size).toBe(2);

    pool.broadcast({ type: 'test' });

    // badCtrl 應該被自動移除
    expect(pool.size).toBe(1);
    // goodCtrl 仍然收到訊息
    expect(messages.length).toBe(1);
  });

  test('斷線 client 移除後，後續 broadcast 不再嘗試發送', () => {
    const pool = new SSEPool();
    let throwCount = 0;
    const badCtrl = {
      enqueue: () => {
        throwCount++;
        throw new Error('client disconnected');
      },
    };

    pool.add(badCtrl);
    pool.broadcast({ type: 'first' });
    expect(throwCount).toBe(1);
    expect(pool.size).toBe(0);

    // 第二次 broadcast 不應再觸發 badCtrl.enqueue
    pool.broadcast({ type: 'second' });
    expect(throwCount).toBe(1);
  });

  test('clear() 清空所有 client', () => {
    const pool = new SSEPool();
    pool.add({ enqueue: () => {} });
    pool.add({ enqueue: () => {} });
    pool.add({ enqueue: () => {} });
    expect(pool.size).toBe(3);

    pool.clear();
    expect(pool.size).toBe(0);
  });

  test('clear() 後 broadcast 不發送給任何人', () => {
    const pool = new SSEPool();
    const messages = [];
    pool.add({ enqueue: (data) => messages.push(data) });
    pool.add({ enqueue: (data) => messages.push(data) });

    pool.clear();
    pool.broadcast({ type: 'after-clear' });

    expect(messages.length).toBe(0);
  });
});
