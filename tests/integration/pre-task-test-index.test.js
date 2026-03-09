'use strict';
/**
 * pre-task-test-index.test.js — Feature 3 BDD 驗證
 *
 * 對應 BDD：specs/features/in-progress/test-quality-guard/bdd.md — Feature 3
 *
 * 驗證 pre-task.js 對 tester / developer 注入 test-index 摘要的行為，
 * 以及非目標 agent、識別失敗、tests/ 不存在等降級場景。
 */

const { describe, it, expect, afterAll } = require('bun:test');
const { mkdirSync, rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB, HOOKS_DIR } = require('../helpers/paths');
const { isAllowed } = require('../helpers/hook-runner');

// ── 路徑 ──

const HOOK_PATH = join(HOOKS_DIR, 'tool', 'pre-task.js');

const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));
const { workflows } = require(join(SCRIPTS_LIB, 'registry'));

// 真實專案根目錄（包含 tests/）
const PROJECT_ROOT = join(__dirname, '..', '..');

// ── 測試共用輔助 ──

/**
 * 執行 pre-task.js hook（非同步，使用 Bun.spawn）
 */
async function runHook(input, sessionId) {
  const env = { ...process.env, OVERTONE_NO_DASHBOARD: '1' };
  delete env.CLAUDE_SESSION_ID;
  if (sessionId !== undefined) {
    env.CLAUDE_SESSION_ID = sessionId;
  }

  const proc = Bun.spawn(['node', HOOK_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const output = await new Response(proc.stdout).text();
  await proc.exited;

  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

// ── Session 管理 ──

const SESSION_PREFIX = `test_pre_task_ti_${Date.now()}`;
let counter = 0;
const createdSessions = [];

function newSession() {
  const sid = `${SESSION_PREFIX}_${++counter}`;
  createdSessions.push(sid);
  mkdirSync(paths.sessionDir(sid), { recursive: true });
  return sid;
}

afterAll(() => {
  for (const sid of createdSessions) {
    rmSync(paths.sessionDir(sid), { recursive: true, force: true });
  }
});

/**
 * 初始化 quick workflow 並將前置 stages 設為 completed，
 * 讓目標 stage 可以通過前置檢查。
 *
 * quick workflow: DEV(0) → REVIEW(1) → RETRO(2) → DOCS(3)
 *
 * @param {string} sessionId
 * @param {string[]} completedStageKeys - 要設為 completed 的 stage key（如 ['DEV']）
 */
function initQuickWorkflow(sessionId, completedStageKeys = []) {
  state.initState(sessionId, 'quick', workflows['quick'].stages);
  if (completedStageKeys.length > 0) {
    state.updateStateAtomic(sessionId, (s) => {
      for (const key of completedStageKeys) {
        if (s.stages[key]) {
          s.stages[key].status = 'completed';
          s.stages[key].result = 'pass';
        }
      }
      return s;
    });
  }
}

// ── Feature 3：pre-task.js 注入行為 ──

// Scenario: tester agent 委派時注入 test-index 摘要
// tester → TEST stage，前置需要 DEV 和 REVIEW 完成
describe('Scenario: tester agent 委派時注入 test-index 摘要', () => {
  it('updatedInput.prompt 包含 [Test Index] 開頭的區塊', async () => {
    const sessionId = newSession();
    initQuickWorkflow(sessionId, ['DEV', 'REVIEW']);

    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        cwd: PROJECT_ROOT, // 真實 tests/ 目錄存在於此
        tool_input: {
          subagent_type: 'tester',
          description: '委派 tester agent',
          prompt: '執行 BDD 測試驗證',
        },
      },
      sessionId
    );

    // 應允許通過並注入
    expect(isAllowed(result)).toBe(true);
    const updatedPrompt = result?.hookSpecificOutput?.updatedInput?.prompt;
    expect(typeof updatedPrompt).toBe('string');
    expect(updatedPrompt).toContain('[Test Index]');
  });

  it('原始 prompt 仍保留在 updatedInput.prompt 中', async () => {
    const sessionId = newSession();
    initQuickWorkflow(sessionId, ['DEV', 'REVIEW']);

    const ORIGINAL_PROMPT = '這是原始 tester 任務指令';
    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        cwd: PROJECT_ROOT,
        tool_input: {
          subagent_type: 'tester',
          description: '委派 tester agent',
          prompt: ORIGINAL_PROMPT,
        },
      },
      sessionId
    );

    const updatedPrompt = result?.hookSpecificOutput?.updatedInput?.prompt;
    expect(typeof updatedPrompt).toBe('string');
    expect(updatedPrompt).toContain(ORIGINAL_PROMPT);
  });

  it('摘要位於 workflowContext 之後、原始 prompt 之前', async () => {
    const sessionId = newSession();
    initQuickWorkflow(sessionId, ['DEV', 'REVIEW']);

    const ORIGINAL_PROMPT = '原始測試任務內容';
    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        cwd: PROJECT_ROOT,
        tool_input: {
          subagent_type: 'tester',
          description: '委派 tester',
          prompt: ORIGINAL_PROMPT,
        },
      },
      sessionId
    );

    const updatedPrompt = result?.hookSpecificOutput?.updatedInput?.prompt;
    expect(typeof updatedPrompt).toBe('string');

    // 組裝順序：workflowContext → testIndex → originalPrompt
    // [Test Index] 必須出現在原始 prompt 之前
    const testIndexPos = updatedPrompt.indexOf('[Test Index]');
    const originalPromptPos = updatedPrompt.indexOf(ORIGINAL_PROMPT);
    expect(testIndexPos).toBeGreaterThan(-1);
    expect(originalPromptPos).toBeGreaterThan(-1);
    expect(testIndexPos).toBeLessThan(originalPromptPos);
  });
});

// Scenario: developer agent 委派時注入 test-index 摘要
// developer → DEV stage，single workflow 中是第一個 stage，不需要前置
describe('Scenario: developer agent 委派時注入 test-index 摘要', () => {
  it('updatedInput.prompt 包含 [Test Index] 開頭的區塊', async () => {
    const sessionId = newSession();
    state.initState(sessionId, 'single', workflows['single'].stages);

    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        cwd: PROJECT_ROOT,
        tool_input: {
          subagent_type: 'developer',
          description: '委派 developer agent',
          prompt: '實作新功能',
        },
      },
      sessionId
    );

    expect(isAllowed(result)).toBe(true);
    const updatedPrompt = result?.hookSpecificOutput?.updatedInput?.prompt;
    expect(typeof updatedPrompt).toBe('string');
    expect(updatedPrompt).toContain('[Test Index]');
  });
});

// Scenario: 非 tester/developer agent 不注入 test-index 摘要
describe('Scenario: 非 tester/developer agent 不注入 test-index 摘要', () => {
  it('planner agent 委派時不包含 [Test Index] 區塊', async () => {
    const sessionId = newSession();
    state.initState(sessionId, 'standard', workflows['standard'].stages);

    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        cwd: PROJECT_ROOT,
        tool_input: {
          subagent_type: 'planner',
          description: '委派 planner agent',
          prompt: '規劃功能',
        },
      },
      sessionId
    );

    // planner 是 standard 的第一個 stage，應允許通過
    expect(isAllowed(result)).toBe(true);

    // planner 不在 TEST_INDEX_AGENTS → 不注入 [Test Index]
    const updatedPrompt = result?.hookSpecificOutput?.updatedInput?.prompt;
    if (typeof updatedPrompt === 'string') {
      expect(updatedPrompt).not.toContain('[Test Index]');
    }
    // 若無 updatedInput（result 為 ''），也合規
  });

  it('code-reviewer agent 委派時不包含 [Test Index] 區塊', async () => {
    const sessionId = newSession();
    initQuickWorkflow(sessionId, ['DEV']);

    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        cwd: PROJECT_ROOT,
        tool_input: {
          subagent_type: 'code-reviewer',
          description: '委派 code-reviewer agent',
          prompt: '審查程式碼品質',
        },
      },
      sessionId
    );

    expect(isAllowed(result)).toBe(true);

    const updatedPrompt = result?.hookSpecificOutput?.updatedInput?.prompt;
    if (typeof updatedPrompt === 'string') {
      expect(updatedPrompt).not.toContain('[Test Index]');
    }
  });
});

// Scenario: 識別不到 targetAgent 時不注入 test-index 摘要
describe('Scenario: 識別不到 targetAgent 時不注入 test-index 摘要', () => {
  it('無法辨識 agent → hook 正常結束，結果為空字串', async () => {
    const sessionId = newSession();
    state.initState(sessionId, 'single', workflows['single'].stages);

    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        cwd: PROJECT_ROOT,
        tool_input: {
          // 無 subagent_type，prompt 也不含任何已知 agent 關鍵字
          prompt: '執行某不相關任務，沒有已知 agent 名稱 xyz-unknown-999',
        },
      },
      sessionId
    );

    // 不擋（hook 回傳空物件或僅含 hookSpecificOutput）
    // 不包含 [Test Index]
    const updatedPrompt = result?.hookSpecificOutput?.updatedInput?.prompt;
    if (typeof updatedPrompt === 'string') {
      expect(updatedPrompt).not.toContain('[Test Index]');
    }
  });
});

// Scenario: tests/ 目錄不存在時不注入（靜默降級）
describe('Scenario: tests/ 目錄不存在時靜默降級', () => {
  it('cwd 不含 tests/ → updatedInput.prompt 不包含 [Test Index] 區塊', async () => {
    const sessionId = newSession();
    initQuickWorkflow(sessionId, ['DEV', 'REVIEW']);

    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        cwd: '/nonexistent/path/that/does/not/exist', // tests/ 不存在
        tool_input: {
          subagent_type: 'tester',
          description: '委派 tester agent',
          prompt: '執行測試',
        },
      },
      sessionId
    );

    // hook 不拋例外
    expect(result).not.toBeNull();

    // [Test Index] 不出現（buildTestIndex 回傳 ''，跳過注入）
    const updatedPrompt = result?.hookSpecificOutput?.updatedInput?.prompt;
    if (typeof updatedPrompt === 'string') {
      expect(updatedPrompt).not.toContain('[Test Index]');
    }
  });

  it('其他功能（skip 阻擋機制）不受影響', async () => {
    const sessionId = newSession();
    // quick workflow，DEV 未完成，委派 code-reviewer 應被擋
    state.initState(sessionId, 'quick', workflows['quick'].stages);

    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        cwd: '/nonexistent/path',
        tool_input: {
          subagent_type: 'code-reviewer',
          description: '委派 code-reviewer',
          prompt: '審查程式碼',
        },
      },
      sessionId
    );

    // DEV 未完成 → 應被擋（不受 cwd 不存在影響）
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('deny');
  });
});

// Scenario: 注入後保留所有原始 toolInput 欄位
describe('Scenario: 注入後保留所有原始 toolInput 欄位', () => {
  it('subagent_type、description 等原始欄位保留在 updatedInput 中', async () => {
    const sessionId = newSession();
    state.initState(sessionId, 'single', workflows['single'].stages);

    const ORIGINAL_SUBAGENT_TYPE = 'developer';
    const ORIGINAL_DESCRIPTION = '開發任務描述（原始）';

    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        cwd: PROJECT_ROOT,
        tool_input: {
          subagent_type: ORIGINAL_SUBAGENT_TYPE,
          description: ORIGINAL_DESCRIPTION,
          prompt: '執行開發任務',
        },
      },
      sessionId
    );

    expect(isAllowed(result)).toBe(true);

    const updatedInput = result?.hookSpecificOutput?.updatedInput;
    expect(updatedInput).toBeDefined();
    expect(updatedInput.subagent_type).toBe(ORIGINAL_SUBAGENT_TYPE);
    expect(updatedInput.description).toBe(ORIGINAL_DESCRIPTION);
  });

  it('只有 prompt 欄位被修改（追加 test-index 摘要）', async () => {
    const sessionId = newSession();
    state.initState(sessionId, 'single', workflows['single'].stages);

    const ORIGINAL_PROMPT = '原始 developer 任務指令';

    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        cwd: PROJECT_ROOT,
        tool_input: {
          subagent_type: 'developer',
          description: '開發任務',
          prompt: ORIGINAL_PROMPT,
        },
      },
      sessionId
    );

    const updatedInput = result?.hookSpecificOutput?.updatedInput;
    expect(updatedInput).toBeDefined();

    // prompt 被修改 — 包含原始內容 + [Test Index]
    expect(updatedInput.prompt).toContain(ORIGINAL_PROMPT);
    expect(updatedInput.prompt).toContain('[Test Index]');

    // 其他欄位未被添加非預期屬性
    expect(updatedInput.subagent_type).toBe('developer');
    expect(updatedInput.description).toBe('開發任務');
  });
});
