'use strict';
const { test, expect, describe, beforeAll } = require('bun:test');
const fs = require('fs');
const path = require('path');

// pipeline.js 是 browser-global script，透過模擬 window 環境載入
const pipelineSource = fs.readFileSync(
  path.join(__dirname, '../../plugins/overtone/web/js/pipeline.js'),
  'utf8'
);

// 建立隔離的 window 環境並執行 pipeline.js
function loadPipeline() {
  const win = { OT: {} };
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', pipelineSource);
  fn(win);
  return win.OT.pipeline;
}

const pipeline = loadPipeline();
const { buildPipelineSegments, getStageClass, getStageIcon } = pipeline;

// 測試用的 parallelGroupDefs（符合 registry.js 的定義）
const parallelGroupDefs = {
  quality:          ['REVIEW', 'TEST'],
  verify:           ['QA', 'E2E'],
  'secure-quality': ['REVIEW', 'TEST', 'SECURITY'],
};

// 測試用的 workflowParallelGroups（從 registry.js workflows 推導）
const workflowParallelGroups = {
  single:         [],
  quick:          ['quality'],
  standard:       ['quality'],
  full:           ['quality', 'verify'],
  secure:         ['secure-quality'],
  tdd:            [],
  debug:          [],
  refactor:       ['quality'],
  'review-only':  [],
  'security-only':[],
  'build-fix':    [],
  'e2e-only':     [],
  diagnose:       [],
  clean:          [],
  'db-review':    [],
};

// ──────────────────────────────────────────────
// Feature 1: buildPipelineSegments() 純函式
// ──────────────────────────────────────────────

describe('buildPipelineSegments()', () => {

  describe('Scenario 1-1: 空 stages 回傳空陣列', () => {
    test('空 stages 物件回傳 []', () => {
      const result = buildPipelineSegments({}, 'single', parallelGroupDefs, workflowParallelGroups);
      expect(result).toEqual([]);
    });
  });

  describe('Scenario 1-2: 線性序列（無並行群組）回傳全部 stage 型 segment', () => {
    const stages = { DEV: { status: 'pending' } };

    test('回傳長度為 1 的陣列', () => {
      const result = buildPipelineSegments(stages, 'single', parallelGroupDefs, workflowParallelGroups);
      expect(result).toHaveLength(1);
    });

    test('第一個元素 type 為 stage', () => {
      const result = buildPipelineSegments(stages, 'single', parallelGroupDefs, workflowParallelGroups);
      expect(result[0].type).toBe('stage');
    });

    test('第一個元素 key 為 DEV', () => {
      const result = buildPipelineSegments(stages, 'single', parallelGroupDefs, workflowParallelGroups);
      expect(result[0].key).toBe('DEV');
    });

    test('第一個元素 stage 等於 stages[DEV]', () => {
      const result = buildPipelineSegments(stages, 'single', parallelGroupDefs, workflowParallelGroups);
      expect(result[0].stage).toBe(stages['DEV']);
    });
  });

  describe('Scenario 1-3: standard workflow 含並行群組，REVIEW 和 TEST:2 被合併', () => {
    // standard: PLAN ARCH TEST DEV REVIEW TEST:2 RETRO DOCS
    // 注意 JS 物件的 key 順序（V8 對非數字字串 key 保持插入順序）
    const stages = {
      PLAN:    { status: 'pending' },
      ARCH:    { status: 'pending' },
      TEST:    { status: 'pending' },
      DEV:     { status: 'pending' },
      REVIEW:  { status: 'pending' },
      'TEST:2':{ status: 'pending' },
      RETRO:   { status: 'pending' },
      DOCS:    { status: 'pending' },
    };

    let result;
    beforeAll(() => {
      result = buildPipelineSegments(stages, 'standard', parallelGroupDefs, workflowParallelGroups);
    });

    test('回傳長度為 7 的陣列', () => {
      expect(result).toHaveLength(7);
    });

    test('前 4 個 segment type 均為 stage', () => {
      expect(result[0].type).toBe('stage');
      expect(result[1].type).toBe('stage');
      expect(result[2].type).toBe('stage');
      expect(result[3].type).toBe('stage');
    });

    test('前 4 個 segment key 依序為 PLAN、ARCH、TEST、DEV', () => {
      expect(result[0].key).toBe('PLAN');
      expect(result[1].key).toBe('ARCH');
      expect(result[2].key).toBe('TEST');
      expect(result[3].key).toBe('DEV');
    });

    test('第 5 個 segment type 為 parallel，groupName 為 quality', () => {
      expect(result[4].type).toBe('parallel');
      expect(result[4].groupName).toBe('quality');
    });

    test('第 5 個 segment stages 陣列長度為 2，key 依序為 REVIEW、TEST:2', () => {
      expect(result[4].stages).toHaveLength(2);
      expect(result[4].stages[0].key).toBe('REVIEW');
      expect(result[4].stages[1].key).toBe('TEST:2');
    });

    test('第 6、7 個 segment type 為 stage，key 依序為 RETRO、DOCS', () => {
      expect(result[5].type).toBe('stage');
      expect(result[5].key).toBe('RETRO');
      expect(result[6].type).toBe('stage');
      expect(result[6].key).toBe('DOCS');
    });
  });

  describe('Scenario 1-4: DEV 前的 TEST 不被納入 quality 並行群組', () => {
    const stages = {
      PLAN:    { status: 'pending' },
      ARCH:    { status: 'pending' },
      TEST:    { status: 'pending' },
      DEV:     { status: 'pending' },
      REVIEW:  { status: 'pending' },
      'TEST:2':{ status: 'pending' },
      RETRO:   { status: 'pending' },
      DOCS:    { status: 'pending' },
    };

    let result;
    beforeAll(() => {
      result = buildPipelineSegments(stages, 'standard', parallelGroupDefs, workflowParallelGroups);
    });

    test('DEV 前的 TEST segment type 為 stage（非 parallel）', () => {
      const testSegment = result.find(s => s.type === 'stage' && s.key === 'TEST');
      expect(testSegment).toBeDefined();
      expect(testSegment.type).toBe('stage');
    });

    test('DEV 後的 TEST:2 被納入 type 為 parallel 的 segment', () => {
      const parallelSeg = result.find(s => s.type === 'parallel' && s.groupName === 'quality');
      expect(parallelSeg).toBeDefined();
      const keys = parallelSeg.stages.map(s => s.key);
      expect(keys).toContain('TEST:2');
    });
  });

  describe('Scenario 1-5: full workflow 含多個並行群組', () => {
    const stages = {
      PLAN:    { status: 'pending' },
      ARCH:    { status: 'pending' },
      DESIGN:  { status: 'pending' },
      TEST:    { status: 'pending' },
      DEV:     { status: 'pending' },
      REVIEW:  { status: 'pending' },
      'TEST:2':{ status: 'pending' },
      QA:      { status: 'pending' },
      E2E:     { status: 'pending' },
      RETRO:   { status: 'pending' },
      DOCS:    { status: 'pending' },
    };

    let result;
    beforeAll(() => {
      result = buildPipelineSegments(stages, 'full', parallelGroupDefs, workflowParallelGroups);
    });

    test('存在 type 為 parallel、groupName 為 quality 的 segment，包含 REVIEW 和 TEST:2', () => {
      const seg = result.find(s => s.type === 'parallel' && s.groupName === 'quality');
      expect(seg).toBeDefined();
      const keys = seg.stages.map(s => s.key);
      expect(keys).toContain('REVIEW');
      expect(keys).toContain('TEST:2');
    });

    test('存在 type 為 parallel、groupName 為 verify 的 segment，包含 QA 和 E2E', () => {
      const seg = result.find(s => s.type === 'parallel' && s.groupName === 'verify');
      expect(seg).toBeDefined();
      const keys = seg.stages.map(s => s.key);
      expect(keys).toContain('QA');
      expect(keys).toContain('E2E');
    });
  });

  describe('Scenario 1-6: 未知 workflow type 回傳全部 stage 型 segment', () => {
    const stages = {
      DEV:    { status: 'pending' },
      REVIEW: { status: 'pending' },
    };

    let result;
    beforeAll(() => {
      result = buildPipelineSegments(stages, 'unknown-workflow', parallelGroupDefs, workflowParallelGroups);
    });

    test('回傳長度為 2 的陣列', () => {
      expect(result).toHaveLength(2);
    });

    test('兩個 segment 的 type 均為 stage', () => {
      expect(result[0].type).toBe('stage');
      expect(result[1].type).toBe('stage');
    });
  });

  describe('Scenario 1-7: stage key 含冒號後綴以 baseName 比對群組成員', () => {
    const stages = {
      DEV:     { status: 'pending' },
      REVIEW:  { status: 'pending' },
      'TEST:2':{ status: 'pending' },
    };

    let result;
    beforeAll(() => {
      result = buildPipelineSegments(stages, 'standard', parallelGroupDefs, workflowParallelGroups);
    });

    test('TEST:2 的 baseName TEST 命中 quality 群組', () => {
      const seg = result.find(s => s.type === 'parallel' && s.groupName === 'quality');
      expect(seg).toBeDefined();
    });

    test('TEST:2 被歸入 type 為 parallel 的 segment', () => {
      const seg = result.find(s => s.type === 'parallel' && s.groupName === 'quality');
      const keys = seg.stages.map(s => s.key);
      expect(keys).toContain('TEST:2');
    });
  });
});

// ──────────────────────────────────────────────
// getStageClass() 輔助函式
// ──────────────────────────────────────────────

describe('getStageClass()', () => {
  test('status 為 running 時回傳 active', () => {
    expect(getStageClass('DEV', { DEV: { status: 'running' } })).toBe('active');
  });

  test('status 為 active 時回傳 active', () => {
    expect(getStageClass('DEV', { DEV: { status: 'active' } })).toBe('active');
  });

  test('status 為 completed 時回傳 completed', () => {
    expect(getStageClass('DEV', { DEV: { status: 'completed' } })).toBe('completed');
  });

  test('status 為 done 時回傳 completed', () => {
    expect(getStageClass('DEV', { DEV: { status: 'done' } })).toBe('completed');
  });

  test('status 為 failed 時回傳 failed', () => {
    expect(getStageClass('DEV', { DEV: { status: 'failed' } })).toBe('failed');
  });

  test('status 為 error 時回傳 failed', () => {
    expect(getStageClass('DEV', { DEV: { status: 'error' } })).toBe('failed');
  });

  test('status 為 pending 時回傳 pending', () => {
    expect(getStageClass('DEV', { DEV: { status: 'pending' } })).toBe('pending');
  });

  test('stages 為 null 時回傳 pending', () => {
    expect(getStageClass('DEV', null)).toBe('pending');
  });

  test('stage key 不存在時回傳 pending', () => {
    expect(getStageClass('UNKNOWN', { DEV: { status: 'completed' } })).toBe('pending');
  });
});

// ──────────────────────────────────────────────
// getStageIcon() 輔助函式
// ──────────────────────────────────────────────

describe('getStageIcon()', () => {
  test('status 為 running 時回傳 ⚡', () => {
    expect(getStageIcon('running')).toBe('⚡');
  });

  test('status 為 active 時回傳 ⚡', () => {
    expect(getStageIcon('active')).toBe('⚡');
  });

  test('status 為 completed 時回傳 ✅', () => {
    expect(getStageIcon('completed')).toBe('✅');
  });

  test('status 為 done 時回傳 ✅', () => {
    expect(getStageIcon('done')).toBe('✅');
  });

  test('status 為 failed 時回傳 ❌', () => {
    expect(getStageIcon('failed')).toBe('❌');
  });

  test('status 為 error 時回傳 ❌', () => {
    expect(getStageIcon('error')).toBe('❌');
  });

  test('status 為 pending 時回傳 ⏳', () => {
    expect(getStageIcon('pending')).toBe('⏳');
  });

  test('未知 status 時回傳 ⏳', () => {
    expect(getStageIcon('unknown')).toBe('⏳');
  });
});
