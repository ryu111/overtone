'use strict';
/**
 * queue-cli-enhancement.test.js — queue.js 新增子命令整合測試
 *
 * 覆蓋：
 *   insert, remove, move, info, retry 五個子命令的 CLI 行為
 */

const { test, expect, describe, beforeEach, afterAll } = require('bun:test');
const path = require('path');
const { rmSync } = require('fs');
const { homedir } = require('os');
const { SCRIPTS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

const QUEUE_SCRIPT = path.join(SCRIPTS_DIR, 'queue.js');
const executionQueue = require(path.join(SCRIPTS_LIB, 'execution-queue'));
const paths = require(path.join(SCRIPTS_LIB, 'paths'));
const { atomicWrite } = require(path.join(SCRIPTS_LIB, 'utils'));

const TIMESTAMP = Date.now();
const TEST_PROJECT = path.join(homedir(), '.overtone', 'test-qcli-enh-' + TIMESTAMP);
const NO_QUEUE_PROJECT = path.join(homedir(), '.overtone', 'test-qcli-noq-' + TIMESTAMP);

afterAll(() => {
  rmSync(paths.global.dir(TEST_PROJECT), { recursive: true, force: true });
});

// ── 輔助函式 ──

function runQueue(args = []) {
  const proc = Bun.spawnSync(['bun', QUEUE_SCRIPT, ...args, '--project-root', TEST_PROJECT], {
    cwd: path.join(SCRIPTS_DIR, '..'),
    env: { ...process.env, OVERTONE_NO_DASHBOARD: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : '',
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : '',
    output: (proc.stdout ? new TextDecoder().decode(proc.stdout) : '') +
            (proc.stderr ? new TextDecoder().decode(proc.stderr) : ''),
  };
}

function runQueueNoProject(args = []) {
  const proc = Bun.spawnSync(['bun', QUEUE_SCRIPT, ...args, '--project-root', NO_QUEUE_PROJECT], {
    cwd: path.join(SCRIPTS_DIR, '..'),
    env: { ...process.env, OVERTONE_NO_DASHBOARD: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : '',
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : '',
    output: (proc.stdout ? new TextDecoder().decode(proc.stdout) : '') +
            (proc.stderr ? new TextDecoder().decode(proc.stderr) : ''),
  };
}

function makeQueue(items) {
  executionQueue.writeQueue(TEST_PROJECT, items.map(i => ({ name: i.name, workflow: i.workflow || 'standard' })), 'test');
  const queue = executionQueue.readQueue(TEST_PROJECT);
  for (let i = 0; i < items.length; i++) {
    if (items[i].status && items[i].status !== 'pending') {
      queue.items[i].status = items[i].status;
      if (items[i].failedAt) queue.items[i].failedAt = items[i].failedAt;
      if (items[i].failReason) queue.items[i].failReason = items[i].failReason;
    }
  }
  const filePath = path.join(paths.global.dir(TEST_PROJECT), 'execution-queue.json');
  atomicWrite(filePath, queue);
  return queue;
}

function names() {
  return executionQueue.readQueue(TEST_PROJECT).items.map(i => i.name);
}

// ════════════════════════════════════════════════════════════════════════════
// insert
// ════════════════════════════════════════════════════════════════════════════

describe('insert --before 成功執行', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }]);
    result = runQueue(['insert', 'task-new', 'standard', '--before', 'task-b']);
  });

  test('exit code 為 0', () => {
    expect(result.exitCode).toBe(0);
  });

  test('stdout 包含成功訊息', () => {
    expect(result.stdout).toContain('task-new');
  });

  test('佇列順序為 [task-a, task-new, task-b]', () => {
    expect(names()).toEqual(['task-a', 'task-new', 'task-b']);
  });
});

describe('insert --after 成功執行', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }]);
    result = runQueue(['insert', 'task-new', 'standard', '--after', 'task-a']);
  });

  test('exit code 為 0', () => {
    expect(result.exitCode).toBe(0);
  });

  test('佇列順序為 [task-a, task-new, task-b]', () => {
    expect(names()).toEqual(['task-a', 'task-new', 'task-b']);
  });
});

describe('insert --before 和 --after 同時指定', () => {
  let result;

  beforeEach(() => {
    result = runQueue(['insert', 'task-new', 'standard', '--before', 'task-a', '--after', 'task-b']);
  });

  test('exit code 為 1', () => {
    expect(result.exitCode).toBe(1);
  });

  test('輸出包含錯誤說明', () => {
    expect(result.output).toContain('互斥');
  });
});

describe('insert 未指定 --before 或 --after', () => {
  let result;

  beforeEach(() => {
    result = runQueue(['insert', 'task-new', 'standard']);
  });

  test('exit code 為 1', () => {
    expect(result.exitCode).toBe(1);
  });
});

describe('insert anchor 不存在', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a' }]);
    result = runQueue(['insert', 'task-new', 'standard', '--before', 'task-nonexistent']);
  });

  test('exit code 為 1', () => {
    expect(result.exitCode).toBe(1);
  });

  test('輸出包含「找不到定位項目」', () => {
    expect(result.stdout).toContain('找不到定位項目');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// remove
// ════════════════════════════════════════════════════════════════════════════

describe('remove 成功刪除 pending 項目', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }]);
    result = runQueue(['remove', 'task-a']);
  });

  test('exit code 為 0', () => {
    expect(result.exitCode).toBe(0);
  });

  test('佇列剩餘 [task-b]', () => {
    expect(names()).toEqual(['task-b']);
  });
});

describe('remove 嘗試刪除 completed 項目', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a', status: 'completed' }]);
    result = runQueue(['remove', 'task-a']);
  });

  test('exit code 為 1', () => {
    expect(result.exitCode).toBe(1);
  });

  test('輸出包含「無法操作 completed 狀態」', () => {
    expect(result.stdout).toContain('無法操作 completed 狀態');
  });
});

describe('remove 項目不存在', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a' }]);
    result = runQueue(['remove', 'task-nonexistent']);
  });

  test('exit code 為 1', () => {
    expect(result.exitCode).toBe(1);
  });

  test('輸出包含「找不到項目」', () => {
    expect(result.stdout).toContain('找不到項目');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// move
// ════════════════════════════════════════════════════════════════════════════

describe('move --before 成功執行', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }, { name: 'task-c' }]);
    result = runQueue(['move', 'task-c', '--before', 'task-a']);
  });

  test('exit code 為 0', () => {
    expect(result.exitCode).toBe(0);
  });

  test('佇列順序為 [task-c, task-a, task-b]', () => {
    expect(names()).toEqual(['task-c', 'task-a', 'task-b']);
  });
});

describe('move --after 成功執行', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }, { name: 'task-c' }]);
    result = runQueue(['move', 'task-a', '--after', 'task-c']);
  });

  test('exit code 為 0', () => {
    expect(result.exitCode).toBe(0);
  });

  test('佇列順序為 [task-b, task-c, task-a]', () => {
    expect(names()).toEqual(['task-b', 'task-c', 'task-a']);
  });
});

describe('move 嘗試移動 in_progress 項目', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a', status: 'in_progress' }, { name: 'task-b' }]);
    result = runQueue(['move', 'task-a', '--before', 'task-b']);
  });

  test('exit code 為 1', () => {
    expect(result.exitCode).toBe(1);
  });

  test('輸出包含「無法操作 in_progress 狀態」', () => {
    expect(result.stdout).toContain('無法操作 in_progress 狀態');
  });
});

describe('move 自我 anchor', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a' }]);
    result = runQueue(['move', 'task-a', '--before', 'task-a']);
  });

  test('exit code 為 1', () => {
    expect(result.exitCode).toBe(1);
  });

  test('輸出包含「來源和定位項目不可相同」', () => {
    expect(result.stdout).toContain('來源和定位項目不可相同');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// info
// ════════════════════════════════════════════════════════════════════════════

describe('info 成功顯示項目完整資訊', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a', status: 'failed', failedAt: '2026-01-01T00:00:00.000Z', failReason: 'timeout' }]);
    result = runQueue(['info', 'task-a']);
  });

  test('exit code 為 0', () => {
    expect(result.exitCode).toBe(0);
  });

  test('輸出包含 name、status、failReason', () => {
    expect(result.stdout).toContain('task-a');
    expect(result.stdout).toContain('failed');
    expect(result.stdout).toContain('timeout');
  });
});

describe('info 項目不存在', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a' }]);
    result = runQueue(['info', 'task-nonexistent']);
  });

  test('exit code 為 1', () => {
    expect(result.exitCode).toBe(1);
  });

  test('輸出包含「找不到項目」', () => {
    expect(result.stdout).toContain('找不到項目');
  });
});

describe('info 佇列不存在', () => {
  let result;

  beforeEach(() => {
    result = runQueueNoProject(['info', 'task-a']);
  });

  test('exit code 為 1', () => {
    expect(result.exitCode).toBe(1);
  });

  test('輸出包含「佇列不存在」', () => {
    expect(result.stdout).toContain('佇列不存在');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// retry
// ════════════════════════════════════════════════════════════════════════════

describe('retry 成功將 failed 項目重設為 pending', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a', status: 'failed' }]);
    result = runQueue(['retry', 'task-a']);
  });

  test('exit code 為 0', () => {
    expect(result.exitCode).toBe(0);
  });

  test('項目 status 變為 pending', () => {
    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('pending');
  });
});

describe('retry 有 in_progress 項目時輸出 IN_PROGRESS_CONFLICT 訊息', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a', status: 'in_progress' }, { name: 'task-b', status: 'failed' }]);
    result = runQueue(['retry', 'task-b']);
  });

  test('exit code 為 1', () => {
    expect(result.exitCode).toBe(1);
  });

  test('輸出包含「目前有項目正在執行中」', () => {
    expect(result.stdout).toContain('目前有項目正在執行中');
  });
});

describe('retry 非 failed 項目輸出 INVALID_STATUS 訊息', () => {
  let result;

  beforeEach(() => {
    makeQueue([{ name: 'task-a', status: 'completed' }]);
    result = runQueue(['retry', 'task-a']);
  });

  test('exit code 為 1', () => {
    expect(result.exitCode).toBe(1);
  });

  test('輸出包含「無法操作 completed 狀態」', () => {
    expect(result.stdout).toContain('無法操作 completed 狀態');
  });
});
