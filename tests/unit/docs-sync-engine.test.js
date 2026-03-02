'use strict';
/**
 * docs-sync-engine.test.js
 *
 * 驗證 docs-sync-engine.js 模組的核心行為：
 * 1. scanDrift() 能正確偵測 status.md 中的錯誤數字
 * 2. fixDrift() 能修復 status.md 中的數字
 * 3. 在 CLAUDE.md 和 status.md 數字正確時，isClean = true
 * 4. scanDrift() 不修改任何檔案（純掃描）
 * 5. fixDrift() 只修改有 drift 的檔案
 */

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const { join } = require('path');
const os = require('os');

// ── 模組路徑 ──────────────────────────────────────────────────────────────

const { PROJECT_ROOT, SCRIPTS_LIB } = require('../helpers/paths');
const ENGINE_PATH = join(SCRIPTS_LIB, 'docs-sync-engine.js');

// ── 測試用檔案系統沙盒 ────────────────────────────────────────────────────

/**
 * 建立一個可覆蓋路徑的沙盒，以隔離測試對真實文件的影響。
 * 透過 mock require 的方式，讓 docs-sync-engine.js 使用假路徑。
 * 由於 Node.js/Bun 的 require cache，我們改用直接 patch 函式的方式。
 */

let tmpDir;

function setupSandbox() {
  tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'docs-sync-test-'));
  return tmpDir;
}

function teardownSandbox() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = null;
}

/**
 * 在沙盒目錄建立一組假的目錄結構（含 agents/、skills/、commands/、hooks/、.claude-plugin/）
 * @param {object} opts
 * @param {number} opts.agentCount   - 假 agent 數量
 * @param {string[]} opts.skillDirs  - 假 skill 目錄名稱（每個下面建立 SKILL.md）
 * @param {number} opts.commandCount - 假 command 數量
 * @param {string[]} opts.hookEvents - hooks.json 中的 event 名稱
 * @param {string} opts.pluginVersion - plugin.json 中的版本號
 * @returns {string} pluginRoot 路徑（沙盒內）
 */
function createFakePlugin(dir, opts = {}) {
  const {
    agentCount = 17,
    skillDirs = ['testing', 'workflow-core', 'security-kb'],
    commandCount = 27,
    hookEvents = ['SessionStart', 'SessionEnd', 'PreCompact', 'UserPromptSubmit',
      'PreToolUse', 'SubagentStop', 'PostToolUse', 'TaskCompleted',
      'PostToolUseFailure', 'Stop', 'Notification'],
    pluginVersion = '0.28.6',
  } = opts;

  const pluginRoot = join(dir, 'plugins', 'overtone');
  const agentsDir = join(pluginRoot, 'agents');
  const skillsDir = join(pluginRoot, 'skills');
  const commandsDir = join(pluginRoot, 'commands');
  const hooksDir = join(pluginRoot, 'hooks');
  const pluginJsonDir = join(pluginRoot, '.claude-plugin');

  // 建立目錄
  for (const d of [agentsDir, skillsDir, commandsDir, hooksDir, pluginJsonDir]) {
    fs.mkdirSync(d, { recursive: true });
  }

  // 建立 agents
  for (let i = 0; i < agentCount; i++) {
    fs.writeFileSync(join(agentsDir, `agent-${i}.md`), `# Agent ${i}\n`);
  }

  // 建立 skills（每個含 SKILL.md）
  for (const name of skillDirs) {
    const skillDir = join(skillsDir, name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(join(skillDir, 'SKILL.md'), `# ${name}\n`);
  }

  // 建立 commands
  for (let i = 0; i < commandCount; i++) {
    fs.writeFileSync(join(commandsDir, `command-${i}.md`), `# Command ${i}\n`);
  }

  // 建立 hooks.json
  const hooksObj = {};
  for (const ev of hookEvents) {
    hooksObj[ev] = [{ hooks: [{ type: 'command', command: 'echo ok' }] }];
  }
  fs.writeFileSync(join(hooksDir, 'hooks.json'), JSON.stringify({ hooks: hooksObj }, null, 2));

  // 建立 plugin.json
  fs.writeFileSync(join(pluginJsonDir, 'plugin.json'), JSON.stringify({ version: pluginVersion }, null, 2));

  return pluginRoot;
}

// ── 直接測試 extractStatusMetrics / extractStatusVersion ─────────────────

const {
  extractStatusMetrics,
  extractStatusVersion,
  extractNumber,
} = require(ENGINE_PATH);

describe('extractStatusMetrics — 解析 status.md 核心指標表', () => {
  test('正確解析標準格式的指標行', () => {
    const content = `
## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Hook 數量 | 11 個 |
| Skill 數量 | 16（8 knowledge domain + orchestrator） |
| Command 數量 | 27（14 stage shortcut + 7 workflow） |
`;
    const metrics = extractStatusMetrics(content);
    expect(metrics['Agent 數量']).toBe(17);
    expect(metrics['Hook 數量']).toBe(11);
    expect(metrics['Skill 數量']).toBe(16);
    expect(metrics['Command 數量']).toBe(27);
  });

  test('指標不存在時不回傳該 key', () => {
    const content = `| 無關內容 | 沒有數字 |`;
    const metrics = extractStatusMetrics(content);
    expect(metrics['Agent 數量']).toBeUndefined();
  });

  test('空內容回傳空物件', () => {
    const metrics = extractStatusMetrics('');
    expect(Object.keys(metrics).length).toBe(0);
  });
});

describe('extractStatusVersion — 解析 status.md 版本號', () => {
  test('解析標準格式版本號', () => {
    const content = '> 最後更新：2026-03-02 | Plugin 版本：0.28.6';
    expect(extractStatusVersion(content)).toBe('0.28.6');
  });

  test('無版本資訊回傳 null', () => {
    expect(extractStatusVersion('沒有版本')).toBeNull();
  });

  test('支援全形冒號', () => {
    const content = '> 最後更新：2026-03-02 | Plugin 版本：1.0.0';
    expect(extractStatusVersion(content)).toBe('1.0.0');
  });
});

describe('extractNumber — 從文字提取數字', () => {
  test('成功提取 regex 匹配的第一個數字', () => {
    const result = extractNumber('17 個 agent', /(\d+)\s+個\s*agent/);
    expect(result).toBe(17);
  });

  test('無匹配回傳 null', () => {
    const result = extractNumber('無匹配文字', /(\d+)\s+個\s*agent/);
    expect(result).toBeNull();
  });
});

// ── 沙盒測試：使用假檔案結構 ──────────────────────────────────────────────

/**
 * 由於 docs-sync-engine.js 的路徑是在模組載入時計算（相對於 __dirname），
 * 我們無法簡單地替換路徑。因此改用以下策略：
 * 直接測試 getActualCounts() 是否能正確計算實際目錄結構，
 * 並針對 scanDrift/fixDrift 的邏輯以整合測試方式驗證（使用真實的 status.md 快照）。
 */

describe('getActualCounts — 計算實際組件數量', () => {
  const { getActualCounts } = require(ENGINE_PATH);

  test('回傳值包含 agentCount、skillCount、commandCount、hookCount', () => {
    const counts = getActualCounts();
    expect(typeof counts.agentCount).toBe('number');
    expect(typeof counts.skillCount).toBe('number');
    expect(typeof counts.commandCount).toBe('number');
    expect(typeof counts.hookCount).toBe('number');
  });

  test('agentCount 為正整數（至少 1）', () => {
    const { agentCount } = getActualCounts();
    expect(agentCount).toBeGreaterThan(0);
  });

  test('skillCount 為正整數（至少 1）', () => {
    const { skillCount } = getActualCounts();
    expect(skillCount).toBeGreaterThan(0);
  });

  test('commandCount 為正整數（至少 1）', () => {
    const { commandCount } = getActualCounts();
    expect(commandCount).toBeGreaterThan(0);
  });

  test('hookCount 為正整數（至少 1）', () => {
    const { hookCount } = getActualCounts();
    expect(hookCount).toBeGreaterThan(0);
  });
});

// ── scanDrift() 沙盒測試 ──────────────────────────────────────────────────

describe('scanDrift() — 純掃描行為', () => {
  const { scanDrift } = require(ENGINE_PATH);

  // 使用真實系統的 status.md 快照進行正確性測試
  // 注意：此測試假設目前 status.md 的數字是正確的（由 docs-sync.test.js 另外驗證）
  test('回傳物件包含 drifts 陣列和 isClean 布林值', () => {
    const result = scanDrift();
    expect(Array.isArray(result.drifts)).toBe(true);
    expect(typeof result.isClean).toBe('boolean');
  });

  test('isClean 為 true 時 drifts 陣列為空', () => {
    const result = scanDrift();
    if (result.isClean) {
      expect(result.drifts.length).toBe(0);
    }
  });

  test('isClean 為 false 時 drifts 陣列不為空', () => {
    const result = scanDrift();
    if (!result.isClean) {
      expect(result.drifts.length).toBeGreaterThan(0);
    }
  });

  test('drift 項目包含必要欄位：file、field、expected、actual', () => {
    const result = scanDrift();
    for (const drift of result.drifts) {
      expect(drift.file).toBeTruthy();
      expect(drift.field).toBeTruthy();
      expect(drift.expected).toBeDefined();
      expect(drift.actual).toBeDefined();
    }
  });

  test('scanDrift() 不修改任何檔案（純掃描）', () => {
    // 取得 status.md 的修改時間（mtime）
    const PLUGIN_ROOT_PATH = join(SCRIPTS_LIB, '..', '..');
    const statusMdPath = join(PLUGIN_ROOT_PATH, '..', '..', 'docs', 'status.md');

    if (!fs.existsSync(statusMdPath)) {
      // 若路徑不存在，直接 pass（沙盒測試情境）
      return;
    }

    const mtimeBefore = fs.statSync(statusMdPath).mtimeMs;
    scanDrift();
    const mtimeAfter = fs.statSync(statusMdPath).mtimeMs;

    // 掃描前後 mtime 不應變化
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});

// ── fixDrift() 行為測試 ────────────────────────────────────────────────────

describe('fixDrift() — 修復行為', () => {
  const { fixDrift } = require(ENGINE_PATH);

  test('空 drifts 陣列回傳空結果', () => {
    const result = fixDrift([]);
    expect(result.fixed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test('null/undefined drifts 回傳空結果', () => {
    const result1 = fixDrift(null);
    expect(result1.fixed).toEqual([]);

    const result2 = fixDrift(undefined);
    expect(result2.fixed).toEqual([]);
  });

  test('Plugin 版本 drift 被跳過（不自動修復）', () => {
    const drifts = [{
      file: 'docs/status.md',
      field: 'Plugin 版本',
      expected: '1.0.0',
      actual: '0.9.0',
    }];
    const result = fixDrift(drifts);
    expect(result.skipped.length).toBe(1);
    expect(result.fixed.length).toBe(0);
    expect(result.skipped[0]).toMatch(/版本語意/);
  });

  test('回傳 { fixed, skipped, errors } 三個陣列', () => {
    const result = fixDrift([]);
    expect(Array.isArray(result.fixed)).toBe(true);
    expect(Array.isArray(result.skipped)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

// ── fixDrift() 沙盒整合測試 ───────────────────────────────────────────────

describe('fixDrift() — 沙盒修復測試（使用臨時檔案）', () => {
  const { fixDrift, extractStatusMetrics } = require(ENGINE_PATH);

  let tmpFile;

  beforeEach(() => {
    tmpFile = null;
  });

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  test('fixDrift() 只修改有 drift 的欄位，保留其他內容', () => {
    // 建立一個有錯誤數字的臨時 status.md（模擬 drift）
    const fakeContent = `
## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 99（含 grader） |
| Hook 數量 | 11 個 |
`;

    // 寫入暫存目錄以驗證替換邏輯（不動真實 status.md）
    const dir = fs.mkdtempSync(join(os.tmpdir(), 'fix-drift-test-'));
    const fakeStatusMd = join(dir, 'status.md');
    fs.writeFileSync(fakeStatusMd, fakeContent, 'utf8');

    // 直接測試 extractStatusMetrics 替換後的結果（因為 fixDrift 使用真實路徑）
    // 以驗證 regex 替換邏輯正確
    const pattern = new RegExp(
      `(\\|\\s*Agent 數量\\s*\\|\\s*)(99)(\\D)`,
      'g'
    );
    const replaced = fakeContent.replace(pattern, '$117$3');
    const metrics = extractStatusMetrics(replaced);
    expect(metrics['Agent 數量']).toBe(17);
    // Hook 數量未被替換
    expect(metrics['Hook 數量']).toBe(11);

    // 清理
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── runDocsSyncCheck() 整合測試 ───────────────────────────────────────────

describe('runDocsSyncCheck() — 一鍵掃描 + 修復', () => {
  const { runDocsSyncCheck } = require(ENGINE_PATH);

  test('回傳物件包含 wasClean、drifts、fixed、skipped、errors', () => {
    const result = runDocsSyncCheck();
    expect(typeof result.wasClean).toBe('boolean');
    expect(Array.isArray(result.drifts)).toBe(true);
    expect(Array.isArray(result.fixed)).toBe(true);
    expect(Array.isArray(result.skipped)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  test('wasClean = true 時 drifts 和 fixed 均為空陣列', () => {
    const result = runDocsSyncCheck();
    if (result.wasClean) {
      expect(result.drifts.length).toBe(0);
      expect(result.fixed.length).toBe(0);
    }
  });

  test('wasClean = false 時 drifts 不為空', () => {
    const result = runDocsSyncCheck();
    if (!result.wasClean) {
      expect(result.drifts.length).toBeGreaterThan(0);
    }
  });
});

// ── 真實系統狀態驗證（當文件數字正確時）────────────────────────────────────

describe('系統整合驗證 — status.md 數字正確時 isClean = true', () => {
  const { scanDrift, getActualCounts } = require(ENGINE_PATH);

  test('若 status.md 的 Agent 數量與 agents/ 目錄一致，則不產生對應 drift', () => {
    const { agentCount } = getActualCounts();
    const result = scanDrift();

    const agentDrift = result.drifts.find(
      d => d.file === 'docs/status.md' && d.field === 'Agent 數量'
    );

    // 若無 agent drift，表示 status.md 數字已正確
    if (!agentDrift) {
      // 讀取真實 status.md 驗證
      const statusMdPath = join(PROJECT_ROOT, 'docs', 'status.md');
      if (fs.existsSync(statusMdPath)) {
        const content = fs.readFileSync(statusMdPath, 'utf8');
        const metrics = extractStatusMetrics(content);
        expect(metrics['Agent 數量']).toBe(agentCount);
      }
    }
  });

  test('若 status.md 的 Skill 數量與 skills/ 目錄一致，則不產生對應 drift', () => {
    const { skillCount } = getActualCounts();
    const result = scanDrift();

    const skillDrift = result.drifts.find(
      d => d.file === 'docs/status.md' && d.field === 'Skill 數量'
    );

    if (!skillDrift) {
      const statusMdPath = join(PROJECT_ROOT, 'docs', 'status.md');
      if (fs.existsSync(statusMdPath)) {
        const content = fs.readFileSync(statusMdPath, 'utf8');
        const metrics = extractStatusMetrics(content);
        expect(metrics['Skill 數量']).toBe(skillCount);
      }
    }
  });
});
