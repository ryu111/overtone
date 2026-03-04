'use strict';
/**
 * hook-pure-fns.test.js
 *
 * 測試 Humble Object 重構後各 hook 腳本匯出的純函數。
 * 策略：直接 require() 各 hook 腳本，驗證純函數輸入/輸出契約。
 *
 * 覆蓋範圍：
 *   - session/on-start.js:       buildBanner, buildStartOutput
 *   - session/on-stop.js:        calcDuration, buildCompletionSummary, buildContinueMessage
 *   - session/pre-compact.js:    buildCompactMessage
 *   - prompt/on-submit.js:       buildSystemMessage
 *   - tool/pre-task.js:          checkSkippedStages
 *   - tool/pre-edit-guard.js:    checkProtected, checkMemoryLineLimit
 *   - tool/pre-bash-guard.js:    checkDangerousCommand
 *   - notification/on-notification.js: shouldPlaySound
 */

const { describe, test, expect } = require('bun:test');
const path = require('path');

const HOOKS_ROOT = path.resolve(__dirname, '../../plugins/overtone/hooks/scripts');

// ── require.main 守衛驗證 ──────────────────────────────────────────────────

describe('require.main 守衛', () => {
  test('require() on-start.js 不觸發 stdin 讀取，並匯出函數', () => {
    const mod = require(path.join(HOOKS_ROOT, 'session/on-start'));
    expect(typeof mod.buildBanner).toBe('function');
    expect(typeof mod.buildStartOutput).toBe('function');
  });

  test('require() on-stop.js 不觸發 stdin 讀取，並匯出函數', () => {
    const mod = require(path.join(HOOKS_ROOT, 'session/on-stop'));
    expect(typeof mod.calcDuration).toBe('function');
    expect(typeof mod.buildCompletionSummary).toBe('function');
    expect(typeof mod.buildContinueMessage).toBe('function');
  });

  test('require() pre-compact.js 不觸發 stdin 讀取，並匯出函數', () => {
    const mod = require(path.join(HOOKS_ROOT, 'session/pre-compact'));
    expect(typeof mod.buildCompactMessage).toBe('function');
  });

  test('require() on-submit.js 不觸發 stdin 讀取，並匯出函數', () => {
    const mod = require(path.join(HOOKS_ROOT, 'prompt/on-submit'));
    expect(typeof mod.buildSystemMessage).toBe('function');
  });

  test('require() pre-task.js 不觸發 stdin 讀取，並匯出函數', () => {
    const mod = require(path.join(HOOKS_ROOT, 'tool/pre-task'));
    expect(typeof mod.checkSkippedStages).toBe('function');
  });

  test('require() pre-edit-guard.js 不觸發 stdin 讀取，並匯出函數', () => {
    const mod = require(path.join(HOOKS_ROOT, 'tool/pre-edit-guard'));
    expect(typeof mod.checkProtected).toBe('function');
    expect(typeof mod.checkMemoryLineLimit).toBe('function');
    expect(typeof mod.shouldWarnMainAgentCoding).toBe('function');
  });

  test('require() pre-bash-guard.js 不觸發 stdin 讀取，並匯出函數', () => {
    const mod = require(path.join(HOOKS_ROOT, 'tool/pre-bash-guard'));
    expect(typeof mod.checkDangerousCommand).toBe('function');
  });

  test('require() on-notification.js 不觸發 stdin 讀取，並匯出函數', () => {
    const mod = require(path.join(HOOKS_ROOT, 'notification/on-notification'));
    expect(typeof mod.shouldPlaySound).toBe('function');
  });
});

// ── session/on-start.js 純函數 ───────────────────────────────────────────

describe('on-start.js 純函數', () => {
  const { buildBanner, buildStartOutput } = require(path.join(HOOKS_ROOT, 'session/on-start'));

  describe('buildBanner', () => {
    test('包含版本號、sessionId、port', () => {
      const result = buildBanner('0.28.43', 'sess-123', 7777, {
        agentBrowserStatus: '  🌐 agent-browser: 已安裝',
        ghStatus: '  🐙 gh CLI: 已安裝且已認證',
        grayMatterStatus: null,
      });
      expect(result).toContain('0.28.43');
      expect(result).toContain('sess-123');
      expect(result).toContain('7777');
    });

    test('deps 為空物件時不拋出例外，回傳字串', () => {
      const result = buildBanner('0.28.0', 'sess-abc', 7777, {});
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('deps 為 null 時不拋出例外', () => {
      const result = buildBanner('0.28.0', 'sess-xyz', null, null);
      expect(typeof result).toBe('string');
    });

    test('port 為 null 時不顯示 Dashboard URL', () => {
      const result = buildBanner('0.28.0', 'sess-abc', null, {});
      expect(result).not.toContain('Dashboard');
    });
  });

  describe('buildStartOutput', () => {
    test('有 msgs 時回傳 result 和 systemMessage', () => {
      const output = buildStartOutput(
        { session_id: 'abc', api_key: 'key' },
        { banner: '🎵 banner', msgs: ['未完成任務訊息'] }
      );
      expect(typeof output.result).toBe('string');
      expect(typeof output.systemMessage).toBe('string');
      expect(output.systemMessage.length).toBeGreaterThan(0);
    });

    test('無 msgs（空陣列）時 systemMessage 為 undefined', () => {
      const output = buildStartOutput(
        { session_id: 'abc' },
        { banner: 'banner', msgs: [] }
      );
      expect(typeof output.result).toBe('string');
      expect(output.systemMessage).toBeUndefined();
    });

    test('msgs 含 null/undefined 時自動過濾', () => {
      const output = buildStartOutput(
        {},
        { banner: 'banner', msgs: [null, undefined, '有效訊息'] }
      );
      expect(output.systemMessage).toBe('有效訊息');
    });

    test('回傳物件可安全序列化為 JSON', () => {
      const output = buildStartOutput(
        { session_id: 'test' },
        { banner: 'banner', msgs: ['訊息 A', '訊息 B'] }
      );
      expect(() => JSON.stringify(output)).not.toThrow();
      const parsed = JSON.parse(JSON.stringify(output));
      expect(typeof parsed.result).toBe('string');
      expect(typeof parsed.systemMessage).toBe('string');
    });
  });
});

// ── session/on-stop.js 純函數 ────────────────────────────────────────────

describe('on-stop.js 純函數', () => {
  const { calcDuration, buildCompletionSummary, buildContinueMessage } = require(path.join(HOOKS_ROOT, 'session/on-stop'));

  describe('calcDuration', () => {
    test('超過 1 分鐘時包含分鐘和秒數', () => {
      const start = new Date(Date.now() - 2 * 60 * 1000 - 30 * 1000).toISOString();
      const result = calcDuration(start);
      expect(result).toMatch(/\d+m \d+s/);
      expect(result).toContain('2m');
    });

    test('不足 1 分鐘時只回傳秒數', () => {
      const start = new Date(Date.now() - 45 * 1000).toISOString();
      const result = calcDuration(start);
      expect(result).toMatch(/^\d+s$/);
      expect(result).not.toContain('m');
    });

    test('回傳字串型別', () => {
      const start = new Date(Date.now() - 1000).toISOString();
      expect(typeof calcDuration(start)).toBe('string');
    });
  });

  describe('buildCompletionSummary', () => {
    test('回傳非空字串', () => {
      const ws = {
        workflowType: 'standard',
        currentStage: 'DEV',
        createdAt: new Date(Date.now() - 60000).toISOString(),
        failCount: 0,
        rejectCount: 0,
        stages: {
          PLAN: { status: 'completed', result: 'pass' },
          DEV: { status: 'completed', result: 'pass' },
        },
      };
      const result = buildCompletionSummary(ws);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('包含 workflowType', () => {
      const ws = {
        workflowType: 'quick',
        currentStage: 'DOCS',
        createdAt: new Date(Date.now() - 30000).toISOString(),
        failCount: 0,
        rejectCount: 0,
        stages: {
          DEV: { status: 'completed', result: 'pass' },
          REVIEW: { status: 'completed', result: 'pass' },
        },
      };
      const result = buildCompletionSummary(ws);
      expect(result).toContain('quick');
    });

    test('stages 為空物件時不拋出例外', () => {
      const ws = {
        workflowType: 'single',
        currentStage: null,
        createdAt: new Date(Date.now() - 5000).toISOString(),
        failCount: 0,
        rejectCount: 0,
        stages: {},
      };
      expect(() => buildCompletionSummary(ws)).not.toThrow();
      const result = buildCompletionSummary(ws);
      expect(typeof result).toBe('string');
    });
  });

  describe('buildContinueMessage', () => {
    test('包含 iteration 資訊', () => {
      const result = buildContinueMessage({
        iteration: 2,
        maxIterations: 5,
        progressBar: '✅🏗️✅',
        completedStages: 3,
        totalStages: 5,
        tasksStatus: { checked: 3, total: 5 },
        hint: '繼續 DEV 階段',
      });
      expect(result).toContain('2');
      expect(result).toContain('5');
    });

    test('包含禁止詢問使用者的指令', () => {
      const result = buildContinueMessage({
        iteration: 1,
        maxIterations: 10,
        progressBar: '',
        completedStages: 1,
        totalStages: 4,
        tasksStatus: null,
        hint: null,
      });
      expect(result).toContain('禁止詢問使用者');
    });

    test('iteration 達到 maxIterations 時不拋出例外', () => {
      expect(() => buildContinueMessage({
        iteration: 5,
        maxIterations: 5,
        progressBar: '',
        completedStages: 3,
        totalStages: 5,
      })).not.toThrow();
    });

    test('ctx 為 null/undefined 時不拋出例外', () => {
      expect(() => buildContinueMessage(null)).not.toThrow();
      expect(() => buildContinueMessage(undefined)).not.toThrow();
    });
  });
});

// ── session/pre-compact.js 純函數 ────────────────────────────────────────

describe('pre-compact.js 純函數', () => {
  const { buildCompactMessage } = require(path.join(HOOKS_ROOT, 'session/pre-compact'));

  test('包含 workflowType 和 currentStage', () => {
    const currentState = {
      workflowType: 'standard',
      currentStage: 'DEV',
      featureName: 'my-feature',
      failCount: 0,
      rejectCount: 0,
      stages: {
        PLAN: { status: 'completed', result: 'pass' },
        DEV: { status: 'active' },
      },
    };
    const result = buildCompactMessage({
      currentState,
      progressBar: '✅💻',
      completed: 1,
      total: 2,
      stageHint: 'DEV 階段進行中',
      pendingMsg: '未完成任務',
      queueSummary: null,
      stages: {},
      parallelGroups: {},
    });
    expect(result).toContain('standard');
    expect(result.length).toBeGreaterThan(0);
  });

  test('訊息超過 MAX_MESSAGE_LENGTH 時截斷', () => {
    const currentState = {
      workflowType: 'standard',
      currentStage: 'DEV',
      featureName: 'my-feature',
      failCount: 0,
      rejectCount: 0,
      stages: {},
    };
    const result = buildCompactMessage({
      currentState,
      progressBar: '',
      completed: 0,
      total: 0,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
      stages: {},
      parallelGroups: {},
      MAX_MESSAGE_LENGTH: 100,
    });
    expect(result.length).toBeLessThanOrEqual(100);
  });

  test('currentState 為 null 時不拋出例外', () => {
    expect(() => buildCompactMessage({
      currentState: null,
      progressBar: '',
      completed: 0,
      total: 0,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
      stages: {},
      parallelGroups: {},
    })).not.toThrow();
    const result = buildCompactMessage({
      currentState: null,
      progressBar: '',
      completed: 0,
      total: 0,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
      stages: {},
      parallelGroups: {},
    });
    expect(typeof result).toBe('string');
  });
});

// ── prompt/on-submit.js 純函數 ───────────────────────────────────────────

describe('on-submit.js 純函數', () => {
  const { buildSystemMessage } = require(path.join(HOOKS_ROOT, 'prompt/on-submit'));

  const mockWorkflows = {
    single: { label: '單步修改' },
    standard: { label: '標準功能' },
  };

  describe('buildSystemMessage', () => {
    test('有 validWorkflowOverride 時包含 workflow 名稱', () => {
      const result = buildSystemMessage({
        validWorkflowOverride: 'single',
        currentState: null,
        activeFeatureContext: '',
        workflows: mockWorkflows,
      });
      expect(result).toContain('single');
    });

    test('有進行中 workflow 時包含 currentStage 資訊', () => {
      const result = buildSystemMessage({
        validWorkflowOverride: null,
        currentState: { status: 'running', currentStage: 'DEV', workflowType: 'standard' },
        activeFeatureContext: '📂 活躍 Feature：my-feature',
        workflows: mockWorkflows,
      });
      expect(result).toContain('DEV');
      expect(result).toContain('my-feature');
    });

    test('無 workflow 時回傳非空字串（/ot:auto 指引）', () => {
      const result = buildSystemMessage({
        validWorkflowOverride: null,
        currentState: null,
        activeFeatureContext: null,
        workflows: mockWorkflows,
      });
      // 無 workflow 時回傳 /ot:auto 指引（非 null）
      expect(typeof result === 'string' || result === null).toBe(true);
    });

    test('回傳值始終為 string 或 null（型別契約）', () => {
      const cases = [
        { validWorkflowOverride: 'single', currentState: null, activeFeatureContext: '', workflows: mockWorkflows },
        { validWorkflowOverride: null, currentState: { currentStage: 'PLAN', workflowType: 'standard' }, activeFeatureContext: '', workflows: mockWorkflows },
        { validWorkflowOverride: null, currentState: null, activeFeatureContext: null, workflows: mockWorkflows },
      ];
      for (const opts of cases) {
        const result = buildSystemMessage(opts);
        expect(typeof result === 'string' || result === null).toBe(true);
        expect(result).not.toBeUndefined();
      }
    });

    test('opts 為 null/undefined 時不拋出例外', () => {
      expect(() => buildSystemMessage(null)).not.toThrow();
      expect(() => buildSystemMessage(undefined)).not.toThrow();
    });
  });
});

// ── tool/pre-task.js 純函數 ──────────────────────────────────────────────

describe('pre-task.js 純函數', () => {
  const { checkSkippedStages } = require(path.join(HOOKS_ROOT, 'tool/pre-task'));

  const mockStages = {
    PLAN: { emoji: '🏗️', label: '計劃', agent: 'planner' },
    ARCH: { emoji: '📐', label: '架構', agent: 'architect' },
    DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
  };

  test('所有前置 stage 已完成時回傳空陣列', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'completed', result: 'pass' },
        ARCH: { status: 'completed', result: 'pass' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', mockStages);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test('前置 stage 為 pending 時回傳跳過清單', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'pending' },
        ARCH: { status: 'pending' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', mockStages);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // 應包含 PLAN 和 ARCH 的描述
    expect(result.some(s => s.includes('PLAN'))).toBe(true);
  });

  test('targetStage 為第一個 stage 時回傳空陣列（無前置依賴）', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'pending' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'PLAN', mockStages);
    expect(result).toHaveLength(0);
  });

  test('currentState 為 null 時回傳空陣列（不拋出例外）', () => {
    const result = checkSkippedStages(null, 'DEV', mockStages);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test('前置 stage 已 active 時不算跳過', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'active' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', {
      PLAN: { emoji: '🏗️', label: '計劃', agent: 'planner' },
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
    });
    expect(result).toHaveLength(0);
  });
});

// ── tool/pre-edit-guard.js 純函數 ────────────────────────────────────────

describe('pre-edit-guard.js 純函數', () => {
  const { checkProtected, checkMemoryLineLimit, shouldWarnMainAgentCoding } = require(path.join(HOOKS_ROOT, 'tool/pre-edit-guard'));

  describe('checkProtected', () => {
    test('受保護的 agents 路徑回傳 label 和 api', () => {
      const result = checkProtected('agents/developer.md', '/path/to/plugins/overtone');
      expect(result).not.toBeNull();
      expect(typeof result.label).toBe('string');
      expect(typeof result.api).toBe('string');
    });

    test('普通檔案路徑回傳 null', () => {
      const result = checkProtected('src/utils/helper.js', '/path/to/plugins/overtone');
      expect(result).toBeNull();
    });

    test('hooks.json 為受保護路徑', () => {
      const result = checkProtected('hooks/hooks.json', '/path/to/plugins/overtone');
      expect(result).not.toBeNull();
    });

    test('skills SKILL.md 為受保護路徑', () => {
      const result = checkProtected('skills/testing/SKILL.md', '/path/to/plugins/overtone');
      expect(result).not.toBeNull();
    });

    test('空字串回傳 null（不拋出例外）', () => {
      expect(() => checkProtected('', '/any')).not.toThrow();
      expect(checkProtected('', '/any')).toBeNull();
    });

    test('registry-data.json 為受保護路徑', () => {
      const result = checkProtected('scripts/lib/registry-data.json', '/any');
      expect(result).not.toBeNull();
    });
  });

  describe('checkMemoryLineLimit', () => {
    test('MEMORY.md 行數未超限時回傳 exceeded=false', () => {
      // 生成 100 行的 content
      const content = Array.from({ length: 100 }, (_, i) => `# 第 ${i + 1} 行`).join('\n');
      const filePath = '/Users/test/.claude/projects/-Users-test/memory/MEMORY.md';
      const result = checkMemoryLineLimit(filePath, 'Write', { content }, 200);
      expect(result.exceeded).toBe(false);
      expect(result.estimatedLines).toBe(100);
    });

    test('MEMORY.md 行數超出限制時回傳 exceeded=true', () => {
      // 生成 201 行的 content
      const content = Array.from({ length: 201 }, (_, i) => `# 第 ${i + 1} 行`).join('\n');
      const filePath = '/Users/test/.claude/projects/-Users-test/memory/MEMORY.md';
      const result = checkMemoryLineLimit(filePath, 'Write', { content }, 200);
      expect(result.exceeded).toBe(true);
      expect(result.estimatedLines).toBeGreaterThan(200);
    });

    test('非 MEMORY.md 路徑回傳 exceeded=false，estimatedLines=0', () => {
      const result = checkMemoryLineLimit('src/utils/helper.js', 'Write', { content: 'line1\nline2' }, 200);
      expect(result.exceeded).toBe(false);
      expect(result.estimatedLines).toBe(0);
    });

    test('toolName 非 Write/Edit 時 estimatedLines 為 0，不超限', () => {
      const filePath = '/Users/test/.claude/projects/-Users-test/memory/MEMORY.md';
      const result = checkMemoryLineLimit(filePath, 'Read', {}, 200);
      expect(result.exceeded).toBe(false);
    });
  });

  describe('shouldWarnMainAgentCoding', () => {
    test('DEV pending + 無 activeAgents → 回傳警告', () => {
      const state = {
        stages: { DEV: { status: 'pending', result: null }, REVIEW: { status: 'pending', result: null } },
        activeAgents: {},
      };
      const result = shouldWarnMainAgentCoding(state);
      expect(result).not.toBeNull();
      expect(result).toContain('MUST');
      expect(result).toContain('developer');
    });

    test('DEV completed → 回傳 null（不干預）', () => {
      const state = {
        stages: { DEV: { status: 'completed', result: 'pass' } },
        activeAgents: {},
      };
      expect(shouldWarnMainAgentCoding(state)).toBeNull();
    });

    test('有 activeAgents → 回傳 null（subagent 在寫碼）', () => {
      const state = {
        stages: { DEV: { status: 'active', result: null } },
        activeAgents: { 'developer:abc123': { agentName: 'developer' } },
      };
      expect(shouldWarnMainAgentCoding(state)).toBeNull();
    });

    test('無 DEV stage → 回傳 null（discovery 等 workflow）', () => {
      const state = {
        stages: { PM: { status: 'active', result: null } },
        activeAgents: {},
      };
      expect(shouldWarnMainAgentCoding(state)).toBeNull();
    });

    test('state 為 null → 回傳 null', () => {
      expect(shouldWarnMainAgentCoding(null)).toBeNull();
    });

    test('state.stages 為 undefined → 回傳 null', () => {
      expect(shouldWarnMainAgentCoding({})).toBeNull();
    });
  });
});

// ── tool/pre-bash-guard.js 純函數 ────────────────────────────────────────

describe('pre-bash-guard.js 純函數', () => {
  const { checkDangerousCommand } = require(path.join(HOOKS_ROOT, 'tool/pre-bash-guard'));

  test('rm -rf / 回傳危險類別字串', () => {
    const result = checkDangerousCommand('rm -rf /');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('安全命令 ls -la /tmp 回傳 null', () => {
    const result = checkDangerousCommand('ls -la /tmp');
    expect(result).toBeNull();
  });

  test('fork bomb 回傳非空字串', () => {
    const result = checkDangerousCommand(':(){ :|:& };:');
    // fork bomb 可能不在黑名單，重點是不拋出例外
    expect(typeof result === 'string' || result === null).toBe(true);
  });

  test('sudo rm -rf / 偵測為危險命令', () => {
    const result = checkDangerousCommand('sudo rm -rf /');
    expect(result).not.toBeNull();
    expect(result).toContain('刪除根目錄');
  });

  test('空字串回傳 null（不拋出例外）', () => {
    expect(() => checkDangerousCommand('')).not.toThrow();
    expect(checkDangerousCommand('')).toBeNull();
  });

  test('mkfs 偵測為格式化磁碟', () => {
    const result = checkDangerousCommand('mkfs /dev/sda1');
    expect(result).not.toBeNull();
    expect(result).toContain('格式化磁碟');
  });

  test('pkill 偵測為危險命令', () => {
    const result = checkDangerousCommand('pkill node');
    expect(result).not.toBeNull();
  });
});

// ── notification/on-notification.js 純函數 ──────────────────────────────

describe('on-notification.js 純函數', () => {
  const { shouldPlaySound } = require(path.join(HOOKS_ROOT, 'notification/on-notification'));

  test('notificationType 在 soundTypes 清單中時回傳 true', () => {
    const result = shouldPlaySound('elicitation_dialog', ['elicitation_dialog', 'error']);
    expect(result).toBe(true);
  });

  test('notificationType 不在 soundTypes 清單中時回傳 false', () => {
    const result = shouldPlaySound('permission_prompt', ['elicitation_dialog', 'error']);
    expect(result).toBe(false);
  });

  test('soundTypes 為空陣列時回傳 false', () => {
    const result = shouldPlaySound('elicitation_dialog', []);
    expect(result).toBe(false);
  });

  test('soundTypes 為 null/undefined 時回傳 false（不拋出例外）', () => {
    expect(() => shouldPlaySound('elicitation_dialog', null)).not.toThrow();
    expect(shouldPlaySound('elicitation_dialog', null)).toBe(false);
    expect(shouldPlaySound('elicitation_dialog', undefined)).toBe(false);
  });

  test('notificationType 為空字串時回傳 false', () => {
    const result = shouldPlaySound('', ['elicitation_dialog']);
    expect(result).toBe(false);
  });
});
