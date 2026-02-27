#!/usr/bin/env bun
'use strict';
/**
 * server.js — Overtone Dashboard + Remote Server
 *
 * Bun HTTP server：路由、REST API、SSE、控制端點、靜態檔案。
 * 啟動：bun run scripts/server.js
 * 端口：OVERTONE_PORT 環境變數（預設 7777）
 */

const { join, extname, resolve } = require('path');
const pid = require('./lib/dashboard/pid');
const sessions = require('./lib/dashboard/sessions');
const state = require('./lib/state');
const timeline = require('./lib/timeline');
const { stages, agentModels, workflows, parallelGroupDefs } = require('./lib/registry');

// ── Remote 模組 ──

const EventBus = require('./lib/remote/event-bus');
const DashboardAdapter = require('./lib/remote/dashboard-adapter');
const TelegramAdapter = require('./lib/remote/telegram-adapter');

// ── 初始化 EventBus + Adapter ──

const eventBus = new EventBus();
const dashboardAdapter = new DashboardAdapter(eventBus);
eventBus.register(dashboardAdapter);

// 可選 Telegram Adapter
let telegramAdapter = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
  telegramAdapter = new TelegramAdapter(
    process.env.TELEGRAM_BOT_TOKEN,
    eventBus,
    { chatId: process.env.TELEGRAM_CHAT_ID },
  );
  eventBus.register(telegramAdapter);
  telegramAdapter.connect();
}

eventBus.start();

// ── 設定 ──

const PORT = parseInt(process.env.OVERTONE_PORT || '7777', 10);
const WEB_DIR = join(__dirname, '..', 'web');
const START_TIME = Date.now();

/**
 * 動態 CORS origin 解析
 * 允許 localhost 和 192.168.x.x 區網，支援 OT_CORS_ORIGIN 環境變數覆蓋。
 * @param {Request} req
 * @returns {string}
 */
function getCorsOrigin(req) {
  const origin = req.headers.get?.('origin') || req.headers?.origin;
  const fallback = `http://localhost:${PORT}`;
  const allowed = process.env.OT_CORS_ORIGIN || fallback;
  if (!origin || origin === allowed) return allowed;
  // 允許 localhost 和 192.168.x.x 區網
  if (/^https?:\/\/(localhost|192\.168\.\d+\.\d+|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin;
  }
  return allowed;
}

// ── Agent 色彩反向映射（從 stages 提取）──

const agentColors = {};
for (const stageDef of Object.values(stages)) {
  if (stageDef.agent && stageDef.color) {
    agentColors[stageDef.agent] = stageDef.color;
  }
}

// ── MIME 對照 ──

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// ── 路由 ──

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // SSE 端點
    if (path.startsWith('/sse/')) {
      return handleSSE(path, req);
    }

    // API 端點
    if (path.startsWith('/api/')) {
      return handleAPI(path, url.searchParams, req);
    }

    // 健康檢查
    if (path === '/health') {
      return json({
        ok: true,
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
        port: PORT,
        adapters: Array.from(eventBus.adapters).map(a => ({
          name: a.name,
          connected: a.isConnected,
        })),
      });
    }

    // 靜態檔案
    if (path.startsWith('/static/')) {
      return serveStatic(path);
    }

    // 靜態 JS 模組
    if (path.startsWith('/js/')) {
      return serveJsModule(path);
    }

    // 首頁 — serve dashboard.html（SPA）
    if (path === '/' || path === '/index.html') {
      return serveDashboard();
    }

    return new Response('404 Not Found', { status: 404 });
  },
});

// ── 寫入 PID ──

pid.write({
  pid: process.pid,
  port: PORT,
  startedAt: new Date().toISOString(),
});

console.log(`🎵 Overtone Dashboard 啟動於 http://localhost:${PORT}`);
if (telegramAdapter) {
  console.log('📱 Telegram Adapter 已啟用');
}

// ── 清理 ──

function cleanup() {
  eventBus.stop();
  pid.remove();
  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// ── SSE 處理 ──

function handleSSE(path, req) {
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': getCorsOrigin(req),
  };

  if (path === '/sse/all') {
    const stream = dashboardAdapter.createAllSSEStream();
    return new Response(stream, { headers });
  }

  const sessionId = path.slice('/sse/'.length);
  if (!sessionId) {
    return json({ error: '缺少 sessionId' }, 400);
  }

  const stream = dashboardAdapter.createSSEStream(sessionId);
  return new Response(stream, { headers });
}

// ── API 處理 ──

async function handleAPI(path, params, req) {
  // POST /api/sessions/:id/control — 遠端控制
  const controlMatch = path.match(/^\/api\/sessions\/([a-zA-Z0-9_-]+)\/control$/);
  if (controlMatch && req.method === 'POST') {
    return handleControlAPI(controlMatch[1], req);
  }

  // POST /api/control — 全域控制（如 sessions 列表）
  if (path === '/api/control' && req.method === 'POST') {
    return handleControlAPI(null, req);
  }

  // GET /api/sessions
  if (path === '/api/sessions') {
    const activeParam = params.get('active');
    const filter = {};
    if (activeParam === 'true') filter.active = true;
    if (activeParam === 'false') filter.active = false;
    return json(sessions.listSessions(filter), 200, req);
  }

  // GET /api/sessions/:id/passatk
  const passatkMatch = path.match(/^\/api\/sessions\/([a-zA-Z0-9_-]+)\/passatk$/);
  if (passatkMatch) {
    const sessionId = passatkMatch[1];
    if (!state.readState(sessionId)) return json({ error: 'Session 不存在' }, 404, req);
    const data = timeline.passAtK(sessionId);
    return json(data, 200, req);
  }

  // GET /api/sessions/:id/timeline
  const timelineMatch = path.match(/^\/api\/sessions\/([a-zA-Z0-9_-]+)\/timeline$/);
  if (timelineMatch) {
    const sessionId = timelineMatch[1];
    const filter = {};
    const limit = params.get('limit');
    const category = params.get('category');
    if (limit) filter.limit = parseInt(limit, 10);
    if (category) filter.category = category;
    const events = timeline.query(sessionId, filter);
    return json(events, 200, req);
  }

  // GET /api/sessions/:id
  const sessionMatch = path.match(/^\/api\/sessions\/([a-zA-Z0-9_-]+)$/);
  if (sessionMatch) {
    const ws = state.readState(sessionMatch[1]);
    if (!ws) return json({ error: 'Session 不存在' }, 404, req);
    return json(ws, 200, req);
  }

  // GET /api/registry — 前端動態載入 registry（消除硬編碼重複）
  if (path === '/api/registry') {
    return json({
      stages: Object.fromEntries(
        Object.entries(stages).map(([k, v]) => [k, {
          label: v.label, emoji: v.emoji, color: v.color, agent: v.agent,
        }])
      ),
      workflows: Object.fromEntries(
        Object.entries(workflows).map(([k, v]) => [k, {
          label: v.label,
          parallelGroups: v.parallelGroups || [],
        }])
      ),
      agents: Object.fromEntries(
        Object.entries(agentModels).map(([name, model]) => [name, {
          model, color: agentColors[name] || 'unknown',
        }])
      ),
      parallelGroupDefs,
    }, 200, req);
  }

  return json({ error: 'API 端點不存在' }, 404, req);
}

/**
 * 處理控制 API 請求
 * @param {string|null} sessionId
 * @param {Request} req
 */
async function handleControlAPI(sessionId, req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: '無效的 JSON' }, 400);
  }

  const { command, params = {} } = body;
  if (!command) {
    return json({ ok: false, error: '缺少 command 欄位' }, 400);
  }

  const result = eventBus.handleControl(sessionId, command, params);
  return json(result, result.ok ? 200 : 400);
}

// ── HTML 頁面 ──

async function serveDashboard() {
  try {
    const file = Bun.file(join(WEB_DIR, 'dashboard.html'));
    const content = await file.arrayBuffer();
    return new Response(content, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return new Response('Dashboard 頁面載入失敗', { status: 500 });
  }
}

// ── JS 模組靜態服務 ──

async function serveJsModule(path) {
  const fileName = path.slice('/js/'.length);
  if (!fileName || fileName.includes('..')) {
    return new Response('404 Not Found', { status: 404 });
  }

  const filePath = resolve(join(WEB_DIR, 'js', fileName));
  const webDirResolved = resolve(WEB_DIR);
  if (!filePath.startsWith(webDirResolved + '/')) {
    return new Response('404 Not Found', { status: 404 });
  }

  try {
    const file = Bun.file(filePath);
    const content = await file.arrayBuffer();
    return new Response(content, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response('404 Not Found', { status: 404 });
  }
}

// ── 靜態檔案 ──

async function serveStatic(path) {
  const relativePath = path.replace('/static/', '');
  const filePath = resolve(join(WEB_DIR, relativePath));

  // 路徑穿越防護：確保解析後的路徑仍在 web 目錄內
  const webDirResolved = resolve(WEB_DIR);
  if (!filePath.startsWith(webDirResolved + '/')) {
    return new Response('404 Not Found', { status: 404 });
  }

  // 禁止直接存取 HTML 模板（含伺服端模板變數）
  if (extname(filePath) === '.html') {
    return new Response('404 Not Found', { status: 404 });
  }

  try {
    const file = Bun.file(filePath);
    const content = await file.arrayBuffer();
    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    return new Response(content, {
      headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return new Response('404 Not Found', { status: 404 });
  }
}

// ── 輔助 ──

function json(data, status = 200, req = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': req ? getCorsOrigin(req) : `http://localhost:${PORT}`,
    },
  });
}

