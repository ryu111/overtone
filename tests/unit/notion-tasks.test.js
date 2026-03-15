// notion-tasks.test.js — Notion 任務佇列純函式測試
import { describe, test, expect } from 'bun:test';
import { parsePage, priorityOrder, buildRoadmapUpdates, applyRoadmapUpdates } from '/Users/sbu/.claude/scripts/notion-tasks.js';

// ─── 1. parsePage ────────────────────────────────────────────────────────────

describe('parsePage', () => {
  test('完整 page 解析所有欄位', () => {
    const page = {
      id: 'abc-123',
      properties: {
        Name: { title: [{ plain_text: 'R2.2 Skill Forge' }] },
        Status: { select: { name: '待做' } },
        Priority: { select: { name: 'P1 重要' } },
        Type: { select: { name: '新建' } },
        Layer: { select: { name: 'L2 自我進化' } },
        Scope: { rich_text: [{ plain_text: 'R2.2' }] },
        Phase: { rich_text: [{ plain_text: 'Phase 1' }] },
      },
    };

    const result = parsePage(page);
    expect(result.id).toBe('abc-123');
    expect(result.name).toBe('R2.2 Skill Forge');
    expect(result.status).toBe('待做');
    expect(result.priority).toBe('P1 重要');
    expect(result.scope).toBe('R2.2');
    expect(result.phase).toBe('Phase 1');
  });

  test('空 properties 不 crash', () => {
    const page = { id: 'empty', properties: {} };
    const result = parsePage(page);
    expect(result.id).toBe('empty');
    expect(result.name).toBe('');
    expect(result.status).toBe('');
  });

  test('null select 回傳空字串', () => {
    const page = {
      id: 'null-select',
      properties: {
        Name: { title: [] },
        Status: { select: null },
        Priority: { select: null },
        Type: { select: null },
        Layer: { select: null },
        Scope: { rich_text: [] },
        Phase: { rich_text: [] },
      },
    };

    const result = parsePage(page);
    expect(result.name).toBe('');
    expect(result.status).toBe('');
    expect(result.priority).toBe('');
  });
});

// ─── 2. priorityOrder ───────────────────────────────────────────────────────

describe('priorityOrder', () => {
  test('P0 最高優先', () => expect(priorityOrder('P0 緊急')).toBe(0));
  test('P1 次高', () => expect(priorityOrder('P1 重要')).toBe(1));
  test('P2 一般', () => expect(priorityOrder('P2 一般')).toBe(2));
  test('P3 最低', () => expect(priorityOrder('P3 低優')).toBe(3));
  test('無 priority 排最後', () => expect(priorityOrder('—')).toBe(4));
  test('排序正確', () => {
    const items = ['P2 一般', 'P0 緊急', 'P3 低優', 'P1 重要'];
    const sorted = items.sort((a, b) => priorityOrder(a) - priorityOrder(b));
    expect(sorted).toEqual(['P0 緊急', 'P1 重要', 'P2 一般', 'P3 低優']);
  });
});

// ─── 3. buildRoadmapUpdates ─────────────────────────────────────────────────

describe('buildRoadmapUpdates', () => {
  test('有 scope 的 task 生成 update', () => {
    const tasks = [
      { scope: 'R1.1', status: '已完成' },
      { scope: 'R2.2', status: '待做' },
    ];
    const updates = buildRoadmapUpdates(tasks);
    expect(updates.length).toBe(2);
    expect(updates[0]).toEqual({ scope: 'R1.1', status: '已完成', emoji: '✅' });
    expect(updates[1]).toEqual({ scope: 'R2.2', status: '待做', emoji: '⬜' });
  });

  test('無 scope 的 task 被跳過', () => {
    const tasks = [
      { scope: '', status: '待做' },
      { scope: 'R1.1', status: '已完成' },
    ];
    const updates = buildRoadmapUpdates(tasks);
    expect(updates.length).toBe(1);
  });

  test('已歸檔 → 📦', () => {
    const tasks = [{ scope: 'R1.5', status: '已歸檔' }];
    const updates = buildRoadmapUpdates(tasks);
    expect(updates[0].emoji).toBe('📦');
  });

  test('進行中 → 🔄', () => {
    const tasks = [{ scope: 'R2.2', status: '進行中' }];
    const updates = buildRoadmapUpdates(tasks);
    expect(updates[0].emoji).toBe('🔄');
  });
});

// ─── 4. applyRoadmapUpdates ─────────────────────────────────────────────────

describe('applyRoadmapUpdates', () => {
  test('scope 匹配更新 emoji', () => {
    const roadmap = '| R1.1 Guards ⬜ | 描述 |';
    const updates = [{ scope: 'R1.1', status: '已完成', emoji: '✅' }];
    const { content, changed } = applyRoadmapUpdates(roadmap, updates);
    expect(changed).toBe(true);
    expect(content).toContain('R1.1 Guards ✅');
  });

  test('無匹配不改動', () => {
    const roadmap = '| R1.1 Guards ✅ | 描述 |';
    const updates = [{ scope: 'R9.9', status: '待做', emoji: '⬜' }];
    const { content, changed } = applyRoadmapUpdates(roadmap, updates);
    expect(changed).toBe(false);
    expect(content).toBe(roadmap);
  });

  test('Phase 表格匹配（"Phase 5" → "P5"）', () => {
    const roadmap = '| P5 | Notion SoT 遷移 | ⬜ |';
    const tasks = [{ phase: 'Phase 5', status: '已完成' }];
    const { content, changed } = applyRoadmapUpdates(roadmap, [], tasks);
    expect(changed).toBe(true);
    expect(content).toContain('| ✅ |');
  });

  test('Phase 無匹配不改動', () => {
    const roadmap = '| P5 | Notion SoT 遷移 | ✅ |';
    const tasks = [{ phase: 'Phase 99', status: '待做' }];
    const { content, changed } = applyRoadmapUpdates(roadmap, [], tasks);
    expect(changed).toBe(false);
  });

  test('同時更新 scope 和 Phase', () => {
    const roadmap = '| R1.1 Guards ⬜ |\n| P5 | 任務 | ⬜ |';
    const updates = [{ scope: 'R1.1', status: '已完成', emoji: '✅' }];
    const tasks = [{ phase: 'Phase 5', status: '已完成' }];
    const { content, changed } = applyRoadmapUpdates(roadmap, updates, tasks);
    expect(changed).toBe(true);
    expect(content).toContain('R1.1 Guards ✅');
    expect(content).toContain('| ✅ |');
  });
});
