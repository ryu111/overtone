/**
 * Layer KPI Collector 測試
 */
import { describe, test, expect } from 'bun:test';
import {
  collectL2KPI,
  collectAllKPI,
  calcTrend,
  readJsonl,
  gitCommitCount,
  collectL0KPI,
  collectL1KPI,
  collectL3KPI,
  collectL4KPI,
  collectL5KPI,
} from '/Users/sbu/.claude/scripts/lib/layer-kpi-collector.js';
import { existsSync } from 'fs';

// --- calcTrend 單元測試 ---
describe('calcTrend', () => {
  test('100→120 應回傳 improving', () => {
    expect(calcTrend(120, 100)).toBe('improving');
  });

  test('100→80 應回傳 declining', () => {
    expect(calcTrend(80, 100)).toBe('declining');
  });

  test('100→105 應回傳 stable（+5%，在 ±10% 帶內）', () => {
    expect(calcTrend(105, 100)).toBe('stable');
  });

  test('100→95 應回傳 stable（-5%，在 ±10% 帶內）', () => {
    expect(calcTrend(95, 100)).toBe('stable');
  });

  test('0→0 應回傳 stable', () => {
    expect(calcTrend(0, 0)).toBe('stable');
  });

  test('previous=0、current>0 應回傳 improving', () => {
    expect(calcTrend(5, 0)).toBe('improving');
  });

  test('100→110 剛好在 10% 邊界應回傳 stable', () => {
    expect(calcTrend(110, 100)).toBe('stable');
  });

  test('100→111 超過 10% 應回傳 improving', () => {
    expect(calcTrend(111, 100)).toBe('improving');
  });
});

// --- readJsonl 輔助函式測試 ---
describe('readJsonl', () => {
  test('不存在的檔案回傳空陣列', () => {
    const result = readJsonl('/tmp/nonexistent-file-that-does-not-exist.jsonl');
    expect(result).toEqual([]);
  });

  test('存在的 JSONL 檔案能正確解析', () => {
    // behaviors.jsonl 是真實存在的測試資料
    const path = '/Users/sbu/.claude/data/behaviors.jsonl';
    if (!existsSync(path)) return; // 允許 skip（環境沒有資料時）
    const result = readJsonl(path);
    expect(Array.isArray(result)).toBe(true);
  });
});

// --- gitCommitCount 測試 ---
describe('gitCommitCount', () => {
  test('不存在的目錄回傳 0', () => {
    const count = gitCommitCount('/tmp/nonexistent-project-dir');
    expect(count).toBe(0);
  });

  test('有效 git repo 回傳非負整數', () => {
    // nova-brain 一定是 git repo
    const count = gitCommitCount('/Users/sbu/projects/nova-brain', '1 year ago');
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// --- collectL2KPI：server 在跑應有 uptime ---
describe('collectL2KPI', () => {
  test('回傳包含 layer L2 的物件', async () => {
    const result = await collectL2KPI();
    expect(result.layer).toBe('L2');
    expect(result.status).toBe('ok');
  });

  test('server 在線時 uptime 應為數字', async () => {
    const result = await collectL2KPI();
    if (result.serverStatus === 'online') {
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    } else {
      // server 離線，uptime 應為 null
      expect(result.uptime).toBeNull();
    }
  });

  test('hookErrors24h 應為非負整數', async () => {
    const result = await collectL2KPI();
    expect(typeof result.hookErrors24h).toBe('number');
    expect(result.hookErrors24h).toBeGreaterThanOrEqual(0);
  });

  test('serverStatus 應為 online 或 offline', async () => {
    const result = await collectL2KPI();
    expect(['online', 'offline']).toContain(result.serverStatus);
  });
});

// --- collectAllKPI：回傳 6 個 layer ---
describe('collectAllKPI', () => {
  test('並行收集應回傳包含 L0-L5 的 layers 物件', async () => {
    const result = await collectAllKPI();
    expect(result).toBeDefined();
    expect(result.layers).toBeDefined();
    expect(Object.keys(result.layers)).toHaveLength(6);
    expect(result.layers.L0).toBeDefined();
    expect(result.layers.L1).toBeDefined();
    expect(result.layers.L2).toBeDefined();
    expect(result.layers.L3).toBeDefined();
    expect(result.layers.L4).toBeDefined();
    expect(result.layers.L5).toBeDefined();
  }, 10000);

  test('每個 layer 都有 layer 欄位', async () => {
    const result = await collectAllKPI();
    for (const [key, val] of Object.entries(result.layers)) {
      expect(val.layer).toBe(key);
    }
  }, 10000);

  test('結果應寫入 /tmp/nova-layer-kpi.json', async () => {
    await collectAllKPI();
    expect(existsSync('/tmp/nova-layer-kpi.json')).toBe(true);
  }, 10000);

  test('result 有 ts 時間戳', async () => {
    const result = await collectAllKPI();
    expect(typeof result.ts).toBe('string');
    expect(() => new Date(result.ts)).not.toThrow();
  }, 10000);
});

// --- 空資料 / 檔案不存在不 crash ---
describe('各 collect 函式對缺失資料應回傳 status: no_data 或降級處理', () => {
  test('collectL0KPI 在 decisions.jsonl 不存在時回傳 no_data', async () => {
    // 這個測試依賴環境，允許 ok 或 no_data
    const result = await collectL0KPI();
    expect(result.layer).toBe('L0');
    expect(['ok', 'no_data']).toContain(result.status);
  });

  test('collectL1KPI 不 crash，回傳有效結構', async () => {
    const result = await collectL1KPI();
    expect(result.layer).toBe('L1');
    expect(['ok', 'no_data']).toContain(result.status);
  });

  test('collectL3KPI 不 crash，回傳有效結構', async () => {
    const result = await collectL3KPI();
    expect(result.layer).toBe('L3');
    expect(['ok', 'no_data']).toContain(result.status);
  });

  test('collectL4KPI 不 crash，即使 nova-control 不存在', async () => {
    const result = await collectL4KPI();
    expect(result.layer).toBe('L4');
    expect(result.status).toBe('ok');
    expect(typeof result.commitsLast7d).toBe('number');
  });

  test('collectL5KPI 不 crash，即使專案目錄不存在', async () => {
    const result = await collectL5KPI();
    expect(result.layer).toBe('L5');
    expect(result.status).toBe('ok');
    expect(Array.isArray(result.projects)).toBe(true);
  });
});

// --- 並行收集不衝突 ---
describe('並行收集不衝突', () => {
  test('兩次並行 collectAllKPI 不應互相干擾', async () => {
    const [r1, r2] = await Promise.all([collectAllKPI(), collectAllKPI()]);
    // 兩次都應回傳 6 個 layer
    expect(Object.keys(r1.layers)).toHaveLength(6);
    expect(Object.keys(r2.layers)).toHaveLength(6);
    // L2 的 serverStatus 應一致（同一個 server）
    expect(r1.layers.L2.serverStatus).toBe(r2.layers.L2.serverStatus);
  }, 15000);
});
