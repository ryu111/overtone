'use strict';
/**
 * evolution-forge.test.js — evolution.js forge 子命令整合測試
 *
 * 測試面向：
 *   Feature 5: evolution.js forge CLI 子命令
 *     - 無參數顯示用法（exit 1）
 *     - dry-run 輸出人類可讀預覽（exit 0）
 *     - --json 旗標輸出合法 JSON（exit 0）
 *     - domain 衝突時輸出衝突資訊（exit 1）
 *   Feature 6: knowledge-gap-detector DOMAIN_KEYWORDS 計數
 *     - os-control / autonomous-control / craft 關鍵詞偵測
 *     - DOMAIN_KEYWORDS key 數量為 15（15/15）
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { existsSync, rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_DIR, SCRIPTS_LIB, PLUGIN_ROOT } = require('../helpers/paths');

const evolutionScript = join(SCRIPTS_DIR, 'evolution.js');

// ── 輔助函式 ──

/**
 * 執行 evolution.js 並回傳 { stdout, stderr, exitCode }
 */
function runEvolution(args = []) {
  const result = Bun.spawnSync(['bun', evolutionScript, ...args], {
    cwd: join(PLUGIN_ROOT, '..', '..'),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    stdout: result.stdout ? Buffer.from(result.stdout).toString() : '',
    stderr: result.stderr ? Buffer.from(result.stderr).toString() : '',
    exitCode: result.exitCode,
  };
}

// ── Feature 5: evolution.js forge CLI ──

describe('Feature 5: evolution.js forge 子命令', () => {
  test('Scenario 5-1: 不帶 domain 參數 → 顯示用法 exit 1', () => {
    const { stdout, stderr, exitCode } = runEvolution(['forge']);

    expect(exitCode).toBe(1);
    const output = stdout + stderr;
    expect(output).toContain('forge');
    expect(output.toLowerCase()).toMatch(/domain|用法|usage/i);
  });

  test('Scenario 5-2: dry-run 模式 → 人類可讀預覽 exit 0', () => {
    // 使用一個真實環境不存在的 domain 名稱
    const testDomain = `preview-domain-test-${Date.now()}`;
    const { stdout, exitCode } = runEvolution(['forge', testDomain]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(testDomain);
    // 驗證確實沒有建立檔案
    expect(existsSync(join(PLUGIN_ROOT, 'skills', testDomain))).toBe(false);
  });

  test('Scenario 5-3: --json 旗標 → 合法 JSON 含 status 和 domainName（exit 0）', () => {
    const testDomain = `json-domain-test-${Date.now()}`;
    const { stdout, exitCode } = runEvolution(['forge', testDomain, '--json']);

    expect(exitCode).toBe(0);

    let parsed;
    expect(() => { parsed = JSON.parse(stdout); }).not.toThrow();
    expect(parsed.status).toBe('success');
    expect(parsed.domainName).toBe(testDomain);
    // dry-run 模式應有 preview
    expect(parsed.preview).toBeDefined();
  });

  test('Scenario 5-4: domain 衝突時 --json 輸出衝突資訊（exit 1）', () => {
    // 使用一個已存在的真實 domain（testing skill 應該存在）
    const { stdout, exitCode } = runEvolution(['forge', 'testing', '--json']);

    expect(exitCode).toBe(1);

    let parsed;
    expect(() => { parsed = JSON.parse(stdout); }).not.toThrow();
    expect(parsed.status).toBe('conflict');
    expect(parsed.domainName).toBe('testing');
    expect(parsed.conflictPath).toBeTruthy();
  });

  test('Scenario 5-5: domain 衝突時人類可讀輸出（exit 1）', () => {
    const { stdout, stderr, exitCode } = runEvolution(['forge', 'testing']);

    expect(exitCode).toBe(1);
    // stdout 或 stderr 包含衝突訊息
    const combinedOutput = stdout + stderr;
    expect(combinedOutput).toMatch(/衝突|conflict/i);
  });
});

// ── Feature 6: knowledge-gap-detector DOMAIN_KEYWORDS ──

describe('Feature 6: knowledge-gap-detector DOMAIN_KEYWORDS 覆蓋', () => {
  const { DOMAIN_KEYWORDS, detectKnowledgeGaps } = require(
    join(SCRIPTS_LIB, 'knowledge', 'knowledge-gap-detector')
  );

  test('Scenario 6-1: DOMAIN_KEYWORDS key 數量為 15（15/15）', () => {
    const keys = Object.keys(DOMAIN_KEYWORDS);
    expect(keys.length).toBe(15);
  });

  test('Scenario 6-2: os-control domain 涵蓋截圖相關關鍵詞', () => {
    const gaps = detectKnowledgeGaps('screenshot and window management', [], { minScore: 0.1 });
    const domains = gaps.map(g => g.domain);
    expect(domains).toContain('os-control');
  });

  test('Scenario 6-3: autonomous-control domain 涵蓋 heartbeat 相關關鍵詞', () => {
    const gaps = detectKnowledgeGaps('heartbeat daemon and execution queue management', [], { minScore: 0.1 });
    const domains = gaps.map(g => g.domain);
    expect(domains).toContain('autonomous-control');
  });

  test('Scenario 6-4: craft domain 偵測 clean code 相關關鍵詞', () => {
    const gaps = detectKnowledgeGaps('clean code and solid principles refactoring', [], { minScore: 0.1 });
    const domains = gaps.map(g => g.domain);
    expect(domains).toContain('craft');
  });

  test('Scenario 6-5: agent 已具備 os-control 時不產生缺口', () => {
    const gaps = detectKnowledgeGaps('screenshot and window management', ['os-control'], { minScore: 0.1 });
    const domains = gaps.map(g => g.domain);
    expect(domains).not.toContain('os-control');
  });
});
