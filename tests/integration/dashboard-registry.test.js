'use strict';
/**
 * dashboard-registry.test.js — Dashboard + Registry 驗證整合測試
 *
 * 覆蓋以下三個驗證面向：
 *   1. Pipeline 可視化資料完整性（buildPipelineSegments 並行段落驗證）
 *   2. Timeline 事件完整性（26 種事件、11 分類、無舊事件殘留）
 *   3. Dashboard HTML 引用驗證（JS 模組路徑存在、無舊 skill 名稱）
 */

const { test, expect, beforeAll, describe } = require('bun:test');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB, PLUGIN_ROOT } = require('../helpers/paths');

const registry = require(join(SCRIPTS_LIB, 'registry'));

// timelineEvents 的靜態定義：以子進程取得隔離的乾淨值
// 原因：Bun 的 toMatchObject(expect.any(String)) 在某些版本會 mutate 共享的模組物件
const TIMELINE_EVENTS_SNAPSHOT = (() => {
  const proc = Bun.spawnSync([
    'node', '-e',
    `const r = require(${JSON.stringify(join(SCRIPTS_LIB, 'registry'))});` +
    `process.stdout.write(JSON.stringify(r.timelineEvents));`,
  ], { stdout: 'pipe', stderr: 'pipe' });
  if (proc.exitCode !== 0) throw new Error('無法讀取 timelineEvents: ' + new TextDecoder().decode(proc.stderr));
  return JSON.parse(new TextDecoder().decode(proc.stdout));
})();

// ══════════════════════════════════════════════════════════════════
// 1. Pipeline 可視化資料完整性（buildPipelineSegments 直接測試）
// ══════════════════════════════════════════════════════════════════

describe('1. Pipeline 可視化 — buildPipelineSegments 並行段落驗證', () => {
  let buildPipelineSegments;

  beforeAll(() => {
    const windowMock = {};
    const pipelineSrc = readFileSync(
      join(PLUGIN_ROOT, 'web', 'js', 'pipeline.js'),
      'utf8'
    );
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

  test('quick workflow：有一個 postdev parallel segment（RETRO + DOCS 並行）', () => {
    const stagesObj = toStagesObj(['DEV', 'REVIEW', 'RETRO', 'DOCS']);
    const segments = buildPipelineSegments(stagesObj, 'quick', parallelGroupDefs, workflowParallelGroups);
    const parallelSegs = segments.filter(s => s.type === 'parallel');
    expect(parallelSegs.length).toBe(1);
    expect(parallelSegs[0].groupName).toBe('postdev');
  });

  test('standard workflow：有 quality 和 postdev 兩個 parallel segment', () => {
    const stagesObj = toStagesObj(['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);
    const segments = buildPipelineSegments(stagesObj, 'standard', parallelGroupDefs, workflowParallelGroups);
    const parallelSegs = segments.filter(s => s.type === 'parallel');
    expect(parallelSegs.length).toBe(2);
    const groupNames = parallelSegs.map(s => s.groupName);
    expect(groupNames).toContain('quality');
    expect(groupNames).toContain('postdev');
  });

  test('full workflow：有三個 parallel segment（quality + verify + postdev）', () => {
    const stagesObj = toStagesObj([
      'PLAN', 'ARCH', 'DESIGN', 'TEST', 'DEV',
      'REVIEW', 'TEST', 'QA', 'E2E', 'RETRO', 'DOCS',
    ]);
    const segments = buildPipelineSegments(stagesObj, 'full', parallelGroupDefs, workflowParallelGroups);
    const parallelSegs = segments.filter(s => s.type === 'parallel');
    expect(parallelSegs.length).toBe(3);
    const groupNames = parallelSegs.map(s => s.groupName);
    expect(groupNames).toContain('quality');
    expect(groupNames).toContain('verify');
    expect(groupNames).toContain('postdev');
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
    expect(qualitySeg).not.toBe(verifySeg);
    const qualityKeys = qualitySeg.stages.map(s => s.key.split(':')[0]);
    const verifyKeys = verifySeg.stages.map(s => s.key.split(':')[0]);
    expect(qualityKeys).toContain('REVIEW');
    expect(qualityKeys).toContain('TEST');
    expect(verifyKeys).toContain('QA');
    expect(verifyKeys).toContain('E2E');
  });

  test('secure workflow：secure-quality 和 postdev 兩個 parallel segment', () => {
    const stagesObj = toStagesObj([
      'PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'SECURITY', 'RETRO', 'DOCS',
    ]);
    const segments = buildPipelineSegments(stagesObj, 'secure', parallelGroupDefs, workflowParallelGroups);
    const parallelSegs = segments.filter(s => s.type === 'parallel');
    expect(parallelSegs.length).toBe(2);
    const groupNames = parallelSegs.map(s => s.groupName);
    expect(groupNames).toContain('secure-quality');
    expect(groupNames).toContain('postdev');
    const secureQualitySeg = parallelSegs.find(s => s.groupName === 'secure-quality');
    const groupStageKeys = secureQualitySeg.stages.map(s => s.key.split(':')[0]);
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
    const linearBefore = segments.filter(s => s.type === 'stage' && ['PLAN', 'ARCH', 'TEST', 'DEV'].includes(s.key));
    expect(linearBefore.length).toBe(4);
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. Timeline 事件完整性
// ══════════════════════════════════════════════════════════════════

describe('2. Timeline 事件完整性', () => {
  let timelineEvents;

  beforeAll(() => {
    timelineEvents = TIMELINE_EVENTS_SNAPSHOT;
  });

  test('registry 中 timelineEvents 數量與 counts helper 一致', () => {
    const { TIMELINE_EVENT_COUNT } = require('../helpers/counts');
    expect(Object.keys(timelineEvents).length).toBe(TIMELINE_EVENT_COUNT);
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

  test('category 種類數量與 counts helper 一致', () => {
    const { TIMELINE_CATEGORY_COUNT } = require('../helpers/counts');
    const categories = [...new Set(Object.values(timelineEvents).map(e => e.category))];
    expect(categories.length).toBe(TIMELINE_CATEGORY_COUNT);
  });

  test('14 個 category 每個至少有一個事件', () => {
    const expectedCategories = [
      'workflow', 'stage', 'agent', 'loop',
      'parallel', 'grader', 'specs', 'error',
      'session', 'tool', 'system', 'hook', 'queue', 'quality',
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
// 3. Dashboard HTML 引用驗證
// ══════════════════════════════════════════════════════════════════

describe('3. Dashboard HTML 引用驗證', () => {
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
});
