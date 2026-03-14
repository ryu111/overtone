import { describe, test, expect, beforeEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';

const METRICS_PATH = join(homedir(), '.claude/hooks/modules/metrics.js');
const { createMetrics } = await import(METRICS_PATH);

// --- helpers ---
function makeDispatch(decision = 'allow') {
  return { type: 'hook_trigger', event_type: 'PreToolUse', matcher: 'Bash', decision };
}

function makeError(typeSuffix = 'handler_error') {
  return { type: typeSuffix };
}

// --- Tests ---

describe('metrics — 計數正確性', () => {
  let m;
  beforeEach(() => {
    m = createMetrics();
  });

  test('初始快照各計數為 0', () => {
    const { metrics } = m.snapshot();
    expect(metrics.dispatchCount).toBe(0);
    expect(metrics.errorCount).toBe(0);
    expect(metrics.blockCount).toBe(0);
    expect(metrics.dispatchRate).toBe(0);
    expect(metrics.errorRate).toBe(0);
  });

  test('hook_trigger allow → dispatchCount++，blockCount 不增', () => {
    m.onEvent(makeDispatch('allow'));
    const { metrics } = m.snapshot();
    expect(metrics.dispatchCount).toBe(1);
    expect(metrics.blockCount).toBe(0);
  });

  test('hook_trigger block → dispatchCount++ 且 blockCount++', () => {
    m.onEvent(makeDispatch('block'));
    const { metrics } = m.snapshot();
    expect(metrics.dispatchCount).toBe(1);
    expect(metrics.blockCount).toBe(1);
  });

  test('多次 dispatch 累加', () => {
    m.onEvent(makeDispatch('allow'));
    m.onEvent(makeDispatch('allow'));
    m.onEvent(makeDispatch('block'));
    const { metrics } = m.snapshot();
    expect(metrics.dispatchCount).toBe(3);
    expect(metrics.blockCount).toBe(1);
  });

  test('type 含 error → errorCount++', () => {
    m.onEvent(makeError('handler_error'));
    const { metrics } = m.snapshot();
    expect(metrics.errorCount).toBe(1);
  });

  test('type 含 error 子串 → errorCount++', () => {
    m.onEvent(makeError('module_error_fatal'));
    const { metrics } = m.snapshot();
    expect(metrics.errorCount).toBe(1);
  });

  test('非相關 type 不影響計數', () => {
    m.onEvent({ type: 'session_start' });
    m.onEvent({ type: 'flow_event' });
    const { metrics } = m.snapshot();
    expect(metrics.dispatchCount).toBe(0);
    expect(metrics.errorCount).toBe(0);
  });
});

describe('metrics — 滑動窗口淘汰', () => {
  test('超過 60 秒的 dispatch timestamp 在 snapshot 時被淘汰（dispatchRate 降為 0）', () => {
    const m = createMetrics();
    // 直接注入 62 秒前的 timestamp
    const oldTs = Date.now() - 62_000;
    m._dispatchTimestamps.push(oldTs);

    const { metrics } = m.snapshot();
    expect(metrics.dispatchRate).toBe(0);
  });

  test('60 秒內的 timestamp 仍計入 dispatchRate', () => {
    const m = createMetrics();
    m.onEvent(makeDispatch('allow'));
    m.onEvent(makeDispatch('allow'));
    const { metrics } = m.snapshot();
    expect(metrics.dispatchRate).toBe(2);
  });

  test('超過 60 秒的 error timestamp 在 snapshot 時被淘汰（errorRate 降為 0）', () => {
    const m = createMetrics();
    const oldTs = Date.now() - 62_000;
    m._errorTimestamps.push(oldTs);
    const { metrics } = m.snapshot();
    expect(metrics.errorRate).toBe(0);
  });

  test('dispatchTimestamps 超過 1000 筆時自動截頭', () => {
    const m = createMetrics();
    // 插入 1001 筆
    for (let i = 0; i < 1001; i++) {
      m._dispatchTimestamps.push(Date.now());
    }
    // 再觸發一次會 push+shift
    m.onEvent(makeDispatch('allow'));
    // 長度不超過 1001（MAX_TIMESTAMPS = 1000，push 後 >1000 則 shift）
    expect(m._dispatchTimestamps.length).toBeLessThanOrEqual(1001);
  });
});

describe('metrics — 異常觸發', () => {
  test('60 秒內 > 200 次 dispatch → high_dispatch_rate warning', () => {
    const m = createMetrics();
    // 直接注入 201 筆近期 timestamp
    const ts = Date.now();
    for (let i = 0; i < 201; i++) m._dispatchTimestamps.push(ts);
    // 再觸發一次讓 detectAnomalies 執行
    m.onEvent(makeDispatch('allow'));

    const { anomalies } = m.snapshot();
    const found = anomalies.find(a => a.type === 'high_dispatch_rate');
    expect(found).toBeDefined();
    expect(found.severity).toBe('warning');
    expect(found.detail).toMatch(/dispatches in 60s/);
  });

  test('200 次 dispatch（非 > 200）不觸發 high_dispatch_rate', () => {
    const m = createMetrics();
    const ts = Date.now();
    // 注入 199 筆，onEvent 再加 1 筆，合計 200（不超過 200）
    for (let i = 0; i < 199; i++) m._dispatchTimestamps.push(ts);
    m.onEvent(makeDispatch('allow'));

    const { anomalies } = m.snapshot();
    const found = anomalies.find(a => a.type === 'high_dispatch_rate');
    expect(found).toBeUndefined();
  });

  test('連續 3 次 block → consecutive_blocks warning', () => {
    const m = createMetrics();
    m.onEvent(makeDispatch('block'));
    m.onEvent(makeDispatch('block'));
    m.onEvent(makeDispatch('block'));

    const { anomalies } = m.snapshot();
    const found = anomalies.find(a => a.type === 'consecutive_blocks');
    expect(found).toBeDefined();
    expect(found.severity).toBe('warning');
  });

  test('2 次 block 不觸發 consecutive_blocks', () => {
    const m = createMetrics();
    m.onEvent(makeDispatch('block'));
    m.onEvent(makeDispatch('block'));

    const { anomalies } = m.snapshot();
    const found = anomalies.find(a => a.type === 'consecutive_blocks');
    expect(found).toBeUndefined();
  });

  test('allow 打斷 block 連續計數重置', () => {
    const m = createMetrics();
    m.onEvent(makeDispatch('block'));
    m.onEvent(makeDispatch('block'));
    m.onEvent(makeDispatch('allow')); // 重置
    m.onEvent(makeDispatch('block'));
    m.onEvent(makeDispatch('block'));

    const { anomalies } = m.snapshot();
    const found = anomalies.find(a => a.type === 'consecutive_blocks');
    expect(found).toBeUndefined();
  });

  test('60 秒內 > 5 次 error → handler_error_spike error', () => {
    const m = createMetrics();
    const ts = Date.now();
    for (let i = 0; i < 6; i++) m._errorTimestamps.push(ts);
    // 觸發 detectAnomalies
    m.onEvent(makeError('handler_error'));

    const { anomalies } = m.snapshot();
    const found = anomalies.find(a => a.type === 'handler_error_spike');
    expect(found).toBeDefined();
    expect(found.severity).toBe('error');
  });

  test('5 次 error 不觸發 handler_error_spike', () => {
    const m = createMetrics();
    const ts = Date.now();
    // 注入 4 筆，onEvent 再加 1 筆，合計 5（不超過 5）
    for (let i = 0; i < 4; i++) m._errorTimestamps.push(ts);
    m.onEvent(makeError('handler_error'));

    const { anomalies } = m.snapshot();
    const found = anomalies.find(a => a.type === 'handler_error_spike');
    expect(found).toBeUndefined();
  });
});

describe('metrics — anomalies 環形 buffer', () => {
  test('最多保留 10 筆，超過時淘汰最舊', () => {
    const m = createMetrics();
    // 直接注入 10 筆
    for (let i = 0; i < 10; i++) {
      m._anomalies.push({ type: `old_${i}`, ts: 0, detail: '', severity: 'warning' });
    }
    // 注入第 11 筆（透過觸發）
    const ts = Date.now();
    for (let i = 0; i < 201; i++) m._dispatchTimestamps.push(ts);
    m.onEvent(makeDispatch('allow'));

    const { anomalies } = m.snapshot();
    expect(anomalies.length).toBeLessThanOrEqual(10);
    // 最舊的 old_0 應被淘汰
    const stillHasOld0 = anomalies.some(a => a.type === 'old_0');
    expect(stillHasOld0).toBe(false);
  });
});

describe('metrics — snapshot 格式驗證', () => {
  test('snapshot 包含 metrics 物件，含必要欄位', () => {
    const m = createMetrics();
    const snap = m.snapshot();

    expect(snap).toHaveProperty('metrics');
    expect(snap).toHaveProperty('anomalies');

    const { metrics } = snap;
    expect(typeof metrics.dispatchCount).toBe('number');
    expect(typeof metrics.dispatchRate).toBe('number');
    expect(typeof metrics.errorCount).toBe('number');
    expect(typeof metrics.errorRate).toBe('number');
    expect(typeof metrics.blockCount).toBe('number');
  });

  test('anomalies 是陣列', () => {
    const m = createMetrics();
    const { anomalies } = m.snapshot();
    expect(Array.isArray(anomalies)).toBe(true);
  });

  test('anomaly 條目包含 type、ts、detail、severity', () => {
    const m = createMetrics();
    m.onEvent(makeDispatch('block'));
    m.onEvent(makeDispatch('block'));
    m.onEvent(makeDispatch('block'));

    const { anomalies } = m.snapshot();
    const entry = anomalies.find(a => a.type === 'consecutive_blocks');
    expect(entry).toBeDefined();
    expect(typeof entry.ts).toBe('number');
    expect(typeof entry.detail).toBe('string');
    expect(typeof entry.severity).toBe('string');
  });

  test('snapshot 回傳 anomalies 副本，外部修改不影響內部狀態', () => {
    const m = createMetrics();
    m.onEvent(makeDispatch('block'));
    m.onEvent(makeDispatch('block'));
    m.onEvent(makeDispatch('block'));

    const snap1 = m.snapshot();
    snap1.anomalies.length = 0; // 外部清空

    const snap2 = m.snapshot();
    expect(snap2.anomalies.length).toBeGreaterThan(0);
  });
});

describe('metrics — onEvent throw 隔離', () => {
  test('onEvent 遇到非預期 event 結構不拋出', () => {
    const m = createMetrics();
    expect(() => m.onEvent(null)).not.toThrow();
    expect(() => m.onEvent(undefined)).not.toThrow();
    expect(() => m.onEvent({})).not.toThrow();
    expect(() => m.onEvent({ type: null })).not.toThrow();
  });

  test('onEvent 本身錯誤不影響計數狀態一致性', () => {
    const m = createMetrics();
    m.onEvent(makeDispatch('allow'));
    // 注入一個會讓 type 判斷正常但 detail 奇怪的 event
    m.onEvent({ type: 'hook_trigger', decision: undefined });
    // dispatchCount 應為 2（兩次 hook_trigger 都被計入）
    const { metrics } = m.snapshot();
    expect(metrics.dispatchCount).toBe(2);
  });
});

describe('metrics — _reset 工具', () => {
  test('_reset 後所有計數回到 0', () => {
    const m = createMetrics();
    m.onEvent(makeDispatch('block'));
    m.onEvent(makeError('handler_error'));
    m._reset();

    const { metrics, anomalies } = m.snapshot();
    expect(metrics.dispatchCount).toBe(0);
    expect(metrics.errorCount).toBe(0);
    expect(metrics.blockCount).toBe(0);
    expect(anomalies).toHaveLength(0);
  });
});
