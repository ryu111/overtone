#!/usr/bin/env bun
'use strict';
/**
 * server.js — Overtone Dashboard Server
 *
 * Bun HTTP server：路由、REST API、SSE、靜態檔案。
 * 啟動：bun run scripts/server.js
 * 端口：OVERTONE_PORT 環境變數（預設 7777）
 */

const { readFileSync } = require('fs');
const { join, extname } = require('path');
const pid = require('./lib/dashboard/pid');
const sessions = require('./lib/dashboard/sessions');
const sse = require('./lib/dashboard/sse');
const state = require('./lib/state');
const timeline = require('./lib/timeline');
const { stages, workflows } = require('./lib/registry');

// ── 設定 ──

const PORT = parseInt(process.env.OVERTONE_PORT || '7777', 10);
const WEB_DIR = join(__dirname, '..', 'web');
const START_TIME = Date.now();

// ── Workflow 中文標籤 ──

const workflowLabels = {};
for (const [key, wf] of Object.entries(workflows)) {
  workflowLabels[key] = wf.label;
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
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // SSE 端點
    if (path.startsWith('/sse/')) {
      return handleSSE(path);
    }

    // API 端點
    if (path.startsWith('/api/')) {
      return handleAPI(path, url.searchParams);
    }

    // 健康檢查
    if (path === '/health') {
      return json({
        ok: true,
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
        port: PORT,
      });
    }

    // Session 頁面
    const sessionMatch = path.match(/^\/s\/([a-zA-Z0-9_-]+)$/);
    if (sessionMatch) {
      return serveSessionPage(sessionMatch[1]);
    }

    // 靜態檔案
    if (path.startsWith('/static/')) {
      return serveStatic(path);
    }

    // 首頁
    if (path === '/' || path === '/index.html') {
      return serveIndexPage();
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

// ── 清理 ──

function cleanup() {
  sse.closeAll();
  pid.remove();
  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// ── SSE 處理 ──

function handleSSE(path) {
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  };

  if (path === '/sse/all') {
    const stream = sse.createAllSSEStream();
    return new Response(stream, { headers });
  }

  const sessionId = path.slice('/sse/'.length);
  if (!sessionId) {
    return json({ error: '缺少 sessionId' }, 400);
  }

  const stream = sse.createSSEStream(sessionId);
  return new Response(stream, { headers });
}

// ── API 處理 ──

function handleAPI(path, params) {
  // GET /api/sessions
  if (path === '/api/sessions') {
    const activeParam = params.get('active');
    const filter = {};
    if (activeParam === 'true') filter.active = true;
    if (activeParam === 'false') filter.active = false;
    return json(sessions.listSessions(filter));
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
    return json(events);
  }

  // GET /api/sessions/:id
  const sessionMatch = path.match(/^\/api\/sessions\/([a-zA-Z0-9_-]+)$/);
  if (sessionMatch) {
    const ws = state.readState(sessionMatch[1]);
    if (!ws) return json({ error: 'Session 不存在' }, 404);
    return json(ws);
  }

  return json({ error: 'API 端點不存在' }, 404);
}

// ── HTML 頁面 ──

function serveIndexPage() {
  try {
    const allSessions = sessions.listSessions();
    const activeSessions = allSessions.filter(s => s.isActive);
    const historySessions = allSessions.filter(s => !s.isActive);

    const html = readFileSync(join(WEB_DIR, 'index.html'), 'utf8')
      .replace('{{ACTIVE_SESSIONS}}', renderSessionCards(activeSessions))
      .replace('{{HISTORY_SESSIONS}}', renderSessionCards(historySessions))
      .replace('{{ACTIVE_COUNT}}', String(activeSessions.length))
      .replace('{{HISTORY_COUNT}}', String(historySessions.length));

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return new Response('Dashboard 首頁載入失敗', { status: 500 });
  }
}

function serveSessionPage(sessionId) {
  try {
    const html = readFileSync(join(WEB_DIR, 'session.html'), 'utf8')
      .replace(/\{\{SESSION_ID\}\}/g, sessionId);

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return new Response('Session 頁面載入失敗', { status: 500 });
  }
}

// ── Session 卡片渲染 ──

function renderSessionCards(sessionList) {
  if (sessionList.length === 0) {
    return '<div class="empty-state">無工作階段</div>';
  }

  return sessionList.map(s => {
    const label = workflowLabels[s.workflowType] || s.workflowType || '未知';
    const pct = s.progress.total > 0
      ? Math.round(s.progress.completed / s.progress.total * 100)
      : 0;
    const time = formatDate(s.createdAt);
    const sid8 = (s.sessionId || '').slice(0, 8);
    const activeClass = s.isActive ? 'active' : '';

    return `<a href="/s/${s.sessionId}" class="session-card ${activeClass}">
      <div class="session-header">
        <span class="workflow-type">${label}</span>
        <span class="session-time">${time}</span>
      </div>
      <div class="progress-mini">
        <div class="progress-fill" style="width: ${pct}%"></div>
      </div>
      <div class="session-stats">
        <span>${s.progress.completed}/${s.progress.total} 階段</span>
        <span class="session-id">${sid8}...</span>
      </div>
    </a>`;
  }).join('\n');
}

// ── 靜態檔案 ──

function serveStatic(path) {
  const relativePath = path.replace('/static/', '');
  const filePath = join(WEB_DIR, 'styles', relativePath);

  try {
    const content = readFileSync(filePath);
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function formatDate(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-TW', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}
