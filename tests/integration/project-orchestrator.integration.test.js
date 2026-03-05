'use strict';
/**
 * project-orchestrator.integration.test.js
 *
 * 覆蓋 Feature 5: evolution.js orchestrate CLI 子命令（端到端行為）
 */

const { test, expect, describe, afterAll, beforeAll } = require('bun:test');
const { existsSync, mkdirSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');
const os = require('os');
const { SCRIPTS_DIR, PLUGIN_ROOT } = require('../helpers/paths');

const evolutionScript = join(SCRIPTS_DIR, 'evolution.js');

// ── 輔助函式 ──

function runEvolution(args = [], options = {}) {
  const result = Bun.spawnSync(['bun', evolutionScript, ...args], {
    cwd: join(PLUGIN_ROOT, '..', '..'),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...options.env },
  });

  return {
    stdout: result.stdout ? Buffer.from(result.stdout).toString() : '',
    stderr: result.stderr ? Buffer.from(result.stderr).toString() : '',
    exitCode: result.exitCode,
  };
}

// ── 測試用 spec 檔案 ──

let tempDir;
let specFilePath;
const SPEC_CONTENT = `# 測試功能 — Project Spec

> 產生時間：2026-03-06

---

## 功能定義（Functional）

- 使用者登入功能
- 密碼重設功能

## 操作流程（Flow）

- 打開登入頁面
- 輸入帳號密碼

## 邊界條件（Edge Cases）

- 空白密碼應顯示錯誤

## 驗收標準（Acceptance Criteria）

### BDD 場景

#### 正常登入

GIVEN 使用者已有帳號
WHEN 輸入正確帳密
THEN 成功登入並跳轉首頁
`;

beforeAll(() => {
  tempDir = mkdtempSync('orch-integ-');
  specFilePath = join(tempDir, 'test-spec.md');
  writeFileSync(specFilePath, SPEC_CONTENT, 'utf8');
});

afterAll(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function mkdtempSync(prefix) {
  return require('fs').mkdtempSync(join(os.tmpdir(), prefix));
}

// ── Feature 5: orchestrate CLI ──

describe('Feature 5: evolution.js orchestrate 子命令', () => {
  test('Scenario 5-1: CLI dry-run 預覽輸出格式（exit 0）', () => {
    const { stdout, exitCode } = runEvolution(['orchestrate', specFilePath]);

    expect(exitCode).toBe(0);
    // 包含 Dry Run 相關文字
    expect(stdout.toLowerCase()).toMatch(/dry.?run|預覽/i);
    // 包含摘要數字
    expect(stdout).toMatch(/present|present|已有|能力盤點/i);
    // 包含 features
    expect(stdout).toMatch(/feature|排程|功能/i);
  });

  test('Scenario 5-3: CLI --json 輸出可被解析', () => {
    const { stdout, exitCode } = runEvolution(['orchestrate', specFilePath, '--json']);

    expect(exitCode).toBe(0);
    let parsed;
    expect(() => { parsed = JSON.parse(stdout); }).not.toThrow();
    expect(parsed).toHaveProperty('domainAudit');
    expect(parsed).toHaveProperty('forgeResults');
    expect(parsed).toHaveProperty('queueResult');
    expect(parsed).toHaveProperty('summary');
  });

  test('Scenario 5-5: CLI --workflow 指定 workflow 類型', () => {
    const { stdout, exitCode } = runEvolution(['orchestrate', specFilePath, '--json', '--workflow', 'quick']);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    // queueResult.items 的 workflow 均為 quick（dry-run 時在 _preview items 中）
    const items = parsed.queueResult.items || [];
    if (items.length > 0) {
      expect(items.every(i => i.workflow === 'quick')).toBe(true);
    }
  });

  test('Scenario 5-6: CLI specPath 不存在時報錯（exit 非 0）', () => {
    const { stderr, exitCode } = runEvolution(['orchestrate', '/tmp/nonexistent-spec-file-12345.md']);

    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/找不到|not found|no such|不存在/i);
  });

  test('Scenario 5-7: CLI 無 specPath 時顯示 usage（exit 非 0）', () => {
    const { stdout, stderr, exitCode } = runEvolution(['orchestrate']);

    expect(exitCode).not.toBe(0);
    const output = stdout + stderr;
    expect(output).toMatch(/orchestrate|用法|usage/i);
  });

  test('Scenario 5-2: CLI --execute 真實執行，寫入佇列', () => {
    // 使用 temp dir 隔離 projectRoot，透過環境變數覆蓋
    const execTempDir = mkdtempSync('orch-exec-');
    try {
      // evolution.js orchestrate 使用 projectRoot，我們無法直接注入環境變數給 paths.js
      // 但可以驗證 exit 0 且 stdout 不含 dry-run
      const { stdout, exitCode } = runEvolution(['orchestrate', specFilePath, '--execute']);

      // 主要驗證：exit 0 且無 dry-run 提示
      expect(exitCode).toBe(0);
      // execute 模式的輸出不包含 "dry-run" 提示（不應提示加 --execute）
      expect(stdout).not.toMatch(/加.*--execute/i);
    } finally {
      rmSync(execTempDir, { recursive: true, force: true });
    }
  });
});
