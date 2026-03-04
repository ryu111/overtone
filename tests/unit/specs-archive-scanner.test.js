'use strict';
/**
 * specs-archive-scanner.test.js
 *
 * Feature: scanAndArchive() — 掃描並歸檔已完成的 feature
 *
 * Scenario 1: 空目錄時回傳 { archived: [], count: 0 }
 * Scenario 2: 全勾選的 feature 被正確歸檔
 * Scenario 3: skipFeature 正確跳過指定 feature
 * Scenario 4: sessionId 為 null 時不 emit timeline 事件
 * Scenario 5: 單一 feature archiveFeature 拋出例外時不影響其他
 */

const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { scanAndArchive } = require(join(SCRIPTS_LIB, 'specs-archive-scanner'));

// ── 輔助：建立臨時 projectRoot ──

function createTempProject() {
  const projectRoot = join(tmpdir(), `overtone_archive_scanner_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, 'specs', 'features', 'in-progress'), { recursive: true });
  mkdirSync(join(projectRoot, 'specs', 'features', 'archive'), { recursive: true });
  return projectRoot;
}

/**
 * 在 in-progress 下建立 feature 目錄並寫入 tasks.md。
 * @param {string} projectRoot
 * @param {string} featureName
 * @param {boolean} allChecked - true 表示全勾選，false 表示有未勾選
 */
function createFeature(projectRoot, featureName, allChecked) {
  const dir = join(projectRoot, 'specs', 'features', 'in-progress', featureName);
  mkdirSync(dir, { recursive: true });

  const tasksMd = allChecked
    ? '## Stages\n- [x] DEV\n- [x] REVIEW\n'
    : '## Stages\n- [x] DEV\n- [ ] REVIEW\n';

  writeFileSync(join(dir, 'tasks.md'), tasksMd, 'utf8');
}

// ── Scenario 1: 空目錄 ──

describe('scanAndArchive', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = createTempProject();
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('Scenario 1a: in-progress 目錄為空時回傳 { archived: [], count: 0 }', () => {
    const result = scanAndArchive(projectRoot, null);
    expect(result.archived).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('Scenario 1b: projectRoot 為空字串時回傳 { archived: [], count: 0 }', () => {
    const result = scanAndArchive('', null);
    expect(result.archived).toEqual([]);
    expect(result.count).toBe(0);
  });

  // ── Scenario 2: 全勾選的 feature 被歸檔 ──

  it('Scenario 2a: 全勾選的 feature 被歸檔，archived 包含該 feature 名稱', () => {
    createFeature(projectRoot, 'done-feature', true);

    const result = scanAndArchive(projectRoot, null);

    expect(result.archived).toContain('done-feature');
    expect(result.count).toBe(1);
  });

  it('Scenario 2b: 未完成的 feature（有未勾選）不被歸檔', () => {
    createFeature(projectRoot, 'pending-feature', false);

    const result = scanAndArchive(projectRoot, null);

    expect(result.archived).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('Scenario 2c: 多個 feature 時，只有全勾選的被歸檔', () => {
    createFeature(projectRoot, 'done-a', true);
    createFeature(projectRoot, 'done-b', true);
    createFeature(projectRoot, 'wip-c', false);

    const result = scanAndArchive(projectRoot, null);

    expect(result.count).toBe(2);
    expect(result.archived).toContain('done-a');
    expect(result.archived).toContain('done-b');
    expect(result.archived).not.toContain('wip-c');
  });

  // ── Scenario 3: skipFeature 正確跳過 ──

  it('Scenario 3a: skipFeature 指定的 feature 不被歸檔（即使全勾選）', () => {
    createFeature(projectRoot, 'skip-me', true);
    createFeature(projectRoot, 'archive-me', true);

    const result = scanAndArchive(projectRoot, null, { skipFeature: 'skip-me' });

    expect(result.archived).not.toContain('skip-me');
    expect(result.archived).toContain('archive-me');
    expect(result.count).toBe(1);
  });

  it('Scenario 3b: skipFeature 為 null 時不跳過任何 feature', () => {
    createFeature(projectRoot, 'done-x', true);

    const result = scanAndArchive(projectRoot, null, { skipFeature: null });

    expect(result.archived).toContain('done-x');
    expect(result.count).toBe(1);
  });

  // ── Scenario 4: sessionId 為 null 時不 emit timeline ──

  it('Scenario 4: sessionId 為 null 時不呼叫 timeline.emit', () => {
    createFeature(projectRoot, 'done-feature', true);

    // 攔截 timeline.emit — 透過 require cache 替換
    const timelinePath = join(SCRIPTS_LIB, 'timeline');
    const timelineModule = require(timelinePath);
    const originalEmit = timelineModule.emit;
    let emitCalled = false;
    timelineModule.emit = () => { emitCalled = true; };

    try {
      const result = scanAndArchive(projectRoot, null);
      expect(result.count).toBe(1);
      expect(emitCalled).toBe(false);
    } finally {
      timelineModule.emit = originalEmit;
    }
  });

  it('Scenario 4b: sessionId 有值且有歸檔時呼叫 timeline.emit', () => {
    createFeature(projectRoot, 'done-feature', true);

    const timelinePath = join(SCRIPTS_LIB, 'timeline');
    const timelineModule = require(timelinePath);
    const originalEmit = timelineModule.emit;
    let emitArgs = null;
    timelineModule.emit = (...args) => { emitArgs = args; };

    try {
      const result = scanAndArchive(projectRoot, 'test-session-id', { source: 'on-stop' });
      expect(result.count).toBe(1);
      expect(emitArgs).not.toBeNull();
      expect(emitArgs[0]).toBe('test-session-id');
      expect(emitArgs[1]).toBe('specs:archive-scan');
      expect(emitArgs[2].archived).toContain('done-feature');
      expect(emitArgs[2].source).toBe('on-stop');
    } finally {
      timelineModule.emit = originalEmit;
    }
  });

  it('Scenario 4c: sessionId 有值但無歸檔時不呼叫 timeline.emit', () => {
    // in-progress 為空 → archived = []，不 emit
    const timelinePath = join(SCRIPTS_LIB, 'timeline');
    const timelineModule = require(timelinePath);
    const originalEmit = timelineModule.emit;
    let emitCalled = false;
    timelineModule.emit = () => { emitCalled = true; };

    try {
      const result = scanAndArchive(projectRoot, 'test-session-id');
      expect(result.count).toBe(0);
      expect(emitCalled).toBe(false);
    } finally {
      timelineModule.emit = originalEmit;
    }
  });

  // ── Scenario 5: 單一 feature 拋出例外時不影響其他 ──

  it('Scenario 5: 某個 feature 歸檔失敗時，其他 feature 仍正常歸檔', () => {
    // done-good：正常歸檔
    createFeature(projectRoot, 'done-good', true);

    // done-bad：tasks.md 全勾選但我們讓 archiveFeature 對其失敗
    // 作法：在 archive 目錄下預先建立同名目錄讓 archiveFeature 無法移動（但 specs.js 會找不衝突路徑）
    // 更可靠作法：讓 tasks.md 存在但 in-progress 目錄本身是個 symlink 指向不存在的目標
    // 最直接作法：建立一個空的 tasks.md（無 ## Stages 區塊）讓 readTasksCheckboxes 回傳 null → 跳過
    // 這樣不符合 Scenario 5 的「拋出例外」意義，改用替換 specs 模組的 archiveFeature

    const specsPath = join(SCRIPTS_LIB, 'specs');
    const specsModule = require(specsPath);
    const originalArchive = specsModule.archiveFeature;

    createFeature(projectRoot, 'done-bad', true);

    let archiveCalls = [];
    specsModule.archiveFeature = (root, name) => {
      archiveCalls.push(name);
      if (name === 'done-bad') {
        throw new Error('模擬歸檔失敗');
      }
      return originalArchive(root, name);
    };

    try {
      const result = scanAndArchive(projectRoot, null);

      // done-good 應該歸檔成功
      expect(result.archived).toContain('done-good');
      // done-bad 拋出例外，不出現在 archived
      expect(result.archived).not.toContain('done-bad');
      // count 只計算成功歸檔的數量
      expect(result.count).toBe(1);
      // archiveFeature 應該被呼叫兩次（兩個全勾選的 feature）
      expect(archiveCalls.length).toBe(2);
    } finally {
      specsModule.archiveFeature = originalArchive;
    }
  });
});
