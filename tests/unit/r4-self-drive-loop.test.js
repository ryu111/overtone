// r4-self-drive-loop.test.js — R4 自驅閉環端到端整合測試
// 驗證 R4 完成標準的 5 個閉環能力，全部使用 mock，不觸碰真實外部系統
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

const { discoverGaps, syncToNotion } = await import(join(homedir(), '.claude/scripts/gap-discovery.js'));
const { probeSession } = await import(join(homedir(), '.claude/scripts/capability-probe.js'));
const { planForTask, recordOutcome, lookupPattern } = await import(join(homedir(), '.claude/scripts/task-adapter.js'));
const { poll, executeTask, readState, writeState, isImprovementTask, computeDelta, snapshotBoundary, updateImprovementRecord } = await import(join(homedir(), '.claude/scripts/heartbeat.js'));

// ─── 共用 Mock 資料 ───────────────────────────────────────────────────────────

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

// ─── in-memory FS helper（與 task-adapter.test.js 一致） ────────────────────

function makeMemoryDeps(initialData = null) {
  const store = new Map();
  const patternsFile = join(tmpdir(), `r4-e2e-patterns-${Date.now()}.json`);
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

// ─── 能力 1：發現自身能力缺口 ──────────────────────────────────────────────────

describe('R4 E2E: 能力 1 — 發現自身能力缺口', () => {
  test('gap-analyzer → gap-discovery 4 源聚合 → 排序建議', async () => {
    const mockData = {
      gaps: MOCK_GAPS,
      weakCaps: MOCK_WEAK_CAPS,
      scores: MOCK_SCORES,
      roadmapContent: MOCK_ROADMAP,
    };

    const report = await discoverGaps({ _mock: mockData, skipNotion: true });

    // 非空 suggestions
    expect(report.suggestions.length).toBeGreaterThan(0);

    // 無 warnings（所有源都成功）
    expect(report.warnings).toEqual([]);

    // 所有 4 源都被使用
    expect(report.metadata.sourcesUsed).toHaveLength(4);

    // 按 score 降序排列
    const scores = report.suggestions.map((s) => s.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }

    // 每個 suggestion 有必要欄位
    for (const s of report.suggestions) {
      expect(s.id).toBeDefined();
      expect(s.title).toBeDefined();
      expect(s.confidence).toBeGreaterThan(0);
      expect(s.sources.length).toBeGreaterThan(0);
    }
  });

  test('部分源失敗仍回傳結果', async () => {
    const badMock = {
      gaps: null,           // gap-analyzer 失敗
      weakCaps: MOCK_WEAK_CAPS,
      scores: undefined,    // scores 失敗
      roadmapContent: MOCK_ROADMAP,
    };

    const report = await discoverGaps({
      _mock: badMock,
      skipNotion: true,
      sources: ['gap-analyzer', 'capability-probe', 'scores', 'roadmap'],
    });

    // 仍有 suggestions（來自成功的源）
    expect(report.suggestions.length).toBeGreaterThan(0);

    // 至少有一個 suggestion 來自 capability-probe 或 roadmap
    const allSources = report.suggestions.flatMap((s) => s.sources);
    const hasValidSource = allSources.some(
      (src) => src === 'capability-probe' || src === 'roadmap'
    );
    expect(hasValidSource).toBe(true);
  });
});

// ─── 能力 2：生成建議並評估價值 ────────────────────────────────────────────────

describe('R4 E2E: 能力 2 — 生成建議並評估價值', () => {
  test('discoverGaps → syncToNotion 完整鏈路：建立 + 跳過 + 過濾', async () => {
    const mockData = {
      gaps: MOCK_GAPS,
      weakCaps: MOCK_WEAK_CAPS,
      scores: MOCK_SCORES,
      roadmapContent: MOCK_ROADMAP,
    };

    // 先取得 suggestions
    const report = await discoverGaps({ _mock: mockData, skipNotion: true });
    expect(report.suggestions.length).toBeGreaterThan(0);

    // 分離高低信心 suggestions
    const highConfidence = report.suggestions.filter((s) => s.confidence >= 40);
    const lowConfidence = report.suggestions.filter((s) => s.confidence < 40);

    // syncToNotion：追蹤建立次數
    const created = [];
    const _deps = {
      createTask: async (title) => {
        created.push(title);
        return { id: `notion-${Date.now()}` };
      },
    };

    const result = await syncToNotion(report.suggestions, {}, _deps);

    // 高信心應被建立，低信心應被跳過
    expect(result.created).toBe(highConfidence.length);
    expect(result.skipped).toBe(lowConfidence.length);
    expect(result.failed).toBe(0);
    expect(created.length).toBe(highConfidence.length);
  });

  test('全部低信心 → 零建立', async () => {
    // 所有 suggestions confidence < 40
    const lowConfidenceSuggestions = [
      { title: '低信心任務 A', description: '描述 A', confidence: 20, suggestedPriority: 'P3' },
      { title: '低信心任務 B', description: '描述 B', confidence: 30, suggestedPriority: 'P3' },
    ];

    const _deps = {
      createTask: async () => { throw new Error('不應被呼叫'); },
    };

    const result = await syncToNotion(lowConfidenceSuggestions, {}, _deps);

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.failed).toBe(0);
  });
});

// ─── 能力 3：自主執行改善 ──────────────────────────────────────────────────────

describe('R4 E2E: 能力 3 — 自主執行改善', () => {
  const TMP_DIR = join(tmpdir(), `r4-e2e-heartbeat-${Date.now()}`);
  const STATE_FILE = join(TMP_DIR, 'heartbeat-state.json');
  const SUMMARY_FILE = join(TMP_DIR, 'session-summaries.jsonl');

  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(TMP_DIR, { recursive: true }); } catch (e) { /* cleanup */ }
  });

  test('heartbeat poll → claim → executeTask → complete 完整生命週期', async () => {
    const claimedIds = [];
    const completedIds = [];

    // poll deps
    const pollDeps = {
      listTasks: async () => MOCK_NOTION_TASKS,
      claimTask: async (id) => { claimedIds.push(id); },
    };

    // 執行 poll
    const pollResult = await poll({ _stateFile: STATE_FILE }, pollDeps);
    expect(pollResult.action).toBe('execute');
    expect(pollResult.task).toBeDefined();
    expect(claimedIds).toHaveLength(1);

    // 驗證 state 更新（activeTask 設定）
    const stateAfterPoll = readState(STATE_FILE);
    expect(stateAfterPoll.activeTask).not.toBeNull();
    expect(stateAfterPoll.consecutiveFailures).toBe(0);

    // executeTask deps：模擬成功的 spawnSession
    const execDeps = {
      spawnSession: (_prompt, _opts) => ({
        ok: true,
        outcome: Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ success: true, result: '任務完成', sessionId: 'test-session-1' }),
          duration: 500,
        }),
      }),
      completeTask: async (id, _msg) => { completedIds.push(id); },
      summaryFile: SUMMARY_FILE,
    };

    const task = pollResult.task;
    const execResult = await executeTask(task, { _stateFile: STATE_FILE, maxRetries: 0 }, execDeps);

    // 驗證成功
    expect(execResult.status).toBe('success');
    expect(completedIds).toHaveLength(1);

    // 驗證 state 清除 activeTask
    const stateAfterExec = readState(STATE_FILE);
    expect(stateAfterExec.activeTask).toBeNull();

    // 驗證 summary 寫入
    expect(existsSync(SUMMARY_FILE)).toBe(true);
    const summaryRaw = readFileSync(SUMMARY_FILE, 'utf-8').trim();
    const summaryEntry = JSON.parse(summaryRaw);
    expect(summaryEntry.status).toBe('success');
    expect(summaryEntry.source).toBe('heartbeat');
  });

  test('session 失敗 → state 恢復 + task reset', async () => {
    const resetIds = [];

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
      resetTask: async (id, _msg) => { resetIds.push(id); },
      summaryFile: SUMMARY_FILE,
    };

    // 先設定 activeTask state
    writeState({ running: true, activeTask: { id: 'notion-page-id', name: '測試任務', claimedAt: new Date().toISOString() }, consecutiveFailures: 0, paused: false, lastPoll: null, pid: null, startedAt: null }, STATE_FILE);

    const task = MOCK_NOTION_TASKS[0];
    const execResult = await executeTask(task, { _stateFile: STATE_FILE, maxRetries: 0 }, execDeps);

    // 驗證失敗回傳
    expect(execResult.status).toBe('failed');

    // 驗證 state activeTask 清除
    const stateAfterFail = readState(STATE_FILE);
    expect(stateAfterFail.activeTask).toBeNull();

    // 驗證 resetTask 被呼叫
    expect(resetIds).toHaveLength(1);
  });
});

// ─── 能力 4：驗證改善效果 ──────────────────────────────────────────────────────

describe('R4 E2E: 能力 4 — 驗證改善效果', () => {
  const TMP_DIR = join(tmpdir(), `r4-e2e-probe-${Date.now()}`);
  const DATA_DIR = join(TMP_DIR, 'data');
  const BOUNDARY_FILE = join(DATA_DIR, 'capability-boundary.json');
  const IMPROVEMENTS_FILE = join(DATA_DIR, 'improvements.jsonl');
  const EVENTS_FILE = join(TMP_DIR, 'flow-events.jsonl');

  function makeDeps(overrides = {}) {
    return {
      boundaryFile: BOUNDARY_FILE,
      dataDir: DATA_DIR,
      improvementsFile: IMPROVEMENTS_FILE,
      existsSync,
      readFileSync,
      appendFileSync: (path, data) => { appendFileSync(path, data); },
      mkdirSync,
      writeFileSync,
      ...overrides,
    };
  }

  beforeEach(() => {
    mkdirSync(DATA_DIR, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(TMP_DIR, { recursive: true }); } catch (e) { /* cleanup */ }
  });

  test('capability-probe 多 session 累積 → 門檻觸發 improvements', async () => {
    // 預先寫入已有 2 次 missingHits 的 boundary（再加 1 即觸發門檻 3）
    const initialBoundary = {
      version: 1,
      capabilities: {
        'web-scraping': {
          coverageHits: 0,
          missingHits: 2,
          lastSeen: new Date().toISOString().slice(0, 10),
          strength: 'missing',
        },
      },
      sessions: { total: 5, withGaps: 2, lastAnalyzed: null },
    };
    writeFileSync(BOUNDARY_FILE, JSON.stringify(initialBoundary));

    // 寫入一次觸碰 web-scraping 的 events
    const events = [
      { sid: 1, type: 'prompt_submit', prompt_preview: 'scrape website data' },
      { sid: 1, type: 'tool_use', tool_name: 'curl' },
    ];
    writeFileSync(EVENTS_FILE, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

    const deps = makeDeps({
      matchTools: async () => ({
        recommended: [{ id: 'curl', name: 'curl' }],
        missing: ['web-scraping'],
      }),
    });

    const result = await probeSession(EVENTS_FILE, deps);

    // 門檻觸發（missingHits 達到 3）
    expect(result.triggeredImprovements.length).toBeGreaterThanOrEqual(1);
    expect(result.triggeredImprovements[0].capability).toBe('web-scraping');
    expect(result.triggeredImprovements[0].source).toBe('capability-probe');

    // improvements.jsonl 已寫入
    expect(existsSync(IMPROVEMENTS_FILE)).toBe(true);
    const raw = readFileSync(IMPROVEMENTS_FILE, 'utf-8').trim();
    const entry = JSON.parse(raw);
    expect(entry.type).toBe('capability-gap');
    expect(entry.capability).toBe('web-scraping');
  });

  test('boundary 衰減 + 重新計算 strength', async () => {
    // 初始 boundary：git 是 strong
    const initialBoundary = {
      version: 1,
      capabilities: {
        git: { coverageHits: 5, missingHits: 0, strength: 'strong', lastSeen: new Date().toISOString().slice(0, 10) },
      },
      sessions: { total: 10, withGaps: 0, lastAnalyzed: null },
    };
    writeFileSync(BOUNDARY_FILE, JSON.stringify(initialBoundary));

    // probeSession：無缺口，git 被再次使用 → coverageHits +1
    const events = [
      { sid: 2, type: 'prompt_submit', prompt_preview: 'git commit 提交' },
      { sid: 2, type: 'tool_use', tool_name: 'git' },
    ];
    writeFileSync(EVENTS_FILE, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

    const deps = makeDeps({
      matchTools: async () => ({
        recommended: [{ id: 'git', name: 'git' }],
        missing: [],
      }),
    });

    const result = await probeSession(EVENTS_FILE, deps);

    // coverageHits 增加
    expect(result.updatedBoundary.capabilities.git.coverageHits).toBeGreaterThanOrEqual(6);
    // strength 仍是 strong
    expect(result.updatedBoundary.capabilities.git.strength).toBe('strong');
    // 沒有 improvements 觸發
    expect(result.triggeredImprovements).toEqual([]);
  });

  describe('改善效果驗證純函式', () => {
    test('isImprovementTask 識別 [自驅] 前綴', () => {
      expect(isImprovementTask('[自驅] 建立 docker Skill')).toBe(true);
      expect(isImprovementTask('修復 bug')).toBe(false);
      expect(isImprovementTask('')).toBe(false);
      expect(isImprovementTask(null)).toBe(false);
      expect(isImprovementTask(undefined)).toBe(false);
    });

    test('computeDelta 正確計算 strengthUpgrades', () => {
      const before = { capabilities: { docker: { strength: 'missing', coverageHits: 0, missingHits: 5 } } };
      const after = { capabilities: { docker: { strength: 'weak', coverageHits: 1, missingHits: 5 } } };
      const delta = computeDelta(before, after);
      expect(delta.strengthUpgrades).toBe(1);
      expect(delta.capabilitiesChanged).toBe(1);
      expect(delta.totalCoverageGain).toBe(1);
      expect(delta.totalMissingReduction).toBe(0);
    });

    test('computeDelta 正確處理新增能力', () => {
      const before = { capabilities: {} };
      const after = { capabilities: { newCap: { strength: 'weak', coverageHits: 2, missingHits: 1 } } };
      const delta = computeDelta(before, after);
      expect(delta.capabilitiesChanged).toBe(1);
      expect(delta.strengthUpgrades).toBe(1); // missing(0) → weak(1)
      expect(delta.totalCoverageGain).toBe(2);
    });

    test('computeDelta before/after 相同 → delta 全為 0', () => {
      const snapshot = { capabilities: { git: { strength: 'strong', coverageHits: 5, missingHits: 0 } } };
      const delta = computeDelta(snapshot, snapshot);
      expect(delta.capabilitiesChanged).toBe(0);
      expect(delta.strengthUpgrades).toBe(0);
      expect(delta.totalCoverageGain).toBe(0);
      expect(delta.totalMissingReduction).toBe(0);
    });
  });

  test('改善任務完整閉環：before/after snapshot + delta + improvements 回寫', async () => {
    // 1. 寫入 initial boundary（docker: missing）
    const initialBoundary = {
      version: 1,
      capabilities: {
        docker: { coverageHits: 0, missingHits: 5, strength: 'missing', lastSeen: '2026-03-16' },
      },
      sessions: { total: 5, withGaps: 3, lastAnalyzed: null },
    };
    writeFileSync(BOUNDARY_FILE, JSON.stringify(initialBoundary));

    // 2. 寫入 improvements.jsonl（docker 建議）
    const improvementEntry = {
      date: '2026-03-16',
      source: 'capability-probe',
      type: 'capability-gap',
      capability: 'docker',
      missingHits: 5,
      strength: 'missing',
      suggestion: '建立 docker 相關 Skill 或工具',
    };
    writeFileSync(IMPROVEMENTS_FILE, JSON.stringify(improvementEntry) + '\n');

    // 3. 準備 "改善後" 的 boundary（模擬 session 結束後 capability-probe 更新了 boundary）
    const improvedBoundary = {
      version: 1,
      capabilities: {
        docker: { coverageHits: 1, missingHits: 5, strength: 'weak', lastSeen: '2026-03-17' },
      },
      sessions: { total: 6, withGaps: 3, lastAnalyzed: new Date().toISOString() },
    };

    let spawnCallCount = 0;
    const SUMMARY_FILE = join(TMP_DIR, 'session-summaries.jsonl');

    const execDeps = {
      spawnSession: (_prompt, _opts) => {
        spawnCallCount++;
        // 模擬 session 完成後 boundary 被 capability-probe 更新
        writeFileSync(BOUNDARY_FILE, JSON.stringify(improvedBoundary));
        return {
          ok: true,
          outcome: Promise.resolve({
            exitCode: 0,
            stdout: JSON.stringify({ success: true, result: 'docker skill created', sessionId: 'test-improve-1' }),
            duration: 300,
          }),
        };
      },
      completeTask: async () => {},
      summaryFile: SUMMARY_FILE,
      boundaryFile: BOUNDARY_FILE,
      improvementsFile: IMPROVEMENTS_FILE,
      existsSync,
      readFileSync,
      writeFileSync,
    };

    const task = { id: 'notion-improve-1', name: '[自驅] 建立 docker 相關 Skill 或工具', priority: 'P1' };
    const execResult = await executeTask(task, { _stateFile: join(TMP_DIR, 'hb-state.json'), maxRetries: 0 }, execDeps);

    // 驗證成功
    expect(execResult.status).toBe('success');

    // 驗證 session-summaries 含 improvement 欄位
    const summaryRaw = readFileSync(SUMMARY_FILE, 'utf-8').trim();
    const summary = JSON.parse(summaryRaw);
    expect(summary.improvement).not.toBeNull();
    expect(summary.improvement.target).toBe('建立 docker 相關 Skill 或工具');
    expect(summary.improvement.delta.strengthUpgrades).toBe(1);
    expect(summary.improvement.delta.totalCoverageGain).toBe(1);

    // 驗證 improvements.jsonl 被回寫
    const impRaw = readFileSync(IMPROVEMENTS_FILE, 'utf-8').trim();
    const impEntry = JSON.parse(impRaw);
    expect(impEntry.executionResult).toBe('success');
    expect(impEntry.executedAt).toBeDefined();
    expect(impEntry.delta.strengthUpgrades).toBe(1);
  });

  test('非改善任務 → improvement 為 null', async () => {
    const SUMMARY_FILE = join(TMP_DIR, 'session-summaries-normal.jsonl');

    const execDeps = {
      spawnSession: () => ({
        ok: true,
        outcome: Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ success: true, result: 'done', sessionId: 'test-normal-1' }),
          duration: 100,
        }),
      }),
      completeTask: async () => {},
      summaryFile: SUMMARY_FILE,
    };

    const task = { id: 'notion-normal-1', name: '修復 bug', priority: 'P2' };
    const execResult = await executeTask(task, { _stateFile: join(TMP_DIR, 'hb-state-normal.json'), maxRetries: 0 }, execDeps);

    expect(execResult.status).toBe('success');

    const summaryRaw = readFileSync(SUMMARY_FILE, 'utf-8').trim();
    const summary = JSON.parse(summaryRaw);
    // 非改善任務不應有 improvement，或為 null
    expect(summary.improvement || null).toBeNull();
  });

  test('改善任務失敗 → improvements 標記 failed', async () => {
    // 寫入 boundary
    const boundary = {
      version: 1,
      capabilities: { k8s: { coverageHits: 0, missingHits: 4, strength: 'missing', lastSeen: '2026-03-16' } },
      sessions: { total: 3, withGaps: 2, lastAnalyzed: null },
    };
    writeFileSync(BOUNDARY_FILE, JSON.stringify(boundary));

    // 寫入 improvements
    const impEntry = {
      date: '2026-03-16', source: 'capability-probe', type: 'capability-gap',
      capability: 'k8s', missingHits: 4, strength: 'missing',
      suggestion: '建立 k8s 相關 Skill 或工具',
    };
    writeFileSync(IMPROVEMENTS_FILE, JSON.stringify(impEntry) + '\n');

    const SUMMARY_FILE = join(TMP_DIR, 'session-summaries-fail.jsonl');

    const execDeps = {
      spawnSession: () => ({
        ok: true,
        outcome: Promise.resolve({
          exitCode: 1,
          stdout: JSON.stringify({ success: false, error: 'session failed' }),
          duration: 50,
        }),
      }),
      completeTask: async () => { throw new Error('不應呼叫'); },
      resetTask: async () => {},
      summaryFile: SUMMARY_FILE,
      boundaryFile: BOUNDARY_FILE,
      improvementsFile: IMPROVEMENTS_FILE,
      existsSync,
      readFileSync,
      writeFileSync,
    };

    const task = { id: 'notion-fail-1', name: '[自驅] 建立 k8s 相關 Skill 或工具', priority: 'P1' };
    const execResult = await executeTask(task, { _stateFile: join(TMP_DIR, 'hb-state-fail.json'), maxRetries: 0 }, execDeps);

    expect(execResult.status).toBe('failed');

    // improvements 被標記 failed
    const impRaw = readFileSync(IMPROVEMENTS_FILE, 'utf-8').trim();
    const imp = JSON.parse(impRaw);
    expect(imp.executionResult).toBe('failed');
    expect(imp.executedAt).toBeDefined();
  });
});

// ─── 能力 5：適應未知任務類型 ──────────────────────────────────────────────────

describe('R4 E2E: 能力 5 — 適應未知任務類型', () => {
  test('未知任務 → exploration → recordOutcome → 再次查詢 → pattern 複用', async () => {
    const deps = makeMemoryDeps();

    // 注入 matchTools 與 suggestDepth mock
    deps.matchTools = async () => ({
      recommended: [{ id: 'bash', name: 'Bash' }, { id: 'git', name: 'git' }],
      missing: [],
    });
    deps.suggestDepth = () => ({ depth: 'D2', reason: 'test' });

    // 第一次：未知任務 → exploration
    const firstPlan = await planForTask('修復前端 CSS 排版問題 ui', {}, deps);
    expect(firstPlan.source).toBe('exploration');
    expect(firstPlan.tools.length).toBeGreaterThan(0);

    // recordOutcome：記錄成功
    recordOutcome('修復前端 CSS 排版問題 ui', firstPlan.tools, firstPlan.depth, true, 120, deps);

    // 驗證 pattern 已儲存
    const storedData = deps._read();
    expect(storedData).not.toBeNull();
    expect(Object.keys(storedData.patterns).length).toBeGreaterThan(0);

    // 第二次查詢：lookupPattern 找到模式
    const lookedUp = lookupPattern('修復前端 CSS 排版問題 ui', deps);
    expect(lookedUp).not.toBeNull();
    expect(lookedUp.confidence).toBeGreaterThanOrEqual(0.6);

    // 第二次 planForTask：source 應為 pattern
    const secondPlan = await planForTask('修復前端 CSS 排版 ui', {}, deps);
    expect(secondPlan.source).toBe('pattern');
  });

  test('連續失敗 3 次 → PlanRecord 清除 → 退回 exploration', async () => {
    const deps = makeMemoryDeps();
    deps.matchTools = async () => ({
      recommended: [{ id: 'bash', name: 'Bash' }],
      missing: [],
    });
    deps.suggestDepth = () => ({ depth: 'D1', reason: 'test' });

    const taskDesc = 'fix bug in auth module';
    const tools = ['bash', 'editor'];
    const depth = 'D1';

    // 連續失敗 3 次
    recordOutcome(taskDesc, tools, depth, false, 0, deps);
    recordOutcome(taskDesc, tools, depth, false, 0, deps);
    recordOutcome(taskDesc, tools, depth, false, 0, deps);

    // PlanRecord 應被清除
    const data = deps._read();
    const plans = data.patterns['bug-fix']?.successfulPlans || [];
    const removedPlan = plans.find(
      (p) => p.depth === depth && JSON.stringify(p.tools.sort()) === JSON.stringify([...tools].sort())
    );
    expect(removedPlan).toBeUndefined();

    // 再次 planForTask：pattern confidence 大幅下降，應退回 exploration 或 fallback
    const nextPlan = await planForTask(taskDesc, {}, deps);
    // 連續失敗後 confidence 低，不應再回傳 pattern 來源（或回傳 fallback）
    const isNotPattern = nextPlan.source !== 'pattern' || nextPlan.source === 'fallback';
    expect(isNotPattern || nextPlan.source === 'exploration').toBe(true);
  });
});
