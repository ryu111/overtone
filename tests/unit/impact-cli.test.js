'use strict';
/**
 * impact-cli.test.js
 *
 * Feature 9: impact.js CLI — BDD Scenario 9-1 至 9-6
 */

const { describe, it, expect } = require('bun:test');
const { join } = require('path');
const { PLUGIN_ROOT, SCRIPTS_DIR } = require('../helpers/paths');

// CLI 所在的絕對路徑
const IMPACT_CLI = join(SCRIPTS_DIR, 'impact.js');

/**
 * 執行 CLI 並回傳 { stdout, stderr, exitCode }
 * @param {string[]} args CLI 引數
 * @param {object} opts
 * @param {string} [opts.cwd] 工作目錄（預設 plugin root）
 */
async function runCLI(args, opts = {}) {
  const cwd = opts.cwd || PLUGIN_ROOT;
  const proc = Bun.spawn(
    ['bun', IMPACT_CLI, ...args],
    { cwd, stdout: 'pipe', stderr: 'pipe' },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe('Feature 9: impact.js CLI', () => {

  it('Scenario 9-1: 正常路徑查詢 — stdout 包含「查詢：」標頭', async () => {
    const { stdout, exitCode } = await runCLI(['hooks/scripts/on-stop.js']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('查詢：');
  });

  it('Scenario 9-1: 受影響元件每行格式含 [type] 和路徑', async () => {
    // 使用一個確實存在依賴的 SKILL.md（skills/testing/SKILL.md 被 agents 引用）
    const { stdout, exitCode } = await runCLI(['skills/testing/SKILL.md']);
    expect(exitCode).toBe(0);
    // 應包含「受影響元件」字樣（有或無元件皆可），重點是標頭存在
    expect(stdout).toMatch(/查詢：/);
    // 若有受影響元件，每行格式必須含 [type]
    const lines = stdout.split('\n').filter(l => l.startsWith('  ['));
    for (const line of lines) {
      expect(line).toMatch(/^\s+\[[\w-]+\]\s+/);
    }
  });

  it('Scenario 9-2: --deps flag 顯示正向依賴，不含「受影響元件」', async () => {
    const { stdout, exitCode } = await runCLI(['agents/developer.md', '--deps']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('查詢：');
    expect(stdout).not.toContain('受影響元件');
    // developer.md 至少有一個 skill 依賴
    expect(stdout).toMatch(/skills\//);
  });

  it('Scenario 9-3: --json flag 輸出合法 JSON，包含 path 和 impacted', async () => {
    const { stdout, exitCode } = await runCLI(['skills/testing/SKILL.md', '--json']);
    expect(exitCode).toBe(0);
    let parsed;
    expect(() => { parsed = JSON.parse(stdout); }).not.toThrow();
    expect(parsed).toHaveProperty('path');
    expect(parsed).toHaveProperty('impacted');
    expect(Array.isArray(parsed.impacted)).toBe(true);
  });

  it('Scenario 9-4: --deps --json 輸出合法 JSON 陣列，元素為字串', async () => {
    const { stdout, exitCode } = await runCLI(['agents/developer.md', '--deps', '--json']);
    expect(exitCode).toBe(0);
    let parsed;
    expect(() => { parsed = JSON.parse(stdout); }).not.toThrow();
    expect(Array.isArray(parsed)).toBe(true);
    // 每個元素為字串路徑
    for (const item of parsed) {
      expect(typeof item).toBe('string');
    }
  });

  it('Scenario 9-5: 路徑不在圖中時退出碼為 0，stdout 指示空結果', async () => {
    const { stdout, exitCode } = await runCLI(['nonexistent/path.md']);
    expect(exitCode).toBe(0);
    // 必須包含「（0）」或類似空結果提示
    expect(stdout).toMatch(/（0）|0 impacted/);
  });

  it('Scenario 9-6: pluginRoot 自動偵測 — 無需指定 pluginRoot 即可執行', async () => {
    // 從 scripts/ 子目錄執行，確認自動偵測機制能正常 buildGraph
    const { exitCode, stderr } = await runCLI(['agents/developer.md'], {
      cwd: join(SCRIPTS_DIR),
    });
    // 不應有 "pluginRoot 不存在" 錯誤
    expect(stderr).not.toContain('pluginRoot 不存在');
    expect(exitCode).toBe(0);
  });

});
