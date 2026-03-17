// notion-tasks.test.js — Notion 任務佇列純函式測試
import { describe, test, expect } from 'bun:test';
import { parsePage, priorityOrder, buildRoadmapUpdates, applyRoadmapUpdates, buildToDoBlocks, createTask, listTasks, normalizeTaskName, isDuplicateTask, readSessionSummaries } from '/Users/sbu/.claude/scripts/notion-tasks.js';

// ─── 1. parsePage ────────────────────────────────────────────────────────────

describe('parsePage', () => {
  test('完整 page 解析所有欄位', () => {
    const page = {
      id: 'abc-123',
      properties: {
        Name: { title: [{ plain_text: 'R2.2 Skill Forge' }] },
        Status: { select: { name: '待做' } },
        Type: { select: { name: '功能' } },
        Created: { date: { start: '2026-03-17' } },
        Completed: { date: { start: '2026-03-18' } },
      },
    };

    const result = parsePage(page);
    expect(result.id).toBe('abc-123');
    expect(result.name).toBe('R2.2 Skill Forge');
    expect(result.status).toBe('待做');
    expect(result.type).toBe('功能');
    expect(result.created).toBe('2026-03-17');
    expect(result.completed).toBe('2026-03-18');
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
        Type: { select: null },
        Created: { date: null },
        Completed: { date: null },
      },
    };

    const result = parsePage(page);
    expect(result.name).toBe('');
    expect(result.status).toBe('');
    expect(result.type).toBe('');
    expect(result.created).toBeNull();
    expect(result.completed).toBeNull();
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

// ─── 3b. buildToDoBlocks ─────────────────────────────────────────────────────

describe('buildToDoBlocks', () => {
  test('空陣列回傳空陣列', () => {
    expect(buildToDoBlocks([])).toEqual([]);
  });

  test('單一子任務產生正確 to_do block', () => {
    const blocks = buildToDoBlocks(['完成 A 功能']);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('to_do');
    expect(blocks[0].to_do.checked).toBe(false);
    expect(blocks[0].to_do.rich_text[0].text.content).toBe('完成 A 功能');
  });

  test('多個子任務各產生一個 block', () => {
    const blocks = buildToDoBlocks(['任務一', '任務二', '任務三']);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].to_do.rich_text[0].text.content).toBe('任務一');
    expect(blocks[2].to_do.rich_text[0].text.content).toBe('任務三');
  });

  test('每個 block 都有 object: "block"', () => {
    const blocks = buildToDoBlocks(['A', 'B']);
    for (const b of blocks) {
      expect(b.object).toBe('block');
    }
  });

  test('checked 預設為 false', () => {
    const blocks = buildToDoBlocks(['X']);
    expect(blocks[0].to_do.checked).toBe(false);
  });

  test('rich_text 結構符合 Notion API 格式', () => {
    const blocks = buildToDoBlocks(['測試內容']);
    const rt = blocks[0].to_do.rich_text[0];
    expect(rt.type).toBe('text');
    expect(rt.text.content).toBe('測試內容');
  });
});

// ─── 3c. createTask 含 subtasks ──────────────────────────────────────────────

describe('createTask with subtasks', () => {
  function makeMockFetch(calls) {
    return async (path, method, body) => {
      calls.push({ path, method, body });
      // dedup 查詢回傳空結果
      if (path.includes('/query')) return { results: [] };
      // page 建立回傳假 page
      return { id: 'page-abc-123' };
    };
  }

  test('無 subtasks 時 children 只含 paragraph', async () => {
    const calls = [];
    await createTask('測試任務', { description: '描述文字' }, {
      notionFetch: makeMockFetch(calls),
      getConfig: () => ({ database_id: 'db-001' }),
    });
    const createCall = calls.find(c => c.method === 'POST' && c.path === '/pages');
    expect(createCall.body.children).toHaveLength(1);
    expect(createCall.body.children[0].type).toBe('paragraph');
  });

  test('有 subtasks 時 children = paragraph + to_do blocks', async () => {
    const calls = [];
    await createTask('任務含子任務', {
      description: '整體描述',
      subtasks: ['子任務一', '子任務二'],
    }, {
      notionFetch: makeMockFetch(calls),
      getConfig: () => ({ database_id: 'db-001' }),
    });
    const createCall = calls.find(c => c.method === 'POST' && c.path === '/pages');
    expect(createCall.body.children).toHaveLength(3);
    expect(createCall.body.children[0].type).toBe('paragraph');
    expect(createCall.body.children[1].type).toBe('to_do');
    expect(createCall.body.children[2].type).toBe('to_do');
  });

  test('無 description 但有 subtasks 時 children 只含 to_do blocks', async () => {
    const calls = [];
    await createTask('純 checkbox 任務', {
      subtasks: ['checkbox A', 'checkbox B'],
    }, {
      notionFetch: makeMockFetch(calls),
      getConfig: () => ({ database_id: 'db-001' }),
    });
    const createCall = calls.find(c => c.method === 'POST' && c.path === '/pages');
    expect(createCall.body.children).toHaveLength(2);
    expect(createCall.body.children[0].type).toBe('to_do');
    expect(createCall.body.children[0].to_do.rich_text[0].text.content).toBe('checkbox A');
  });

  test('subtasks to_do blocks 的 checked 都為 false', async () => {
    const calls = [];
    await createTask('任務', {
      subtasks: ['A', 'B', 'C'],
    }, {
      notionFetch: makeMockFetch(calls),
      getConfig: () => ({ database_id: 'db-001' }),
    });
    const createCall = calls.find(c => c.method === 'POST' && c.path === '/pages');
    const todoCalls = createCall.body.children.filter(b => b.type === 'to_do');
    for (const b of todoCalls) {
      expect(b.to_do.checked).toBe(false);
    }
  });

  test('無 description 無 subtasks 時 children 為空', async () => {
    const calls = [];
    await createTask('最小任務', {}, {
      notionFetch: makeMockFetch(calls),
      getConfig: () => ({ database_id: 'db-001' }),
    });
    const createCall = calls.find(c => c.method === 'POST' && c.path === '/pages');
    expect(createCall.body.children).toHaveLength(0);
  });
});

// ─── 3d. listTasks ──────────────────────────────────────────────────────────

describe('listTasks', () => {
  function makePage(id, name, status) {
    return {
      id,
      properties: {
        Name: { title: [{ plain_text: name }] },
        Status: { select: { name: status } },
        Type: { select: { name: '功能' } },
        Created: { date: { start: '2026-03-17' } },
        Completed: { date: null },
      },
    };
  }

  const mockDeps = (pages) => ({
    getConfig: () => ({ database_id: 'db-test' }),
    notionFetch: async (_path, _method, body) => ({ results: pages }),
  });

  test('單一狀態字串回傳 parsePage 結果', async () => {
    const pages = [makePage('id-1', '任務A', '待做')];
    const tasks = await listTasks('待做', mockDeps(pages));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('id-1');
    expect(tasks[0].name).toBe('任務A');
    expect(tasks[0].status).toBe('待做');
  });

  test('狀態陣列建構 or filter', async () => {
    let capturedBody;
    const deps = {
      getConfig: () => ({ database_id: 'db-test' }),
      notionFetch: async (_path, _method, body) => {
        capturedBody = body;
        return { results: [] };
      },
    };
    await listTasks(['待做', '進行中'], deps);
    expect(capturedBody.filter.or).toHaveLength(2);
    expect(capturedBody.filter.or[0].property).toBe('Status');
    expect(capturedBody.filter.or[1].property).toBe('Status');
  });

  test('空結果回傳空陣列', async () => {
    const tasks = await listTasks('待做', mockDeps([]));
    expect(tasks).toEqual([]);
  });

  test('預設狀態為「待做」', async () => {
    let capturedBody;
    const deps = {
      getConfig: () => ({ database_id: 'db-test' }),
      notionFetch: async (_path, _method, body) => {
        capturedBody = body;
        return { results: [] };
      },
    };
    await listTasks(undefined, deps);
    expect(capturedBody.filter.property).toBe('Status');
    expect(capturedBody.filter.select.equals).toBe('待做');
  });
});

// ─── 3e. normalizeTaskName ───────────────────────────────────────────────────

describe('normalizeTaskName', () => {
  test('移除 [自驅] 前綴', () => {
    expect(normalizeTaskName('[自驅] L4 heartbeat')).toBe('heartbeat');
  });

  test('移除 L{N} 前綴', () => {
    expect(normalizeTaskName('L3 gap-fixer 改善')).toBe('gap-fixer 改善');
  });

  test('同時移除 [自驅] 和 L{N}', () => {
    expect(normalizeTaskName('[自驅] L4 Notion 去重')).toBe('notion 去重');
  });

  test('轉小寫', () => {
    expect(normalizeTaskName('ABC DEF')).toBe('abc def');
  });

  test('空字串', () => {
    expect(normalizeTaskName('')).toBe('');
  });
});

// ─── 3f. isDuplicateTask ────────────────────────────────────────────────────

describe('isDuplicateTask', () => {
  test('完全相同 → 重複', () => {
    expect(isDuplicateTask('[自驅] L4 heartbeat', '[自驅] L4 heartbeat')).toBe(true);
  });

  test('一方含另一方 → 重複', () => {
    expect(isDuplicateTask('[自驅] L4 Notion 去重邏輯強化', 'L4 Notion 去重邏輯')).toBe(true);
  });

  test('完全不同 → 非重複', () => {
    expect(isDuplicateTask('[自驅] L4 heartbeat 改善', 'L3 gap-fixer 修復')).toBe(false);
  });

  test('長度 < 3 → 不判為重複', () => {
    expect(isDuplicateTask('ab', 'ab')).toBe(false);
  });

  test('前綴相同但任務不同 → 非重複', () => {
    expect(isDuplicateTask('[自驅] L4 heartbeat 計時器防重疊', '[自驅] L4 heartbeat 日誌截斷')).toBe(false);
  });
});

// ─── 3g. createTask dedup 本地比對 ──────────────────────────────────────────

describe('createTask dedup 強化', () => {
  test('Notion 回傳候選但名稱不同 → 不跳過', async () => {
    const calls = [];
    const result = await createTask('[自驅] L4 heartbeat 計時器防重疊', { description: '描述' }, {
      notionFetch: async (path, method, body) => {
        calls.push({ path, method });
        if (path.includes('/query')) {
          return { results: [{ id: 'other-id', properties: { Name: { title: [{ plain_text: 'L4 heartbeat 日誌截斷' }] } } }] };
        }
        return { id: 'new-page-id' };
      },
      getConfig: () => ({ database_id: 'db-001' }),
    });
    expect(result.skipped).toBeUndefined();
    expect(result.id).toBe('new-page-id');
  });

  test('Notion 回傳候選且名稱包含 → 跳過', async () => {
    const result = await createTask('[自驅] L4 Notion 去重邏輯', { description: '描述' }, {
      notionFetch: async (path) => {
        if (path.includes('/query')) {
          return { results: [{ id: 'dup-id', properties: { Name: { title: [{ plain_text: '[自驅] L4 Notion 去重邏輯強化' }] } } }] };
        }
        return { id: 'new-page-id' };
      },
      getConfig: () => ({ database_id: 'db-001' }),
    });
    expect(result.skipped).toBe(true);
  });
});

// ─── 3h. readSessionSummaries ───────────────────────────────────────────────

describe('readSessionSummaries', () => {
  test('檔案不存在回傳空陣列', () => {
    // readSessionSummaries 讀取固定路徑，若檔案不存在就回空
    const result = readSessionSummaries(5);
    expect(Array.isArray(result)).toBe(true);
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
