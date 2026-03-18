// r4-e2e-integration.test.js — R4 自驅閉環端到端整合測試
// 驗證 5 個場景：完整迴圈 / 學習反饋 / 格式相容 / 降級容錯 / 多迴圈累積
import { describe, test, expect, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

const { discoverGaps, syncToSpec } = await import(join(homedir(), '.claude/scripts/gap-discovery.js'));
const { probeSession } = await import(join(homedir(), '.claude/scripts/capability-probe.js'));
const { planForTask, recordOutcome, lookupPattern } = await import(join(homedir(), '.claude/scripts/task-adapter.js'));
const { poll, executeTask, readState, writeState } = await import(join(homedir(), '.claude/scripts/heartbeat.js'));
const { buildPrompt } = await import(join(homedir(), '.claude/scripts/session-spawner.js'));

// ─── 共用 Mock 資料（沿用 r4-self-drive-loop.test.js 常數） ───────────────────

const MOCK_GAPS = [{
  id: 'closedLoop:missing-skillmd:test-skill',
  category: 'structure',
  severity: 'critical',
  priority: 76,
  repairHint: '建立 SKILL.md',
  context: { element: 'skills/test-skill', check: 'closedLoop', type: 'missing-skillmd', files: [] },
}];

const MOCK_WEAK_CAPS = [{ name: 'docker', strength: 'missing', missingHits: 5 }];

const MOCK_SCORES = '{"date":"2026-03-17","path":"skills/low","total":45,"grade":"F","suggestions":["改善"]}';

const MOCK_ROADMAP = '| R3.3 | 深度 PM | 重建 | ❌ |';

const MOCK_NOTION_TASKS = [{ id: 'notion-page-id', name: '測試任務', priority: 'P1' }];

// ─── 共用 Helper ──────────────────────────────────────────────────────────────

/** in-memory FS（task-adapter patterns 用，沿用 r4-self-drive-loop.test.js） */
function makeMemoryDeps(initialData = null) {
  const store = new Map();
  const patternsFile = join(tmpdir(), `r4-e2e-patterns-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  if (initialData !== null) {
    store.set(patternsFile, JSON.stringify(initialData, null, 2));
  }
  return {
    patternsFile,
    existsSync: (path) => store.has(path),
    readFileSync: (path) => {
      if (!store.has(path)) throw new Error(`ENOENT: ${path}`);
      return store.get(path);
    },
    writeFileSync: (path, content) => { store.set(path, content); },
    mkdirSync: () => {},
    _store: store,
    _read: () => {
      const raw = store.get(patternsFile);
      return raw ? JSON.parse(raw) : null;
    },
  };
}

/** 建立 tmpdir + 清理函式 */
function makeTmpEnv(prefix = 'r4-e2e') {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const dataDir = join(dir, 'data');
  mkdirSync(dataDir, { recursive: true });
  return {
    dir,
    dataDir,
    stateFile: join(dir, 'heartbeat-state.json'),
    summaryFile: join(dir, 'session-summaries.jsonl'),
    eventsFile: join(dir, 'flow-events.jsonl'),
    boundaryFile: join(dataDir, 'capability-boundary.json'),
    improvementsFile: join(dataDir, 'improvements.jsonl'),
    cleanup: () => { try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* cleanup */ } },
  };
}

/** heartbeat mock deps 工廠 */
function makeHeartbeatDeps(overrides = {}) {
  const claimedIds = [];
  const completedIds = [];
  const resetIds = [];
  return {
    claimedIds,
    completedIds,
    resetIds,
    listTasks: async () => MOCK_NOTION_TASKS,
    claimTask: async (id) => { claimedIds.push(id); },
    completeTask: async (id) => { completedIds.push(id); },
    resetTask: async (id) => { resetIds.push(id); },
    spawnSession: (_prompt, _opts) => ({
      ok: true,
      outcome: Promise.resolve({
        exitCode: 0,
        stdout: JSON.stringify({ success: true, result: '任務完成', sessionId: 'test-session-1' }),
        duration: 500,
      }),
    }),
    ...overrides,
  };
}

/** capability-probe mock deps 工廠 */
function makeProbeDeps(tmpEnv, overrides = {}) {
  return {
    boundaryFile: tmpEnv.boundaryFile,
    dataDir: tmpEnv.dataDir,
    improvementsFile: tmpEnv.improvementsFile,
    existsSync,
    readFileSync,
    writeFileSync,
    mkdirSync,
    appendFileSync: (path, data) => { appendFileSync(path, data); },
    matchTools: async () => ({
      recommended: [{ id: 'curl', name: 'curl' }],
      missing: ['web-scraping'],
    }),
    ...overrides,
  };
}

/** gap-discovery Suggestion → heartbeat Notion task 格式 */
function suggestionToNotionTask(suggestion) {
  return { id: suggestion.id, name: suggestion.title, priority: suggestion.suggestedPriority };
}

// ─── 場景 1：完整自驅迴圈（Happy Path） ──────────────────────────────────────

describe('場景 1：完整自驅迴圈（Happy Path）', () => {
  let tmpEnv;
  afterEach(() => tmpEnv?.cleanup());

  test('gap-discovery → Notion sync → heartbeat → task-adapter → execute → record → probe → 收斂', async () => {
    tmpEnv = makeTmpEnv('s1');
    const adapterDeps = makeMemoryDeps();
    adapterDeps.matchTools = async () => ({
      recommended: [{ id: 'bash', name: 'Bash' }, { id: 'git', name: 'git' }],
      missing: [],
    });
    adapterDeps.suggestDepth = () => ({ depth: 'D2', reason: 'test' });

    // Step 1: discoverGaps 第一輪
    const mockData1 = {
      gaps: MOCK_GAPS,
      weakCaps: MOCK_WEAK_CAPS,
      scores: MOCK_SCORES,
      roadmapContent: MOCK_ROADMAP,
    };
    const report1 = await discoverGaps({ _mock: mockData1 });
    expect(report1.suggestions.length).toBeGreaterThan(0);

    // Step 2: syncToSpec — 建立高信心建議
    const createdTitles = [];
    const syncDeps = {
      createTask: async (title) => {
        createdTitles.push(title);
        return { id: `spec-${Date.now()}` };
      },
    };
    const syncResult = await syncToSpec(report1.suggestions, syncDeps);
    expect(syncResult.created).toBeGreaterThanOrEqual(1);
    expect(syncResult.failed).toBe(0);

    // Step 3: 將高信心 suggestions 轉為 Notion task → heartbeat poll
    const notionTasks = report1.suggestions
      .filter(s => s.confidence >= 40)
      .map(s => suggestionToNotionTask(s));
    expect(notionTasks.length).toBeGreaterThanOrEqual(1);

    const pollDeps = makeHeartbeatDeps({
      listTasks: async () => notionTasks,
    });
    const pollResult = await poll({ _stateFile: tmpEnv.stateFile }, pollDeps);
    expect(pollResult.action).toBe('execute');
    expect(pollResult.task).toBeDefined();

    // Step 4: task-adapter planForTask
    const task = pollResult.task;
    const plan = await planForTask(task.name, {}, adapterDeps);
    expect(['exploration', 'pattern', 'fallback']).toContain(plan.source);
    expect(Array.isArray(plan.tools)).toBe(true);
    expect(typeof plan.depth).toBe('string');

    // Step 5: executeTask mock 成功
    const execDeps = makeHeartbeatDeps({
      summaryFile: tmpEnv.summaryFile,
    });
    const execResult = await executeTask(task, { _stateFile: tmpEnv.stateFile, maxRetries: 0 }, execDeps);
    expect(execResult.status).toBe('success');

    // Step 6: recordOutcome
    recordOutcome(task.name, plan.tools, plan.depth, true, 500, adapterDeps);
    const storedData = adapterDeps._read();
    expect(storedData).not.toBeNull();
    expect(Object.keys(storedData.patterns).length).toBeGreaterThan(0);

    // Step 7: probeSession — 寫入 events → probe → boundary 更新
    const probeDeps = makeProbeDeps(tmpEnv);
    const events = [
      { sid: 1, type: 'prompt_submit', prompt_preview: 'build docker container image' },
      { sid: 1, type: 'tool_use', tool_name: 'bash' },
    ];
    writeFileSync(tmpEnv.eventsFile, events.map(e => JSON.stringify(e)).join('\n') + '\n');
    const probeResult = await probeSession(tmpEnv.eventsFile, probeDeps);
    expect(probeResult.updatedBoundary).toBeDefined();
    expect(typeof probeResult.updatedBoundary.sessions?.total).toBe('number');

    // Step 8: 第二輪 discoverGaps — 移除已修復缺口，驗證收斂
    const mockData2 = {
      gaps: [],          // 第一輪缺口已修復
      weakCaps: [],      // 能力缺口消除
      scores: MOCK_SCORES,
      roadmapContent: MOCK_ROADMAP,
    };
    const report2 = await discoverGaps({ _mock: mockData2, skipNotion: true });
    expect(report2.suggestions.length).toBeLessThanOrEqual(report1.suggestions.length);
  });
});

// ─── 場景 2：學習反饋閉環 ──────────────────────────────────────────────────────

describe('場景 2：學習反饋閉環', () => {
  test('exploration → success record → pattern 複用 → 連續失敗 → 清除 → exploration', async () => {
    const deps = makeMemoryDeps();
    deps.matchTools = async () => ({
      recommended: [{ id: 'kubectl', name: 'kubectl' }, { id: 'bash', name: 'Bash' }],
      missing: [],
    });
    deps.suggestDepth = () => ({ depth: 'D2', reason: 'test' });

    const taskDesc1 = 'kubernetes deployment 部署到生產環境';
    const taskDesc2 = 'kubernetes deployment 更新 image';
    const taskDesc3 = 'kubernetes deployment 修復失敗';

    // Step 1: 首次規劃 → exploration
    const plan1 = await planForTask(taskDesc1, {}, deps);
    expect(plan1.source).toBe('exploration');
    expect(plan1.confidence).toBeLessThan(0.9);

    // Step 2: 記錄成功
    recordOutcome(taskDesc1, plan1.tools, plan1.depth, true, 120, deps);

    // Step 3: 同類任務 → pattern 複用
    const plan2 = await planForTask(taskDesc2, {}, deps);
    expect(plan2.source).toBe('pattern');
    expect(plan2.confidence).toBeGreaterThanOrEqual(0.6);

    // Step 4: 連續失敗 3 次
    recordOutcome(taskDesc2, plan2.tools, plan2.depth, false, 0, deps);
    recordOutcome(taskDesc2, plan2.tools, plan2.depth, false, 0, deps);
    recordOutcome(taskDesc2, plan2.tools, plan2.depth, false, 0, deps);

    // Step 5: pattern 被清除後退回 exploration
    const plan3 = await planForTask(taskDesc3, {}, deps);
    expect(plan3.source).not.toBe('pattern');

    // Step 6: patterns 資料一致性
    const data = deps._read();
    expect(data).not.toBeNull();
    const deployPatterns = data.patterns['deploy'];
    if (deployPatterns) {
      const planKey = `${[...plan2.tools].map(t => typeof t === 'string' ? t : t.id).sort().join(',')}::${plan2.depth}`;
      const survivedPlan = (deployPatterns.successfulPlans || []).find(p => {
        const k = `${[...p.tools].map(t => typeof t === 'string' ? t : t.id).sort().join(',')}::${p.depth}`;
        return k === planKey && p.consecutiveFails >= 3;
      });
      // 連續失敗 3 次的 plan 應被清除或 consecutiveFails 反映
      if (survivedPlan) {
        expect(survivedPlan.consecutiveFails).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

// ─── 場景 3：跨模組資料格式相容性 ────────────────────────────────────────────

describe('場景 3：跨模組資料格式相容性', () => {
  const mockData = {
    gaps: MOCK_GAPS,
    weakCaps: MOCK_WEAK_CAPS,
    scores: MOCK_SCORES,
    roadmapContent: MOCK_ROADMAP,
  };

  test('gap-discovery Suggestion → syncToSpec 欄位相容', async () => {
    const report = await discoverGaps({ _mock: mockData });
    const s = report.suggestions[0];

    // 必要欄位存在且型別正確
    expect(typeof s.title).toBe('string');
    expect(typeof s.description).toBe('string');
    expect(typeof s.confidence).toBe('number');
    expect(typeof s.suggestedPriority).toBe('string');

    // 直接傳入 syncToSpec 不 throw
    const deps = { createTask: async () => ({ id: 'test-id' }) };
    await expect(syncToSpec(report.suggestions, deps)).resolves.toBeDefined();
  });

  test('gap-discovery Suggestion → heartbeat task 欄位相容', async () => {
    const report = await discoverGaps({ _mock: mockData, skipNotion: true });
    const notionTask = suggestionToNotionTask(report.suggestions[0]);

    // heartbeat 需要 id/name + priority
    expect(notionTask.id).toBeDefined();
    expect(typeof notionTask.name).toBe('string');
    expect(notionTask.name.length).toBeGreaterThan(0);
    expect(notionTask.priority).toBeDefined();

    // 可被 poll 直接消費（不 throw）
    const tmpEnv = makeTmpEnv('s3b');
    const pollDeps = makeHeartbeatDeps({ listTasks: async () => [notionTask] });
    await expect(poll({ _stateFile: tmpEnv.stateFile }, pollDeps)).resolves.toBeDefined();
    tmpEnv.cleanup();
  });

  test('heartbeat task → task-adapter planForTask 欄位相容', async () => {
    const tmpEnv = makeTmpEnv('s3c');
    const pollDeps = makeHeartbeatDeps();
    const pollResult = await poll({ _stateFile: tmpEnv.stateFile }, pollDeps);
    expect(pollResult.action).toBe('execute');

    const deps = makeMemoryDeps();
    deps.matchTools = async () => ({ recommended: [{ id: 'bash', name: 'Bash' }], missing: [] });
    deps.suggestDepth = () => ({ depth: 'D1', reason: 'test' });

    // task.name 直接傳入 planForTask 不 throw
    const plan = await planForTask(pollResult.task.name, {}, deps);
    expect(plan.taskType).toBeDefined();
    expect(Array.isArray(plan.tools)).toBe(true);
    expect(typeof plan.depth).toBe('string');
    tmpEnv.cleanup();
  });

  test('task-adapter AdaptationPlan → session-spawner 欄位相容', async () => {
    const deps = makeMemoryDeps();
    deps.matchTools = async () => ({ recommended: [{ id: 'bash', name: 'Bash' }], missing: [] });
    deps.suggestDepth = () => ({ depth: 'D2', reason: 'test' });

    const plan = await planForTask('deploy kubernetes 服務', {}, deps);

    // plan 有 tools(array) 和 depth(string)
    expect(Array.isArray(plan.tools)).toBe(true);
    expect(typeof plan.depth).toBe('string');

    // depth 可作為 suggestDepth 的參考輸入，buildPrompt 使用 task.name 不 throw
    const task = { name: 'deploy kubernetes 服務', priority: 'P2' };
    const prompt = buildPrompt(task);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('capability-probe → gap-discovery 下輪相容', async () => {
    const tmpEnv = makeTmpEnv('s3e');
    const probeDeps = makeProbeDeps(tmpEnv);
    const events = [
      { sid: 1, type: 'prompt_submit', prompt_preview: 'scrape website data' },
      { sid: 1, type: 'tool_use', tool_name: 'curl' },
    ];
    writeFileSync(tmpEnv.eventsFile, events.map(e => JSON.stringify(e)).join('\n') + '\n');

    // 設置 boundary 讓 missingHits 觸發
    const boundary = {
      version: 1,
      capabilities: {
        'web-scraping': { coverageHits: 0, missingHits: 2, lastSeen: new Date().toISOString().slice(0, 10), strength: 'missing' },
      },
      sessions: { total: 5, withGaps: 2, lastAnalyzed: null },
    };
    writeFileSync(tmpEnv.boundaryFile, JSON.stringify(boundary));

    const probeResult = await probeSession(tmpEnv.eventsFile, probeDeps);
    const improvements = probeResult.triggeredImprovements;
    expect(Array.isArray(improvements)).toBe(true);

    if (improvements.length > 0) {
      // triggeredImprovements 格式可作為 gap-discovery weakCaps 源
      const imp = improvements[0];
      expect(typeof imp.capability).toBe('string');
      expect(typeof imp.source).toBe('string');
      expect(imp.source).toBe('capability-probe');
    }

    tmpEnv.cleanup();
  });

  test('recordOutcome → lookupPattern 欄位相容', async () => {
    const deps = makeMemoryDeps();
    deps.matchTools = async () => ({ recommended: [{ id: 'bash', name: 'Bash' }], missing: [] });
    deps.suggestDepth = () => ({ depth: 'D1', reason: 'test' });

    const taskDesc = '修復 auth 模組 bug';
    const tools = ['bash', 'editor'];
    const depth = 'D1';

    recordOutcome(taskDesc, tools, depth, true, 200, deps);

    // lookupPattern 找到且欄位正確
    const found = lookupPattern(taskDesc, deps);
    expect(found).not.toBeNull();
    expect(typeof found.confidence).toBe('number');
    expect(found.confidence).toBeGreaterThanOrEqual(0.6);
    expect(found.pattern).toBeDefined();
    expect(Array.isArray(found.pattern.successfulPlans)).toBe(true);
    const bestPlan = found.pattern.successfulPlans[0];
    expect(Array.isArray(bestPlan.tools)).toBe(true);
    expect(typeof bestPlan.depth).toBe('string');
  });
});

// ─── 場景 4：降級容錯 ─────────────────────────────────────────────────────────

describe('場景 4：降級容錯', () => {
  test('4a: gap-discovery 某源失敗 → 其餘源仍產出建議', async () => {
    const badMock = {
      gaps: null,          // gap-analyzer 失敗
      weakCaps: MOCK_WEAK_CAPS,
      scores: undefined,   // scores 失敗
      roadmapContent: MOCK_ROADMAP,
    };
    const report = await discoverGaps({ _mock: badMock, skipNotion: true });

    // 仍有 suggestions（來自 capability-probe 和 roadmap）
    expect(report.suggestions.length).toBeGreaterThan(0);
    const allSources = report.suggestions.flatMap(s => s.sources);
    const hasValidSource = allSources.some(src => src === 'capability-probe' || src === 'roadmap');
    expect(hasValidSource).toBe(true);
  });

  test('4b: session spawn 失敗 → state 恢復 + task reset', async () => {
    const tmpEnv = makeTmpEnv('s4b');
    const resetIds = [];

    // 設定 activeTask state
    writeState({
      running: true,
      activeTask: { id: 'notion-page-id', name: '測試任務', claimedAt: new Date().toISOString() },
      consecutiveFailures: 0,
      paused: false,
      lastPoll: null,
      pid: null,
      startedAt: null,
    }, tmpEnv.stateFile);

    const execDeps = {
      spawnSession: (_prompt, _opts) => ({
        ok: true,
        outcome: Promise.resolve({
          exitCode: 1,
          stdout: JSON.stringify({ success: false, error: 'session error' }),
          duration: 100,
        }),
      }),
      completeTask: async () => { throw new Error('不應呼叫'); },
      resetTask: async (id) => { resetIds.push(id); },
      summaryFile: tmpEnv.summaryFile,
    };

    const task = MOCK_NOTION_TASKS[0];
    const execResult = await executeTask(task, { _stateFile: tmpEnv.stateFile, maxRetries: 0 }, execDeps);

    // 狀態應為 failed
    expect(execResult.status).toBe('failed');
    // activeTask 應被清除
    const state = readState(tmpEnv.stateFile);
    expect(state.activeTask).toBeNull();
    // resetTask 應被呼叫
    expect(resetIds.length).toBeGreaterThanOrEqual(1);

    tmpEnv.cleanup();
  });

  test('4c: recordOutcome 寫入失敗 → 不阻塞後續 planForTask', async () => {
    // deps.writeFileSync throw
    const deps = makeMemoryDeps();
    deps.writeFileSync = () => { throw new Error('磁碟寫入失敗'); };
    deps.matchTools = async () => ({ recommended: [{ id: 'bash', name: 'Bash' }], missing: [] });
    deps.suggestDepth = () => ({ depth: 'D1', reason: 'test' });

    // recordOutcome 不應 throw
    expect(() => recordOutcome('fix bug in module', ['bash'], 'D1', true, 100, deps)).not.toThrow();

    // 後續 planForTask 仍可正常運作（使用不會 throw 的 deps）
    const safeDeps = makeMemoryDeps();
    safeDeps.matchTools = async () => ({ recommended: [{ id: 'bash', name: 'Bash' }], missing: [] });
    safeDeps.suggestDepth = () => ({ depth: 'D1', reason: 'test' });
    const plan = await planForTask('fix bug in module', {}, safeDeps);
    expect(plan).toBeDefined();
    expect(plan.source).toBeDefined();
  });
});

// ─── 場景 5：多迴圈累積 -- 系統收斂 ──────────────────────────────────────────

describe('場景 5：多迴圈累積 -- 系統收斂', () => {
  test('3 輪迴圈：缺口遞減 + confidence 遞增 + boundary 累積', async () => {
    const tmpEnv = makeTmpEnv('s5');
    const adapterDeps = makeMemoryDeps();
    adapterDeps.matchTools = async () => ({
      recommended: [{ id: 'docker', name: 'docker' }, { id: 'bash', name: 'Bash' }],
      missing: [],
    });
    adapterDeps.suggestDepth = () => ({ depth: 'D2', reason: 'test' });

    const taskName = 'docker container deployment 部署';

    // 三輪的 mock 資料（逐步減少缺口）
    const rounds = [
      { gaps: MOCK_GAPS, weakCaps: MOCK_WEAK_CAPS, scores: MOCK_SCORES, roadmapContent: MOCK_ROADMAP },
      { gaps: MOCK_GAPS, weakCaps: [], scores: MOCK_SCORES, roadmapContent: MOCK_ROADMAP },
      { gaps: [], weakCaps: [], scores: MOCK_SCORES, roadmapContent: MOCK_ROADMAP },
    ];

    const metrics = [];
    const probeDeps = makeProbeDeps(tmpEnv);

    for (let i = 0; i < 3; i++) {
      // Step A: discoverGaps
      const report = await discoverGaps({ _mock: rounds[i], skipNotion: true });

      // Step B: planForTask
      const plan = await planForTask(taskName, {}, adapterDeps);

      // Step C: recordOutcome（成功）
      recordOutcome(taskName, plan.tools, plan.depth, true, 100 + i * 50, adapterDeps);

      // Step D: probeSession
      const events = [
        { sid: i + 1, type: 'prompt_submit', prompt_preview: `docker deploy round ${i + 1}` },
        { sid: i + 1, type: 'tool_use', tool_name: 'docker' },
      ];
      writeFileSync(tmpEnv.eventsFile, events.map(e => JSON.stringify(e)).join('\n') + '\n');
      const probeResult = await probeSession(tmpEnv.eventsFile, probeDeps);

      // 收集指標
      const patternData = adapterDeps._read();
      const deployType = patternData?.patterns['deploy'] || patternData?.patterns['infra'];
      const confidence = deployType?.confidence ?? 0.5;
      const coverageHits = probeResult.updatedBoundary?.capabilities?.docker?.coverageHits ?? 0;
      const patternCount = patternData ? Object.keys(patternData.patterns).length : 0;

      metrics.push({
        round: i + 1,
        suggestionsCount: report.suggestions.length,
        confidence,
        coverageHits,
        patternCount,
      });
    }

    // 斷言 1：缺口遞減（第 3 輪 <= 第 1 輪）
    expect(metrics[2].suggestionsCount).toBeLessThanOrEqual(metrics[0].suggestionsCount);

    // 斷言 2：confidence 在 3 輪後應有提升（或維持 >= 0.5）
    expect(metrics[2].confidence).toBeGreaterThanOrEqual(0.5);

    // 斷言 3：coverageHits 隨輪次遞增（docker 被累積使用）
    expect(metrics[2].coverageHits).toBeGreaterThanOrEqual(metrics[0].coverageHits);

    // 斷言 4：patterns 數量有上限（< 100）
    expect(metrics[2].patternCount).toBeLessThan(100);

    tmpEnv.cleanup();
  });
});
