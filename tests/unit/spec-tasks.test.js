// spec-tasks.test.js — 本地任務管理模組單元測試
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// 動態 import（spec-tasks.js 在 ~/.claude/scripts/）
const {
  createTask,
  listTasks,
  claimTask,
  completeTask,
  resetTask,
  generateIndex,
  findTask,
} = await import(join(homedir(), '.claude/scripts/spec-tasks.js'));

// ─── 測試輔助 ────────────────────────────────────────────────────────────────

let TEMP_SPEC_DIR;

function freshSpecDir() {
  const dir = join(tmpdir(), `spec-tasks-test-${randomUUID()}`);
  mkdirSync(join(dir, '待做'), { recursive: true });
  mkdirSync(join(dir, '進行中'), { recursive: true });
  mkdirSync(join(dir, '完成'), { recursive: true });
  return dir;
}

function readTaskJson(path) {
  const file = join(path, 'task.json');
  return JSON.parse(readFileSync(file, 'utf-8'));
}

beforeEach(() => {
  TEMP_SPEC_DIR = freshSpecDir();
});

afterEach(() => {
  if (TEMP_SPEC_DIR && existsSync(TEMP_SPEC_DIR)) {
    rmSync(TEMP_SPEC_DIR, { recursive: true, force: true });
  }
});

// ─── createTask ──────────────────────────────────────────────────────────────

describe('createTask', () => {
  test('建立任務並回傳 name 和 path', () => {
    const result = createTask('capability-probe 修復', '修復', 'Phase 3c 累計 42 次 timeout', {}, TEMP_SPEC_DIR);
    expect(result.name).toBeDefined();
    expect(result.path).toBeDefined();
    expect(existsSync(result.path)).toBe(true);
  });

  test('task.json 包含正確欄位', () => {
    const result = createTask('新功能 A', '功能', '功能說明', { priority: 'P1', depth: 'D2' }, TEMP_SPEC_DIR);
    const data = readTaskJson(result.path);
    expect(data.name).toBe('新功能 A');
    expect(data.type).toBe('功能');
    expect(data.description).toBe('功能說明');
    expect(data.priority).toBe('P1');
    expect(data.depth).toBe('D2');
    expect(data.claimed).toBeNull();
    expect(data.completed).toBeNull();
    expect(data.result).toBeNull();
    expect(data.created).toBeDefined();
  });

  test('資料夾命名格式：{depth}-{title}-{yyyyMMdd}', () => {
    const result = createTask('my-feature', '功能', '', { depth: 'D1' }, TEMP_SPEC_DIR);
    expect(result.name).toMatch(/^D1-my-feature-\d{8}$/);
  });

  test('任務預設放在 spec/待做/ 目錄', () => {
    const result = createTask('測試任務', '測試', '', {}, TEMP_SPEC_DIR);
    expect(result.path).toContain(`${TEMP_SPEC_DIR}/待做`);
  });

  test('無效 type 使用 "功能" 作為預設', () => {
    const result = createTask('任務', '不存在類型', '', {}, TEMP_SPEC_DIR);
    const data = readTaskJson(result.path);
    expect(data.type).toBe('功能');
  });

  test('opts.subtasks 存入 task.json', () => {
    const result = createTask('任務含子任務', '功能', '', { subtasks: ['子任務一', '子任務二'] }, TEMP_SPEC_DIR);
    const data = readTaskJson(result.path);
    expect(data.subtasks).toEqual(['子任務一', '子任務二']);
  });

  test('標題含空格時用連字號取代', () => {
    const result = createTask('capability probe 修復', '修復', '', { depth: 'D1' }, TEMP_SPEC_DIR);
    expect(result.name).toContain('capability-probe-修復');
  });
});

// ─── listTasks ───────────────────────────────────────────────────────────────

describe('listTasks', () => {
  test('空目錄回傳空陣列', () => {
    const tasks = listTasks('待做', TEMP_SPEC_DIR);
    expect(tasks).toEqual([]);
  });

  test('建立後可列出', () => {
    createTask('任務 A', '功能', '說明 A', {}, TEMP_SPEC_DIR);
    createTask('任務 B', '修復', '說明 B', {}, TEMP_SPEC_DIR);
    const tasks = listTasks('待做', TEMP_SPEC_DIR);
    expect(tasks.length).toBe(2);
  });

  test('回傳正確欄位', () => {
    createTask('任務 C', '重構', '說明 C', { priority: 'P0' }, TEMP_SPEC_DIR);
    const tasks = listTasks('待做', TEMP_SPEC_DIR);
    const task = tasks[0];
    expect(task.name).toBe('任務 C');
    expect(task.type).toBe('重構');
    expect(task.priority).toBe('P0');
    expect(task.description).toBe('說明 C');
    expect(task.created).toBeDefined();
    expect(task.path).toBeDefined();
  });

  test('進行中和完成目錄獨立', () => {
    createTask('待做任務', '功能', '', {}, TEMP_SPEC_DIR);
    const inProgress = listTasks('進行中', TEMP_SPEC_DIR);
    expect(inProgress).toEqual([]);
  });
});

// ─── findTask ────────────────────────────────────────────────────────────────

describe('findTask', () => {
  test('部分名稱模糊匹配', () => {
    createTask('capability-probe 修復', '修復', '', { depth: 'D1' }, TEMP_SPEC_DIR);
    const result = findTask('probe', '待做', TEMP_SPEC_DIR);
    expect(result).not.toBeNull();
    expect(result.data.name).toBe('capability-probe 修復');
  });

  test('找不到時回傳 null', () => {
    const result = findTask('不存在的任務', '待做', TEMP_SPEC_DIR);
    expect(result).toBeNull();
  });

  test('不指定 status 時搜尋所有目錄', () => {
    createTask('進行中任務', '功能', '', {}, TEMP_SPEC_DIR);
    claimTask('進行中任務', TEMP_SPEC_DIR);
    const result = findTask('進行中任務', null, TEMP_SPEC_DIR);
    expect(result).not.toBeNull();
    expect(result.status).toBe('進行中');
  });

  test('不區分大小寫匹配', () => {
    createTask('CapabilityProbe', '功能', '', {}, TEMP_SPEC_DIR);
    const result = findTask('capabilityprobe', '待做', TEMP_SPEC_DIR);
    expect(result).not.toBeNull();
  });
});

// ─── claimTask ───────────────────────────────────────────────────────────────

describe('claimTask', () => {
  test('將任務從待做移到進行中', () => {
    createTask('probe 修復', '修復', '', { depth: 'D1' }, TEMP_SPEC_DIR);
    const result = claimTask('probe', TEMP_SPEC_DIR);
    expect(result.success).toBe(true);
    expect(result.path).toContain('進行中');
    expect(existsSync(result.path)).toBe(true);
  });

  test('更新 task.json 的 claimed 時間', () => {
    createTask('probe 任務', '修復', '', {}, TEMP_SPEC_DIR);
    const result = claimTask('probe', TEMP_SPEC_DIR);
    const data = readTaskJson(result.path);
    expect(data.claimed).not.toBeNull();
    expect(new Date(data.claimed).getTime()).toBeGreaterThan(0);
  });

  test('找不到任務時回傳 success: false', () => {
    const result = claimTask('不存在任務', TEMP_SPEC_DIR);
    expect(result.success).toBe(false);
    expect(result.message).toContain('找不到');
  });

  test('認領後待做目錄不再有該任務', () => {
    createTask('移除測試任務', '雜務', '', {}, TEMP_SPEC_DIR);
    claimTask('移除測試任務', TEMP_SPEC_DIR);
    const todo = listTasks('待做', TEMP_SPEC_DIR);
    expect(todo.find(t => t.name === '移除測試任務')).toBeUndefined();
  });
});

// ─── completeTask ────────────────────────────────────────────────────────────

describe('completeTask', () => {
  test('將任務從進行中移到完成', () => {
    createTask('完成測試任務', '功能', '', {}, TEMP_SPEC_DIR);
    claimTask('完成測試任務', TEMP_SPEC_DIR);
    const result = completeTask('完成測試任務', '實作完成，測試全過', TEMP_SPEC_DIR);
    expect(result.success).toBe(true);
    expect(result.path).toContain('完成');
    expect(existsSync(result.path)).toBe(true);
  });

  test('更新 task.json 的 completed 和 result', () => {
    createTask('result 測試', '功能', '', {}, TEMP_SPEC_DIR);
    claimTask('result 測試', TEMP_SPEC_DIR);
    const result = completeTask('result 測試', '順利完成', TEMP_SPEC_DIR);
    const data = readTaskJson(result.path);
    expect(data.completed).not.toBeNull();
    expect(data.result).toBe('順利完成');
  });

  test('找不到進行中任務時回傳 success: false', () => {
    createTask('待做任務', '功能', '', {}, TEMP_SPEC_DIR);
    // 還在待做，未認領
    const result = completeTask('待做任務', '完成', TEMP_SPEC_DIR);
    expect(result.success).toBe(false);
  });
});

// ─── resetTask ───────────────────────────────────────────────────────────────

describe('resetTask', () => {
  test('將任務從進行中移回待做', () => {
    createTask('重置任務', '功能', '', {}, TEMP_SPEC_DIR);
    claimTask('重置任務', TEMP_SPEC_DIR);
    const result = resetTask('重置任務', '需要重新設計', TEMP_SPEC_DIR);
    expect(result.success).toBe(true);
    expect(result.path).toContain('待做');
    expect(existsSync(result.path)).toBe(true);
  });

  test('更新 task.json 的 claimed 清除和 resetReason', () => {
    createTask('重置原因測試', '功能', '', {}, TEMP_SPEC_DIR);
    claimTask('重置原因測試', TEMP_SPEC_DIR);
    const result = resetTask('重置原因測試', '需要更多資訊', TEMP_SPEC_DIR);
    const data = readTaskJson(result.path);
    expect(data.claimed).toBeNull();
    expect(data.resetReason).toBe('需要更多資訊');
    expect(data.resetAt).toBeDefined();
  });

  test('找不到進行中任務時回傳 success: false', () => {
    const result = resetTask('不存在', '原因', TEMP_SPEC_DIR);
    expect(result.success).toBe(false);
  });
});

// ─── generateIndex ───────────────────────────────────────────────────────────

describe('generateIndex', () => {
  test('產生 index.md 在 specDir 根目錄', () => {
    const indexPath = generateIndex(TEMP_SPEC_DIR);
    expect(existsSync(indexPath)).toBe(true);
    expect(indexPath).toBe(join(TEMP_SPEC_DIR, 'index.md'));
  });

  test('空目錄產生合法 markdown', () => {
    const indexPath = generateIndex(TEMP_SPEC_DIR);
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('# 專案索引');
    expect(content).toContain('### 進行中');
    expect(content).toContain('### 待做');
    expect(content).toContain('### 最近完成');
  });

  test('index.md 包含待做任務', () => {
    createTask('index 測試任務', '功能', '說明', {}, TEMP_SPEC_DIR);
    const indexPath = generateIndex(TEMP_SPEC_DIR);
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('index 測試任務');
  });

  test('完成任務顯示在最近完成區塊', () => {
    createTask('已完成任務', '修復', '', {}, TEMP_SPEC_DIR);
    claimTask('已完成任務', TEMP_SPEC_DIR);
    completeTask('已完成任務', '修復完成', TEMP_SPEC_DIR);
    const indexPath = generateIndex(TEMP_SPEC_DIR);
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('已完成任務');
    expect(content).toContain('修復完成');
  });

  test('最近完成最多顯示 10 筆', () => {
    // 建立 12 筆完成任務
    for (let i = 0; i < 12; i++) {
      createTask(`任務${i}`, '雜務', '', {}, TEMP_SPEC_DIR);
      claimTask(`任務${i}`, TEMP_SPEC_DIR);
      completeTask(`任務${i}`, `結果${i}`, TEMP_SPEC_DIR);
    }
    const indexPath = generateIndex(TEMP_SPEC_DIR);
    const content = readFileSync(indexPath, 'utf-8');
    // 計算完成區塊中的資料行數（排除標頭和分隔線）
    const completedSection = content.split('## 最近完成')[1];
    const dataRows = completedSection.split('\n').filter(l => l.startsWith('| 任務'));
    // 表頭也是 "| 任務..." 開頭，所以減 1
    expect(dataRows.length - 1).toBeLessThanOrEqual(10);
  });
});

// ─── 完整流程整合 ─────────────────────────────────────────────────────────────

describe('完整工作流程', () => {
  test('建立 → 認領 → 完成的完整流程', () => {
    // 建立
    const created = createTask('端到端測試任務', '測試', '整合測試說明', { priority: 'P1', depth: 'D2' }, TEMP_SPEC_DIR);
    expect(existsSync(created.path)).toBe(true);

    // 認領
    const claimed = claimTask('端到端測試任務', TEMP_SPEC_DIR);
    expect(claimed.success).toBe(true);
    expect(claimed.path).toContain('進行中');

    // 完成
    const completed = completeTask('端到端測試任務', '所有測試通過', TEMP_SPEC_DIR);
    expect(completed.success).toBe(true);
    expect(completed.path).toContain('完成');

    // 驗證最終狀態
    const data = readTaskJson(completed.path);
    expect(data.claimed).not.toBeNull();
    expect(data.completed).not.toBeNull();
    expect(data.result).toBe('所有測試通過');

    // index 包含完成任務
    const indexPath = generateIndex(TEMP_SPEC_DIR);
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('端到端測試任務');
  });

  test('建立 → 認領 → 重置 → 再認領的流程', () => {
    createTask('重試任務', '修復', '', {}, TEMP_SPEC_DIR);
    claimTask('重試任務', TEMP_SPEC_DIR);

    const reset = resetTask('重試任務', '需要更多資訊', TEMP_SPEC_DIR);
    expect(reset.success).toBe(true);
    expect(reset.path).toContain('待做');

    // 再認領
    const reclaim = claimTask('重試任務', TEMP_SPEC_DIR);
    expect(reclaim.success).toBe(true);
    expect(reclaim.path).toContain('進行中');
  });
});
