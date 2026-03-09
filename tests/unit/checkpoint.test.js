'use strict';
const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } = require('fs');
const path = require('path');
const os = require('os');

const paths = require(path.join(os.homedir(), '.claude/scripts/lib/paths'));
const { extractHandoff } = require(path.join(os.homedir(), '.claude/scripts/lib/hook-utils'));
const { _loadHandoffContext } = require(path.join(os.homedir(), '.claude/scripts/lib/pre-compact-handler'));

// ── 測試用 session ID ──
const TEST_SESSION = 'ckpt-test-' + Date.now();

beforeEach(() => {
  mkdirSync(paths.sessionDir(TEST_SESSION), { recursive: true });
});

afterEach(() => {
  try { rmSync(paths.sessionDir(TEST_SESSION), { recursive: true, force: true }); } catch {}
});

// ══════════════════════════════════════════════════════════════════════════
// paths.js — handoff 路徑 helpers
// ══════════════════════════════════════════════════════════════════════════

describe('paths.session.handoff', () => {
  it('產生正確的 handoff 檔案路徑', () => {
    const p = paths.session.handoff('abc', 'DEV');
    expect(p).toContain('sessions/abc/handoffs/DEV.md');
  });

  it('冒號替換為底線（TEST:2 → TEST_2）', () => {
    const p = paths.session.handoff('abc', 'TEST:2');
    expect(p).toContain('TEST_2.md');
    expect(p).not.toContain(':');
  });

  it('handoffsDir 回傳目錄路徑', () => {
    const d = paths.session.handoffsDir('abc');
    expect(d).toContain('sessions/abc/handoffs');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// extractHandoff — Handoff 文字提取
// ══════════════════════════════════════════════════════════════════════════

describe('extractHandoff', () => {
  it('提取標準 HANDOFF 區塊', () => {
    const output = `一些前置內容。

## HANDOFF: architect → developer

### Context
設計了三層架構。

### Findings
所有介面定義完成。

### Files Modified
- src/index.ts — 新建

### Open Questions
（無）`;

    const result = extractHandoff(output);
    expect(result).toContain('## HANDOFF: architect → developer');
    expect(result).toContain('### Context');
    expect(result).toContain('設計了三層架構');
    expect(result).not.toContain('一些前置內容');
  });

  it('無 HANDOFF 標記時 fallback 取最後 N 字元', () => {
    const output = 'A'.repeat(3000);
    const result = extractHandoff(output, { fallbackLength: 500 });
    expect(result.length).toBe(500);
  });

  it('空輸入回傳 null', () => {
    expect(extractHandoff('')).toBeNull();
    expect(extractHandoff(null)).toBeNull();
    expect(extractHandoff(undefined)).toBeNull();
  });

  it('短輸出無 HANDOFF 標記時回傳原文', () => {
    const output = '簡短的 agent 輸出';
    expect(extractHandoff(output)).toBe(output);
  });

  it('超長 HANDOFF 截斷保留 Context + Findings', () => {
    const output = `## HANDOFF: dev → reviewer

### Context
做了很多事。

### Findings
${'很多發現。'.repeat(500)}

### Files Modified
${'- file.ts — 修改\n'.repeat(100)}

### Open Questions
（無）`;

    const result = extractHandoff(output, { maxLength: 500 });
    expect(result).toContain('### Context');
    expect(result).toContain('截斷');
    expect(result.length).toBeLessThan(output.length);
  });

  it('HANDOFF 後有同級標題時截斷', () => {
    const output = `## HANDOFF: a → b

### Context
內容

## 其他章節

不相關內容`;

    const result = extractHandoff(output);
    expect(result).toContain('## HANDOFF: a → b');
    expect(result).not.toContain('其他章節');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// _loadHandoffContext — Handoff 載入
// ══════════════════════════════════════════════════════════════════════════

describe('_loadHandoffContext', () => {
  it('無 handoffs 目錄時回傳 null', () => {
    const state = { stages: { DEV: { status: 'active' } }, currentStage: 'DEV' };
    expect(_loadHandoffContext(TEST_SESSION, null, state)).toBeNull();
  });

  it('載入最近完成 stage 的 handoff', () => {
    // 建立 handoff 檔案
    const handoffsDir = paths.session.handoffsDir(TEST_SESSION);
    mkdirSync(handoffsDir, { recursive: true });
    writeFileSync(paths.session.handoff(TEST_SESSION, 'ARCH'), '## HANDOFF: architect → developer\n\n### Context\n架構設計完成。');

    const state = {
      currentStage: 'DEV',
      stages: {
        ARCH: { status: 'completed', result: 'pass', completedAt: '2026-01-01T00:00:00Z' },
        DEV: { status: 'active' },
      },
    };

    const result = _loadHandoffContext(TEST_SESSION, null, state);
    expect(result).toContain('架構設計完成');
  });

  it('只載入最近 2 個已完成 stage', () => {
    const handoffsDir = paths.session.handoffsDir(TEST_SESSION);
    mkdirSync(handoffsDir, { recursive: true });
    writeFileSync(paths.session.handoff(TEST_SESSION, 'PLAN'), 'PLAN handoff');
    writeFileSync(paths.session.handoff(TEST_SESSION, 'ARCH'), 'ARCH handoff');
    writeFileSync(paths.session.handoff(TEST_SESSION, 'TEST'), 'TEST handoff');

    const state = {
      currentStage: 'DEV',
      stages: {
        PLAN: { status: 'completed', result: 'pass', completedAt: '2026-01-01T00:00:00Z' },
        ARCH: { status: 'completed', result: 'pass', completedAt: '2026-01-01T01:00:00Z' },
        TEST: { status: 'completed', result: 'pass', completedAt: '2026-01-01T02:00:00Z' },
        DEV: { status: 'active' },
      },
    };

    const result = _loadHandoffContext(TEST_SESSION, null, state);
    // 最近 2 個 = ARCH + TEST
    expect(result).toContain('ARCH handoff');
    expect(result).toContain('TEST handoff');
    expect(result).not.toContain('PLAN handoff');
  });

  it('fail 的 stage 不載入', () => {
    const handoffsDir = paths.session.handoffsDir(TEST_SESSION);
    mkdirSync(handoffsDir, { recursive: true });
    writeFileSync(paths.session.handoff(TEST_SESSION, 'TEST'), 'TEST failed handoff');

    const state = {
      currentStage: 'DEV',
      stages: {
        TEST: { status: 'completed', result: 'fail', completedAt: '2026-01-01T00:00:00Z' },
        DEV: { status: 'active' },
      },
    };

    const result = _loadHandoffContext(TEST_SESSION, null, state);
    expect(result).toBeNull();
  });

  it('handoff 檔案損壞時靜默跳過', () => {
    const handoffsDir = paths.session.handoffsDir(TEST_SESSION);
    mkdirSync(handoffsDir, { recursive: true });
    // 寫一個空檔案
    writeFileSync(paths.session.handoff(TEST_SESSION, 'ARCH'), '');

    const state = {
      currentStage: 'DEV',
      stages: {
        ARCH: { status: 'completed', result: 'pass', completedAt: '2026-01-01T00:00:00Z' },
        DEV: { status: 'active' },
      },
    };

    // 不應該拋錯
    expect(() => _loadHandoffContext(TEST_SESSION, null, state)).not.toThrow();
  });
});
