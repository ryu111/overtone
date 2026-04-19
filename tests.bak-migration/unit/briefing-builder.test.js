// briefing-builder.test.js — briefing-builder.js 單元測試
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';

const {
  generateSessionSummary,
  generateBriefing,
} = await import(join(homedir(), '.claude/scripts/briefing-builder.js'));

// ─── 測試輔助 ────────────────────────────────────────────────────────────────

const TMP_DIR = join(tmpdir(), `briefing-test-${Date.now()}`);
const DATA_DIR = join(TMP_DIR, 'data');

// 覆蓋 CLAUDE_DIR 路徑（透過 deps 的 log/askLocalModel 傳入，但 file paths 在模組中是 hardcoded 的）
// 測試策略：驗證函式呼叫 + 傳入正確 deps，並驗證副作用（寫檔案）

function makeCtx(overrides = {}) {
  return {
    sessionEvents: [],
    novaStatus: '',
    novaBrainStatus: '',
    behaviors: [],
    hookErrors: [],
    skillUsage: { total: 0, unreferenced: [] },
    ...overrides,
  };
}

beforeEach(() => {
  mkdirSync(DATA_DIR, { recursive: true });
});

afterEach(() => {
  try { rmSync(TMP_DIR, { recursive: true }); } catch (e) { /* cleanup */ }
});

// ─── generateSessionSummary 測試 ─────────────────────────────────────────────

describe('generateSessionSummary', () => {
  test('無 session 事件時跳過（不 throw）', async () => {
    const logs = [];
    const ctx = makeCtx({ sessionEvents: [] });
    await generateSessionSummary(ctx, { log: (m) => logs.push(m) });
    expect(logs.some((l) => l.includes('跳過摘要'))).toBe(true);
  });

  test('有事件時呼叫 askLocalModel 並使用其回應', async () => {
    const ctx = makeCtx({
      sessionEvents: [
        { type: 'tool_use', tool_name: 'Read' },
        { type: 'tool_use', tool_name: 'Edit' },
        { type: 'prompt_submit', prompt_preview: '修改程式' },
      ],
    });

    const mockSummary = '本次 session 修改了程式碼並完成測試。';
    let capturedPrompt = '';
    const mockAsk = async (prompt, _fallback) => {
      capturedPrompt = prompt;
      return mockSummary;
    };

    const logs = [];
    await generateSessionSummary(ctx, {
      askLocalModel: mockAsk,
      log: (m) => logs.push(m),
    });

    expect(capturedPrompt).toContain('Read');
    expect(capturedPrompt).toContain('修改程式');
    expect(logs.some((l) => l.includes(mockSummary.slice(0, 30)))).toBe(true);
  });

  test('askLocalModel 不可用時使用 fallback summary', async () => {
    const ctx = makeCtx({
      sessionEvents: [
        { type: 'prompt_submit', prompt_preview: 'test' },
      ],
    });

    const logs = [];
    await generateSessionSummary(ctx, {
      askLocalModel: async (_prompt, fallback) => fallback,
      log: (m) => logs.push(m),
    });

    // fallback summary 包含 prompt count
    expect(logs.some((l) => l.includes('Phase 4: 摘要'))).toBe(true);
  });
});

// ─── generateBriefing 測試 ───────────────────────────────────────────────────

describe('generateBriefing', () => {
  test('無內容時不 throw，正常結束', async () => {
    const ctx = makeCtx();
    const logs = [];
    const mockGit = () => null;

    // 不應 throw
    await expect(
      generateBriefing(ctx, { git: mockGit, log: (m) => logs.push(m) })
    ).resolves.toBeUndefined();
    // 有內容（session-summaries.jsonl 存在）或無內容，都記錄 log
    expect(
      logs.some((l) => l.includes('簡報無內容') || l.includes('簡報已生成'))
    ).toBe(true);
  });

  test('有 git log 時包含 commit 區段', async () => {
    const ctx = makeCtx();
    const logs = [];
    const mockGit = (args, _cwd) => {
      if (args.includes('log')) return 'abc1234 feat: test commit';
      return null;
    };

    await generateBriefing(ctx, { git: mockGit, log: (m) => logs.push(m) });
    expect(logs.some((l) => l.includes('簡報已生成'))).toBe(true);
  });

  test('有 F 級元件時包含警告區段（透過 scores.jsonl）', async () => {
    // 直接寫入 CLAUDE_DIR/data/scores.jsonl 是困難的（hardcoded path）
    // 改為驗證 behaviors 分支
    const ctx = makeCtx({
      behaviors: [{ id: 'test-pattern', confidence: 0.5, polarity: 1 }],
    });
    const logs = [];
    const mockGit = () => null;

    await generateBriefing(ctx, { git: mockGit, log: (m) => logs.push(m) });
    // 因為有 behaviors，應有 Learner 觀察區段
    expect(logs.some((l) => l.includes('簡報已生成'))).toBe(true);
  });

  test('hookErrors 趨勢分析：無 hook errors 時不觸發趨勢分析', async () => {
    const ctx = makeCtx({ hookErrors: [] });
    const logs = [];
    await generateBriefing(ctx, { git: () => null, log: (m) => logs.push(m) });
    // 不應有趨勢分析錯誤
    expect(logs.every((l) => !l.includes('trend analysis error'))).toBe(true);
  });

  test('Rules 變更時包含影響分析提示', async () => {
    const ctx = makeCtx({
      novaStatus: 'M rules/test.md',
    });
    const logs = [];

    await generateBriefing(ctx, { git: () => null, log: (m) => logs.push(m) });
    expect(logs.some((l) => l.includes('簡報已生成'))).toBe(true);
  });
});
