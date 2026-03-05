'use strict';
/**
 * tests/unit/loop.test.js — Loop 狀態管理單元測試
 *
 * 測試面向：
 *   1. readLoop  — 讀取（不存在時初始化）
 *   2. writeLoop — 寫入後可讀取
 *   3. exitLoop  — 停止標記 + timeline emit
 *   4. readTasksStatus — tasks.md checkbox 完成度查詢
 */

const { describe, it, expect, afterAll } = require('bun:test');
const { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } = require('fs');
const { join } = require('path');
const { homedir, tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const loop = require(join(SCRIPTS_LIB, 'loop'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// 測試用 session ID（用時間戳保持唯一性）
const TEST_SESSION_ID = `loop-test-${Date.now()}`;
const SESSION_DIR = paths.session.workflow(TEST_SESSION_ID).replace('workflow.json', '');

// 建立 session 目錄（loop.js 的 atomicWrite 需要目錄存在）
mkdirSync(SESSION_DIR, { recursive: true });

afterAll(() => {
  rmSync(SESSION_DIR, { recursive: true, force: true });
});

// ── 1. readLoop ──

describe('readLoop', () => {
  it('loop.json 不存在時自動初始化並回傳預設值', () => {
    const sid = `${TEST_SESSION_ID}-init`;
    const dir = paths.session.workflow(sid).replace('workflow.json', '');
    mkdirSync(dir, { recursive: true });

    const data = loop.readLoop(sid);
    expect(data.iteration).toBe(0);
    expect(data.stopped).toBe(false);
    expect(data.consecutiveErrors).toBe(0);
    expect(typeof data.startedAt).toBe('string');

    // 確認已寫回磁碟
    const filePath = paths.session.loop(sid);
    expect(existsSync(filePath)).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });

  it('loop.json 存在時讀取並回傳已有資料', () => {
    const sid = `${TEST_SESSION_ID}-read`;
    const dir = paths.session.workflow(sid).replace('workflow.json', '');
    mkdirSync(dir, { recursive: true });

    const preset = {
      iteration: 3,
      stopped: false,
      consecutiveErrors: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
    };
    writeFileSync(paths.session.loop(sid), JSON.stringify(preset));

    const data = loop.readLoop(sid);
    expect(data.iteration).toBe(3);
    expect(data.consecutiveErrors).toBe(1);
    expect(data.startedAt).toBe('2026-01-01T00:00:00.000Z');

    rmSync(dir, { recursive: true, force: true });
  });
});

// ── 2. writeLoop ──

describe('writeLoop', () => {
  it('寫入後可讀取回相同資料', () => {
    const sid = `${TEST_SESSION_ID}-write`;
    const dir = paths.session.workflow(sid).replace('workflow.json', '');
    mkdirSync(dir, { recursive: true });

    const data = {
      iteration: 5,
      stopped: false,
      consecutiveErrors: 0,
      startedAt: new Date().toISOString(),
    };
    loop.writeLoop(sid, data);

    const raw = JSON.parse(readFileSync(paths.session.loop(sid), 'utf8'));
    expect(raw.iteration).toBe(5);
    expect(raw.stopped).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });
});

// ── 3. exitLoop ──

describe('exitLoop', () => {
  it('將 stopped 設為 true 並寫入 stoppedAt / stopReason', () => {
    const sid = `${TEST_SESSION_ID}-exit`;
    const dir = paths.session.workflow(sid).replace('workflow.json', '');
    mkdirSync(dir, { recursive: true });

    // 準備 timeline.jsonl（timeline.emit 需要目錄存在）
    writeFileSync(join(dir, 'timeline.jsonl'), '');

    const loopData = {
      iteration: 2,
      stopped: false,
      consecutiveErrors: 0,
      startedAt: new Date().toISOString(),
    };

    loop.exitLoop(sid, loopData, 'all_done');

    // loopData 物件本身被修改
    expect(loopData.stopped).toBe(true);
    expect(loopData.stopReason).toBe('all_done');
    expect(typeof loopData.stoppedAt).toBe('string');

    // 磁碟上已寫回
    const saved = JSON.parse(readFileSync(paths.session.loop(sid), 'utf8'));
    expect(saved.stopped).toBe(true);
    expect(saved.stopReason).toBe('all_done');

    // timeline.jsonl 至少有 2 筆事件（loop:complete + session:end）
    const lines = readFileSync(join(dir, 'timeline.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const events = lines.map((l) => JSON.parse(l));
    const types = events.map((e) => e.type);
    expect(types).toContain('loop:complete');
    expect(types).toContain('session:end');

    rmSync(dir, { recursive: true, force: true });
  });
});

// ── 4. readTasksStatus ──

describe('readTasksStatus', () => {
  it('projectRoot 為 null/undefined → 回傳 null', () => {
    expect(loop.readTasksStatus(null)).toBeNull();
    expect(loop.readTasksStatus(undefined)).toBeNull();
  });

  it('featureName 對應的 tasks.md 不存在 → 回傳 null', () => {
    const fakeRoot = join(tmpdir(), `loop-test-noroot-${Date.now()}`);
    const result = loop.readTasksStatus(fakeRoot, 'nonexistent-feature');
    expect(result).toBeNull();
  });

  it('tasks.md 無任何 checkbox → 回傳 null', () => {
    const root = join(tmpdir(), `loop-test-notasks-${Date.now()}`);
    const featureName = 'my-feature';
    const featureDir = join(root, 'specs', 'features', 'in-progress', featureName);
    mkdirSync(featureDir, { recursive: true });
    // 即使有 ## Stages 標頭，但無任何 checkbox → total=0 → readTasksStatus 回傳 null
    writeFileSync(
      join(featureDir, 'tasks.md'),
      '# 任務\n\n## Stages\n\n純文字，無 checkbox。\n'
    );

    const result = loop.readTasksStatus(root, featureName);
    expect(result).toBeNull();

    rmSync(root, { recursive: true, force: true });
  });

  it('tasks.md 有 checkbox → 回傳 { total, checked, allChecked }', () => {
    const root = join(tmpdir(), `loop-test-tasks-${Date.now()}`);
    const featureName = 'my-feature';
    const featureDir = join(root, 'specs', 'features', 'in-progress', featureName);
    mkdirSync(featureDir, { recursive: true });
    // readTasksCheckboxes 只解析 ## Stages 或 ## Tasks 區塊的 checkbox
    writeFileSync(
      join(featureDir, 'tasks.md'),
      '# 任務\n\n## Stages\n\n- [x] 完成項目 1\n- [ ] 待完成項目 2\n- [x] 完成項目 3\n'
    );

    const result = loop.readTasksStatus(root, featureName);
    expect(result).not.toBeNull();
    expect(result.total).toBe(3);
    expect(result.checked).toBe(2);
    expect(result.allChecked).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it('所有 checkbox 都勾選 → allChecked: true', () => {
    const root = join(tmpdir(), `loop-test-allchecked-${Date.now()}`);
    const featureName = 'my-feature';
    const featureDir = join(root, 'specs', 'features', 'in-progress', featureName);
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(
      join(featureDir, 'tasks.md'),
      '# 任務\n\n## Stages\n\n- [x] 完成項目 1\n- [x] 完成項目 2\n'
    );

    const result = loop.readTasksStatus(root, featureName);
    expect(result).not.toBeNull();
    expect(result.total).toBe(2);
    expect(result.checked).toBe(2);
    expect(result.allChecked).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });

  it('featureName 未提供且無 active feature → 回傳 null（靜默 fallback）', () => {
    const fakeRoot = join(tmpdir(), `loop-test-nofeat-${Date.now()}`);
    mkdirSync(join(fakeRoot, 'specs', 'features', 'in-progress'), { recursive: true });
    const result = loop.readTasksStatus(fakeRoot);
    expect(result).toBeNull();
    rmSync(fakeRoot, { recursive: true, force: true });
  });
});
