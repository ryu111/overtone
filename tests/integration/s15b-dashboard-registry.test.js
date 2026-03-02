'use strict';
/**
 * s15b-dashboard-registry.test.js — S15b Dashboard + Registry 驗證整合測試
 *
 * 覆蓋以下四個驗證面向：
 *   1. /api/registry 回傳正確資料（stages 16 個、workflows 18 個、parallelGroupDefs 3 個）
 *   2. Pipeline 可視化資料完整性（buildPipelineSegments 並行段落驗證）
 *   3. Timeline 事件完整性（24 種事件、11 分類、無舊事件殘留）
 *   4. Dashboard HTML 引用驗證（JS 模組路徑存在、無舊 skill 名稱）
 *
 * 測試模式參考：tests/integration/server.test.js
 */

const { test, expect, beforeAll, afterAll, describe } = require('bun:test');
const { mkdirSync, rmSync, readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB, SCRIPTS_DIR, PLUGIN_ROOT } = require('../helpers/paths');

const state = require(join(SCRIPTS_LIB, 'state'));
const registry = require(join(SCRIPTS_LIB, 'registry'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// timelineEvents 的靜態定義：直接從源碼讀取，完全不依賴 require 的模組快取
// 原因：Bun 的 toMatchObject(expect.any(String)) 在某些版本會 mutate 共享的模組物件，
// 導致 platform-alignment-registry.test.js 的測試執行後 tool:failure.label 變成 {}。
// 解決方案：以子進程執行取得隔離的乾淨值。
const TIMELINE_EVENTS_SNAPSHOT = (() => {
  // 使用 Bun.spawnSync 在隔離的 Node 進程中讀取 registry
  const proc = Bun.spawnSync([
    'node', '-e',
    `const r = require(${JSON.stringify(join(SCRIPTS_LIB, 'registry'))});` +
    `process.stdout.write(JSON.stringify(r.timelineEvents));`,
  ], { stdout: 'pipe', stderr: 'pipe' });
  if (proc.exitCode !== 0) throw new Error('無法讀取 timelineEvents: ' + new TextDecoder().decode(proc.stderr));
  return JSON.parse(new TextDecoder().decode(proc.stdout));
})();

// ── 常數 ──

// 使用不同於其他測試的 port 避免衝突
const TEST_PORT = 17779;
const BASE_URL = `http://localhost:${TEST_PORT}`;

const TEST_SESSION = `test_s15b_dashboard_${Date.now()}`;
const SESSION_DIR = join(homedir(), '.overtone', 'sessions', TEST_SESSION);

let serverProcess = null;

// ── 輔助函式 ──

/**
 * 等待 server 就緒（輪詢 /health 端點）
 * @param {number} maxWaitMs
 */
async function waitForServer(maxWaitMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {
      // 尚未就緒，繼續等待
    }
    await Bun.sleep(100);
  }
  throw new Error(`Server 在 ${maxWaitMs}ms 內未就緒`);
}

/**
 * 發送 GET 請求並回傳 { status, body, headers }
 * @param {string} path
 */
async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const contentType = res.headers.get('content-type') || '';
  let body;
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { status: res.status, body, headers: res.headers };
}

// ── Setup / Teardown ──

beforeAll(async () => {
  // 建立測試 session
  mkdirSync(SESSION_DIR, { recursive: true });
  state.initState(TEST_SESSION, 'standard', ['PLAN', 'ARCH', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);

  // 啟動 server 子進程
  const serverScript = join(SCRIPTS_DIR, 'server.js');
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

// ══════════════════════════════════════════════════════════════════
// 1. /api/registry 回傳正確資料
// ══════════════════════════════════════════════════════════════════

describe('1. GET /api/registry — 回傳正確的 S15b 結構', () => {
  test('status 200 且包含 stages、workflows、parallelGroupDefs 欄位', async () => {
    const { status, body } = await get('/api/registry');
    expect(status).toBe(200);
    expect(body).toHaveProperty('stages');
    expect(body).toHaveProperty('workflows');
    expect(body).toHaveProperty('parallelGroupDefs');
  });

  test('stages 共有 16 個（含 PM stage）', async () => {
    const { body } = await get('/api/registry');
    const stageKeys = Object.keys(body.stages);
    expect(stageKeys.length).toBe(16);
  });

  test('stages 每個都有 label、emoji、agent、color 欄位', async () => {
    const { body } = await get('/api/registry');
    for (const [key, stage] of Object.entries(body.stages)) {
      expect(stage).toHaveProperty('label');
      expect(stage).toHaveProperty('emoji');
      expect(stage).toHaveProperty('agent');
      expect(stage).toHaveProperty('color');
      expect(typeof stage.label).toBe('string');
      expect(stage.label.length).toBeGreaterThan(0);
    }
  });

  test('stages 包含所有預期的 16 個 stage key', async () => {
    const { body } = await get('/api/registry');
    const expectedStages = [
      'PM', 'PLAN', 'ARCH', 'DESIGN', 'DEV', 'DEBUG',
      'REVIEW', 'TEST', 'SECURITY', 'DB-REVIEW', 'QA', 'E2E',
      'BUILD-FIX', 'REFACTOR', 'RETRO', 'DOCS',
    ];
    for (const s of expectedStages) {
      expect(body.stages).toHaveProperty(s);
    }
  });

  test('workflows 共有 18 個', async () => {
    const { body } = await get('/api/registry');
    const workflowKeys = Object.keys(body.workflows);
    expect(workflowKeys.length).toBe(18);
  });

  test('workflows 每個都有 label 和 parallelGroups 欄位', async () => {
    const { body } = await get('/api/registry');
    for (const [name, wf] of Object.entries(body.workflows)) {
      expect(wf).toHaveProperty('label');
      expect(wf).toHaveProperty('parallelGroups');
      expect(typeof wf.label).toBe('string');
      expect(Array.isArray(wf.parallelGroups)).toBe(true);
    }
  });

  test('parallelGroupDefs 共有 3 個群組：quality、verify、secure-quality', async () => {
    const { body } = await get('/api/registry');
    expect(body.parallelGroupDefs).toHaveProperty('quality');
    expect(body.parallelGroupDefs).toHaveProperty('verify');
    expect(body.parallelGroupDefs).toHaveProperty('secure-quality');
    expect(Object.keys(body.parallelGroupDefs).length).toBe(3);
  });

  test('parallelGroupDefs.quality 包含 REVIEW 和 TEST', async () => {
    const { body } = await get('/api/registry');
    expect(body.parallelGroupDefs.quality).toContain('REVIEW');
    expect(body.parallelGroupDefs.quality).toContain('TEST');
  });

  test('parallelGroupDefs.verify 包含 QA 和 E2E', async () => {
    const { body } = await get('/api/registry');
    expect(body.parallelGroupDefs.verify).toContain('QA');
    expect(body.parallelGroupDefs.verify).toContain('E2E');
  });

  test('parallelGroupDefs.secure-quality 包含 REVIEW、TEST、SECURITY', async () => {
    const { body } = await get('/api/registry');
    expect(body.parallelGroupDefs['secure-quality']).toContain('REVIEW');
    expect(body.parallelGroupDefs['secure-quality']).toContain('TEST');
    expect(body.parallelGroupDefs['secure-quality']).toContain('SECURITY');
  });

});

// ══════════════════════════════════════════════════════════════════
// 1b. /api/registry — timelineEvents 不在 API 回應中，另行驗證（直接讀 registry）
// ══════════════════════════════════════════════════════════════════

describe('1b. Registry timelineEvents 數量驗證（直接讀 registry）', () => {
  test('registry.timelineEvents 共有 24 種事件', () => {
    expect(Object.keys(registry.timelineEvents).length).toBe(24);
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. Pipeline 可視化資料完整性（buildPipelineSegments 直接測試）
// ══════════════════════════════════════════════════════════════════

describe('2. Pipeline 可視化 — buildPipelineSegments 並行段落驗證', () => {
  // 在 Bun/Node 環境模擬 window 以載入 pipeline.js
  let buildPipelineSegments;

  beforeAll(() => {
    // pipeline.js 使用 window 全域命名空間，需在 Node/Bun 環境中模擬
    const windowMock = {};
    const pipelineSrc = readFileSync(
      join(PLUGIN_ROOT, 'web', 'js', 'pipeline.js'),
      'utf8'
    );
    // 在隔離環境執行，注入 window mock
    const fn = new Function('window', pipelineSrc);
    fn(windowMock);
    buildPipelineSegments = windowMock.OT.pipeline.buildPipelineSegments;
  });

  /**
   * 將 workflow stages 陣列轉為 buildPipelineSegments 所需的 stages 物件格式
   * @param {string[]} stageArr
   * @returns {Object}
   */
  function toStagesObj(stageArr) {
    const obj = {};
    stageArr.forEach((s, i) => {
      // 同名 stage 重複出現時加後綴（如 TEST:2）
      const count = stageArr.slice(0, i).filter(x => x === s).length;
      const key = count > 0 ? `${s}:${count + 1}` : s;
      obj[key] = { status: 'pending' };
    });
    return obj;
  }

  const { parallelGroupDefs } = registry;
  const workflowParallelGroups = {};
  for (const [name, wf] of Object.entries(registry.workflows)) {
    workflowParallelGroups[name] = wf.parallelGroups;
  }

  test('quick workflow：REVIEW + TEST 合為一個 parallel segment', () => {
    const stagesObj = toStagesObj(['DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);
    const segments = buildPipelineSegments(stagesObj, 'quick', parallelGroupDefs, workflowParallelGroups);
    const parallelSegs = segments.filter(s => s.type === 'parallel');
    expect(parallelSegs.length).toBe(1);
    const qualityGroup = parallelSegs.find(s => s.groupName === 'quality');
    expect(qualityGroup).toBeDefined();
    const groupStageKeys = qualityGroup.stages.map(s => s.key);
    expect(groupStageKeys).toContain('REVIEW');
    expect(groupStageKeys).toContain('TEST');
  });

  test('standard workflow：DEV 後的 REVIEW + TEST 合為 quality parallel segment', () => {
    const stagesObj = toStagesObj(['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);
    const segments = buildPipelineSegments(stagesObj, 'standard', parallelGroupDefs, workflowParallelGroups);
    const parallelSegs = segments.filter(s => s.type === 'parallel');
    expect(parallelSegs.length).toBe(1);
    expect(parallelSegs[0].groupName).toBe('quality');
  });

  test('full workflow：有兩個 parallel segment（quality + verify）', () => {
    const stagesObj = toStagesObj([
      'PLAN', 'ARCH', 'DESIGN', 'TEST', 'DEV',
      'REVIEW', 'TEST', 'QA', 'E2E', 'RETRO', 'DOCS',
    ]);
    const segments = buildPipelineSegments(stagesObj, 'full', parallelGroupDefs, workflowParallelGroups);
    const parallelSegs = segments.filter(s => s.type === 'parallel');
    expect(parallelSegs.length).toBe(2);
    const groupNames = parallelSegs.map(s => s.groupName);
    expect(groupNames).toContain('quality');
    expect(groupNames).toContain('verify');
  });

  test('full workflow：quality 和 verify 是不同的獨立 parallel segment', () => {
    const stagesObj = toStagesObj([
      'PLAN', 'ARCH', 'DESIGN', 'TEST', 'DEV',
      'REVIEW', 'TEST', 'QA', 'E2E', 'RETRO', 'DOCS',
    ]);
    const segments = buildPipelineSegments(stagesObj, 'full', parallelGroupDefs, workflowParallelGroups);
    const qualitySeg = segments.find(s => s.type === 'parallel' && s.groupName === 'quality');
    const verifySeg = segments.find(s => s.type === 'parallel' && s.groupName === 'verify');
    expect(qualitySeg).toBeDefined();
    expect(verifySeg).toBeDefined();
    // 兩個是不同的 segment 物件
    expect(qualitySeg).not.toBe(verifySeg);
    // quality 包含 REVIEW/TEST，verify 包含 QA/E2E
    const qualityKeys = qualitySeg.stages.map(s => s.key.split(':')[0]);
    const verifyKeys = verifySeg.stages.map(s => s.key.split(':')[0]);
    expect(qualityKeys).toContain('REVIEW');
    expect(qualityKeys).toContain('TEST');
    expect(verifyKeys).toContain('QA');
    expect(verifyKeys).toContain('E2E');
  });

  test('secure workflow：secure-quality parallel segment 包含 REVIEW、TEST、SECURITY', () => {
    const stagesObj = toStagesObj([
      'PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'SECURITY', 'RETRO', 'DOCS',
    ]);
    const segments = buildPipelineSegments(stagesObj, 'secure', parallelGroupDefs, workflowParallelGroups);
    const parallelSegs = segments.filter(s => s.type === 'parallel');
    expect(parallelSegs.length).toBe(1);
    expect(parallelSegs[0].groupName).toBe('secure-quality');
    const groupStageKeys = parallelSegs[0].stages.map(s => s.key.split(':')[0]);
    expect(groupStageKeys).toContain('REVIEW');
    expect(groupStageKeys).toContain('TEST');
    expect(groupStageKeys).toContain('SECURITY');
  });

  test('refactor workflow：有 quality parallel segment（REVIEW + TEST）', () => {
    const stagesObj = toStagesObj(['ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST']);
    const segments = buildPipelineSegments(stagesObj, 'refactor', parallelGroupDefs, workflowParallelGroups);
    const parallelSegs = segments.filter(s => s.type === 'parallel');
    expect(parallelSegs.length).toBe(1);
    expect(parallelSegs[0].groupName).toBe('quality');
  });

  test('single workflow：無 parallel segment（所有 stage 都是線性）', () => {
    const stagesObj = toStagesObj(['DEV']);
    const segments = buildPipelineSegments(stagesObj, 'single', parallelGroupDefs, workflowParallelGroups);
    const parallelSegs = segments.filter(s => s.type === 'parallel');
    expect(parallelSegs.length).toBe(0);
    expect(segments.length).toBe(1);
    expect(segments[0].type).toBe('stage');
  });

  test('DEV 之前的 stage 都是線性 segment（含 PLAN、ARCH）', () => {
    const stagesObj = toStagesObj(['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);
    const segments = buildPipelineSegments(stagesObj, 'standard', parallelGroupDefs, workflowParallelGroups);
    // PLAN、ARCH、TEST（DEV 前）、DEV 本身都是線性
    const linearBefore = segments.filter(s => s.type === 'stage' && ['PLAN', 'ARCH', 'TEST', 'DEV'].includes(s.key));
    expect(linearBefore.length).toBe(4);
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. Timeline 事件完整性
// ══════════════════════════════════════════════════════════════════

describe('3. Timeline 事件完整性', () => {
  // 在 describe 內部重新 require registry，避免頂層共享模組的快取污染問題
  // 直接讀取 registry-data 並結合 registry.js 的靜態定義，確保乾淨的資料
  let timelineEvents;

  beforeAll(() => {
    // 使用模組載入時就已深拷貝的 snapshot，確保不受其他測試的 toMatchObject 副作用影響
    timelineEvents = TIMELINE_EVENTS_SNAPSHOT;
  });

  test('registry 中共有 24 種 timelineEvents', () => {
    expect(Object.keys(timelineEvents).length).toBe(24);
  });

  test('每個 timelineEvent 都有 label 和 category', () => {
    for (const [eventType, def] of Object.entries(timelineEvents)) {
      expect(typeof def).toBe('object');
      expect(def).not.toBeNull();
      expect(typeof def.label).toBe('string');
      expect(def.label.length).toBeGreaterThan(0);
      expect(typeof def.category).toBe('string');
      expect(def.category.length).toBeGreaterThan(0);
    }
  });

  test('共有 11 種 category 類型', () => {
    const categories = [...new Set(Object.values(timelineEvents).map(e => e.category))];
    expect(categories.length).toBe(11);
  });

  test('11 個 category 每個至少有一個事件', () => {
    const expectedCategories = [
      'workflow', 'stage', 'agent', 'loop',
      'parallel', 'grader', 'specs', 'error',
      'session', 'tool', 'system',
    ];
    for (const cat of expectedCategories) {
      const events = Object.values(timelineEvents).filter(e => e.category === cat);
      expect(events.length).toBeGreaterThan(0);
    }
  });

  test('包含所有 workflow 類事件（start、complete、abort）', () => {
    expect(timelineEvents).toHaveProperty('workflow:start');
    expect(timelineEvents).toHaveProperty('workflow:complete');
    expect(timelineEvents).toHaveProperty('workflow:abort');
  });

  test('包含所有 stage 類事件（start、complete、retry）', () => {
    expect(timelineEvents).toHaveProperty('stage:start');
    expect(timelineEvents).toHaveProperty('stage:complete');
    expect(timelineEvents).toHaveProperty('stage:retry');
  });

  test('包含 session:compact 和 session:compact-suggestion', () => {
    expect(timelineEvents).toHaveProperty('session:compact');
    expect(timelineEvents).toHaveProperty('session:compact-suggestion');
  });

  test('不包含 handoff:create（已移除的舊事件）', () => {
    expect(timelineEvents).not.toHaveProperty('handoff:create');
  });

  test('不包含任何前綴為 spec: 的舊事件（正確名稱為 specs:）', () => {
    const hasOldSpecEvent = Object.keys(timelineEvents).some(k => k.startsWith('spec:') && !k.startsWith('specs:'));
    expect(hasOldSpecEvent).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 4. Dashboard HTML 引用驗證
// ══════════════════════════════════════════════════════════════════

describe('4. Dashboard HTML 引用驗證', () => {
  const DASHBOARD_HTML = join(PLUGIN_ROOT, 'web', 'dashboard.html');
  const WEB_JS_DIR = join(PLUGIN_ROOT, 'web', 'js');

  let htmlContent = '';

  beforeAll(() => {
    htmlContent = readFileSync(DASHBOARD_HTML, 'utf8');
  });

  test('dashboard.html 存在且非空', () => {
    expect(existsSync(DASHBOARD_HTML)).toBe(true);
    expect(htmlContent.length).toBeGreaterThan(0);
  });

  test('HTML 引用 /js/pipeline.js 且對應檔案存在', () => {
    expect(htmlContent).toContain('/js/pipeline.js');
    expect(existsSync(join(WEB_JS_DIR, 'pipeline.js'))).toBe(true);
  });

  test('HTML 引用 /js/timeline.js 且對應檔案存在', () => {
    expect(htmlContent).toContain('/js/timeline.js');
    expect(existsSync(join(WEB_JS_DIR, 'timeline.js'))).toBe(true);
  });

  test('HTML 引用 /js/confetti.js 且對應檔案存在', () => {
    expect(htmlContent).toContain('/js/confetti.js');
    expect(existsSync(join(WEB_JS_DIR, 'confetti.js'))).toBe(true);
  });

  test('HTML 不包含已刪除的舊 skill 名稱（ref-bdd-guide）', () => {
    expect(htmlContent).not.toContain('ref-bdd-guide');
  });

  test('HTML 不包含已刪除的舊 skill 名稱（ref-testing）', () => {
    expect(htmlContent).not.toContain('ref-testing');
  });

  test('HTML 不包含已刪除的舊 skill 名稱（ref-security）', () => {
    expect(htmlContent).not.toContain('ref-security');
  });

  test('HTML 不包含 SSR 模板標記（{{...}}）', () => {
    expect(htmlContent).not.toMatch(/\{\{[^}]+\}\}/);
  });

  test('GET / 回傳 Dashboard HTML（status 200 且包含 html 標記）', async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.toLowerCase()).toContain('<html');
  });

  test('GET /js/pipeline.js — server 回傳 status 200', async () => {
    const { status } = await get('/js/pipeline.js');
    expect(status).toBe(200);
  });

  test('GET /js/timeline.js — server 回傳 status 200', async () => {
    const { status } = await get('/js/timeline.js');
    expect(status).toBe(200);
  });

  test('GET /js/confetti.js — server 回傳 status 200', async () => {
    const { status } = await get('/js/confetti.js');
    expect(status).toBe(200);
  });
});
