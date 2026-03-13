import { describe, test, expect, afterAll } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';

const { getConfig } = await import(join(homedir(), '.claude/scripts/flow/config.js'));
const { buildGraph } = await import(join(homedir(), '.claude/scripts/flow/graph-builder.js'));

const TEST_PORT = 13457;

const server = Bun.serve({
  port: TEST_PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/api/graph') return Response.json(buildGraph());
    if (url.pathname === '/api/config') return Response.json(getConfig());
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } });
    }
    return new Response('Not Found', { status: 404 });
  },
});

afterAll(() => server.stop());

const BASE = `http://localhost:${TEST_PORT}`;

describe('flow-server 路由', () => {
  test('GET / → status 200 + content-type text/html', async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
  });

  test('GET /index.html → status 200 + content-type text/html', async () => {
    const res = await fetch(`${BASE}/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
  });

  test('GET /api/graph → status 200 + JSON with nodes/edges/breaks', async () => {
    const res = await fetch(`${BASE}/api/graph`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);

    const body = await res.json();
    expect(body).toHaveProperty('nodes');
    expect(body).toHaveProperty('edges');
    expect(body).toHaveProperty('breaks');
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
    expect(Array.isArray(body.breaks)).toBe(true);
  });

  test('GET /api/config → status 200 + JSON with port/theme/animation', async () => {
    const res = await fetch(`${BASE}/api/config`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);

    const body = await res.json();
    expect(body).toHaveProperty('port');
    expect(body).toHaveProperty('theme');
    expect(body).toHaveProperty('animation');
    expect(typeof body.port).toBe('number');
    expect(typeof body.theme).toBe('object');
    expect(typeof body.animation).toBe('object');
  });

  test('GET /nonexistent → status 404', async () => {
    const res = await fetch(`${BASE}/nonexistent`);
    expect(res.status).toBe(404);
  });

  test('GET /api/unknown → status 404', async () => {
    const res = await fetch(`${BASE}/api/unknown`);
    expect(res.status).toBe(404);
  });

  test('GET /api/graph nodes 包含正確 type 欄位', async () => {
    const res = await fetch(`${BASE}/api/graph`);
    const { nodes } = await res.json();
    const validTypes = new Set(['agent', 'skill', 'hook', 'rule']);
    for (const node of nodes) {
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('type');
      expect(node).toHaveProperty('name');
      expect(validTypes.has(node.type)).toBe(true);
    }
  });

  test('GET /api/config theme 包含 nodeColors', async () => {
    const res = await fetch(`${BASE}/api/config`);
    const body = await res.json();
    expect(body.theme).toHaveProperty('nodeColors');
    expect(body.theme.nodeColors).toHaveProperty('agent');
    expect(body.theme.nodeColors).toHaveProperty('skill');
    expect(body.theme.nodeColors).toHaveProperty('hook');
  });
});
