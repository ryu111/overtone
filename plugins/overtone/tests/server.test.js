'use strict';
/**
 * server.test.js — Dashboard HTTP API 端點測試
 *
 * 使用 Bun.spawn 啟動獨立子進程，避免副作用（PID 寫入、signal handlers）。
 * 測試完成後終止子進程並清理測試 session 目錄。
 */
const { test, expect, beforeAll, afterAll, describe } = require('bun:test');
const { mkdirSync, rmSync, appendFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const state = require('../scripts/lib/state');
const paths = require('../scripts/lib/paths');

// ── 常數 ──

const TEST_PORT = 17778;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// 測試 session ID（使用固定前綴 + timestamp 確保唯一性）
const TEST_SESSION = `test_server_${Date.now()}`;
const SESSION_DIR = join(homedir(), '.overtone', 'sessions', TEST_SESSION);
const NONEXISTENT_SESSION = `test_server_nonexistent_${Date.now()}`;

let serverProcess = null;

// ── 輔助函式 ──

/**
 * 等待 server 準備好（輪詢 /health 端點）
 * @param {number} maxWaitMs
 */
async function waitForServer(maxWaitMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {
      // 尚未就緒，等待後重試
    }
    await Bun.sleep(100);
  }
  throw new Error(`Server 在 ${maxWaitMs}ms 內未就緒`);
}

/**
 * 發送 GET 請求並回傳 { status, body, headers }
 * @param {string} path
 * @param {Record<string, string>} [reqHeaders={}]
 */
async function get(path, reqHeaders = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: reqHeaders });
  const contentType = res.headers.get('content-type') || '';
  let body;
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { status: res.status, body, headers: res.headers };
}

/**
 * 寫入 stage:complete 事件到 timeline JSONL
 */
function writeStageCompleteEvent(sessionId, stage, result, ts) {
  const filePath = paths.session.timeline(sessionId);
  mkdirSync(require('path').dirname(filePath), { recursive: true });
  const event = JSON.stringify({
    ts: ts || new Date().toISOString(),
    type: 'stage:complete',
    category: 'stage',
    label: '階段完成',
    stage,
    result,
  });
  appendFileSync(filePath, event + '\n', 'utf8');
}

// ── Setup / Teardown ──

beforeAll(async () => {
  // 建立測試 session
  mkdirSync(SESSION_DIR, { recursive: true });
  state.initState(TEST_SESSION, 'quick', ['DEV', 'REVIEW', 'TEST']);

  // 寫入幾筆 timeline 事件
  writeStageCompleteEvent(TEST_SESSION, 'DEV', 'pass', '2026-02-26T00:00:00.000Z');
  writeStageCompleteEvent(TEST_SESSION, 'REVIEW', 'fail', '2026-02-26T00:01:00.000Z');
  writeStageCompleteEvent(TEST_SESSION, 'REVIEW', 'pass', '2026-02-26T00:02:00.000Z');

  // 啟動 server 子進程
  const serverScript = join(__dirname, '..', 'scripts', 'server.js');
  serverProcess = Bun.spawn(['bun', serverScript], {
    env: {
      ...process.env,
      OVERTONE_PORT: String(TEST_PORT),
    },
    stdout: 'ignore',
    stderr: 'ignore',
  });

  // 等待 server 就緒
  await waitForServer(8000);
});

afterAll(() => {
  // 終止 server 子進程
  if (serverProcess) {
    serverProcess.kill();
  }
  // 清理測試 session 目錄
  rmSync(SESSION_DIR, { recursive: true, force: true });
});

// ── 測試群組 ──

// ─────────────────────────────────────────────
// 1. GET /api/registry — 回傳 registry 結構
// ─────────────────────────────────────────────
describe('GET /api/registry', () => {
  test('status 200 且回傳 stages + workflows + agents 欄位', async () => {
    const { status, body } = await get('/api/registry');
    expect(status).toBe(200);
    expect(body).toHaveProperty('stages');
    expect(body).toHaveProperty('workflows');
    expect(body).toHaveProperty('agents');
  });

  test('agents 包含正確欄位（model、color）且涵蓋 14 個 agent', async () => {
    const { body } = await get('/api/registry');
    expect(typeof body.agents).toBe('object');
    expect(Object.keys(body.agents).length).toBe(14);
    const dev = body.agents['developer'];
    expect(dev).toBeDefined();
    expect(dev).toHaveProperty('model');
    expect(dev).toHaveProperty('color');
    expect(dev.model).toBe('sonnet');
    expect(dev.color).toBe('yellow');
  });

  test('workflows.quick 存在且包含 label', async () => {
    const { body } = await get('/api/registry');
    expect(body.workflows).toHaveProperty('quick');
    expect(typeof body.workflows.quick.label).toBe('string');
    expect(body.workflows.quick.label.length).toBeGreaterThan(0);
  });

  test('stages 包含正確欄位（label、emoji、color、agent）', async () => {
    const { body } = await get('/api/registry');
    const devStage = body.stages.DEV;
    expect(devStage).toBeDefined();
    expect(devStage).toHaveProperty('label');
    expect(devStage).toHaveProperty('emoji');
    expect(devStage).toHaveProperty('color');
    expect(devStage).toHaveProperty('agent');
    expect(devStage.agent).toBe('developer');
  });
});

// ─────────────────────────────────────────────
// 2. GET /api/sessions — session 列表
// ─────────────────────────────────────────────
describe('GET /api/sessions', () => {
  test('status 200 且回傳陣列', async () => {
    const { status, body } = await get('/api/sessions');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  test('回傳的 session 摘要包含必要欄位', async () => {
    const { body } = await get('/api/sessions');
    // 應包含剛建立的測試 session
    const found = body.find(s => s.sessionId === TEST_SESSION);
    expect(found).toBeDefined();
    expect(found).toHaveProperty('workflowType');
    expect(found).toHaveProperty('currentStage');
    expect(found).toHaveProperty('progress');
    expect(found.progress).toHaveProperty('completed');
    expect(found.progress).toHaveProperty('total');
  });

  test('active=true filter 只回傳有 activeAgents 的 session', async () => {
    const { status, body } = await get('/api/sessions?active=true');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    // 測試 session 沒有 active agents，不應出現在過濾後的列表
    const found = body.find(s => s.sessionId === TEST_SESSION);
    expect(found).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// 3. GET /api/sessions/:id/passatk — pass@k 統計
// ─────────────────────────────────────────────
describe('GET /api/sessions/:id/passatk', () => {
  test('有效 session：status 200 且回傳正確的 passAtK 結構', async () => {
    const { status, body } = await get(`/api/sessions/${TEST_SESSION}/passatk`);
    expect(status).toBe(200);
    expect(body.sessionId).toBe(TEST_SESSION);
    expect(body).toHaveProperty('stages');
    expect(body).toHaveProperty('overall');
    expect(typeof body.computed).toBe('string');
  });

  test('有效 session：stages 包含寫入的 stage 資料', async () => {
    const { body } = await get(`/api/sessions/${TEST_SESSION}/passatk`);
    // 有寫入 DEV（pass）和 REVIEW（fail, pass）的 stage:complete 事件
    expect(body.stages).toHaveProperty('DEV');
    expect(body.stages).toHaveProperty('REVIEW');
    expect(body.stages.DEV.pass1).toBe(true);
    expect(body.stages.REVIEW.pass1).toBe(false);
    expect(body.stages.REVIEW.pass3).toBe(true);
  });

  test('不存在的 session：回傳 404', async () => {
    const { status, body } = await get(`/api/sessions/${NONEXISTENT_SESSION}/passatk`);
    // 先驗證 session 存在，不存在則回傳 404
    expect(status).toBe(404);
    expect(body).toHaveProperty('error');
  });
});

// ─────────────────────────────────────────────
// 4. GET /api/sessions/:id/timeline — timeline 事件
// ─────────────────────────────────────────────
describe('GET /api/sessions/:id/timeline', () => {
  test('無 filter：status 200 且回傳陣列', async () => {
    const { status, body } = await get(`/api/sessions/${TEST_SESSION}/timeline`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  test('回傳的事件包含寫入的 stage:complete 類型', async () => {
    const { body } = await get(`/api/sessions/${TEST_SESSION}/timeline`);
    const stageCompleteEvents = body.filter(e => e.type === 'stage:complete');
    expect(stageCompleteEvents.length).toBeGreaterThan(0);
    expect(stageCompleteEvents[0]).toHaveProperty('stage');
    expect(stageCompleteEvents[0]).toHaveProperty('result');
  });

  test('category filter：只回傳指定 category 的事件', async () => {
    const { status, body } = await get(`/api/sessions/${TEST_SESSION}/timeline?category=stage`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    body.forEach(e => {
      expect(e.category).toBe('stage');
    });
  });

  test('limit filter：限制回傳筆數', async () => {
    const { status, body } = await get(`/api/sessions/${TEST_SESSION}/timeline?limit=1`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(1);
  });

  test('不存在的 session：回傳空陣列', async () => {
    const { status, body } = await get(`/api/sessions/${NONEXISTENT_SESSION}/timeline`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });
});

// ─────────────────────────────────────────────
// 5. GET /api/sessions/:id — 單一 session 狀態
// ─────────────────────────────────────────────
describe('GET /api/sessions/:id', () => {
  test('有效 session：status 200 且回傳 workflow 狀態', async () => {
    const { status, body } = await get(`/api/sessions/${TEST_SESSION}`);
    expect(status).toBe(200);
    expect(body.sessionId).toBe(TEST_SESSION);
    expect(body.workflowType).toBe('quick');
    expect(body).toHaveProperty('stages');
    expect(body).toHaveProperty('currentStage');
  });

  test('不存在的 session：status 404', async () => {
    const { status, body } = await get(`/api/sessions/${NONEXISTENT_SESSION}`);
    expect(status).toBe(404);
    expect(body).toHaveProperty('error');
  });
});

// ─────────────────────────────────────────────
// 6. GET /health — 健康檢查端點
// ─────────────────────────────────────────────
describe('GET /health', () => {
  test('status 200 且包含 ok、uptime、port 欄位', async () => {
    const { status, body } = await get('/health');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.uptime).toBe('number');
    expect(body.port).toBe(TEST_PORT);
  });
});

// ─────────────────────────────────────────────
// 7. CORS headers
// ─────────────────────────────────────────────
describe('CORS headers', () => {
  test('passatk 端點：response 包含 Access-Control-Allow-Origin（帶 Origin header）', async () => {
    const { headers } = await get(
      `/api/sessions/${TEST_SESSION}/passatk`,
      { Origin: `http://localhost:${TEST_PORT}` }
    );
    expect(headers.get('access-control-allow-origin')).not.toBeNull();
  });

  test('passatk 端點：localhost origin 被允許', async () => {
    const { headers } = await get(
      `/api/sessions/${TEST_SESSION}/passatk`,
      { Origin: `http://localhost:${TEST_PORT}` }
    );
    const corsOrigin = headers.get('access-control-allow-origin');
    expect(corsOrigin).toBe(`http://localhost:${TEST_PORT}`);
  });

  test('passatk 端點：192.168.x.x 區網 origin 被允許', async () => {
    const { headers } = await get(
      `/api/sessions/${TEST_SESSION}/passatk`,
      { Origin: 'http://192.168.1.100:3000' }
    );
    const corsOrigin = headers.get('access-control-allow-origin');
    expect(corsOrigin).toBe('http://192.168.1.100:3000');
  });

  test('非 API 端點（/api/sessions）：包含 Access-Control-Allow-Origin', async () => {
    // /api/sessions 現在傳入 req，會設定動態 CORS header
    const { headers } = await get('/api/sessions');
    expect(headers.get('access-control-allow-origin')).not.toBeNull();
  });
});

// ─────────────────────────────────────────────
// 8. 靜態檔案路徑穿越防護
// ─────────────────────────────────────────────
describe('靜態檔案路徑穿越防護', () => {
  test('GET /static/../../../etc/passwd — 不回傳敏感檔案（404）', async () => {
    const { status } = await get('/static/../../../etc/passwd');
    expect(status).toBe(404);
  });

  test('GET /static/../session.html — 不直接存取 HTML 模板（404）', async () => {
    const { status } = await get('/static/../session.html');
    expect(status).toBe(404);
  });

  test('GET /static/.html 副檔名的請求應被拒絕（404）', async () => {
    // 直接透過 /static/ 存取 .html 檔案應被拒絕
    const { status } = await get('/static/session.html');
    expect(status).toBe(404);
  });

  test('非 /static/ 路徑的目錄穿越請求 — 回傳 404 而非敏感內容', async () => {
    // 直接請求不存在的路徑，不應洩漏任何資訊
    const { status } = await get('/../../etc/passwd');
    expect(status).toBe(404);
  });
});

// ─────────────────────────────────────────────
// 9. 不存在的 API 端點
// ─────────────────────────────────────────────
describe('API 404 處理', () => {
  test('GET /api/nonexistent — status 404', async () => {
    const { status, body } = await get('/api/nonexistent');
    expect(status).toBe(404);
    expect(body).toHaveProperty('error');
  });

  test('GET /unknown — status 404 純文字', async () => {
    const { status } = await get('/unknown-path-xyz');
    expect(status).toBe(404);
  });
});
