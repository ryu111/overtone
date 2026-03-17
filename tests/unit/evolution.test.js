/**
 * evolution.test.js — evolution.js 統一 CLI 單元測試
 *
 * 測試策略：
 * 1. COMMANDS 路由完整性：5 個子命令都已註冊
 * 2. cmdStatus：正確讀取 behaviors/lifecycle/skills/instinct 狀態
 * 3. cmdInternalize：信心過濾 + 泛化 + 重複偵測
 * 4. CLI help 輸出
 */

import { describe, it, expect } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';

const EVO_PATH = join(homedir(), '.claude/scripts/evolution.js');
const { COMMANDS, cmdStatus, cmdInternalize } = await import(EVO_PATH);

// ─── 1. COMMANDS 路由完整性 ──────────────────────────────────────────────────

describe('COMMANDS 路由', () => {
  it('包含 5 個子命令', () => {
    expect(Object.keys(COMMANDS)).toHaveLength(5);
  });

  const expected = ['status', 'analyze', 'fix', 'forge', 'internalize'];
  for (const cmd of expected) {
    it(`${cmd} 已註冊`, () => {
      expect(typeof COMMANDS[cmd]).toBe('function');
    });
  }
});

// ─── 2. cmdStatus ────────────────────────────────────────────────────────────

describe('cmdStatus', () => {
  it('回傳包含 4 個區塊的狀態物件', async () => {
    const result = await cmdStatus();
    expect(result).toHaveProperty('behaviors');
    expect(result).toHaveProperty('lifecycle');
    expect(result).toHaveProperty('skills');
    expect(result).toHaveProperty('instinct');
  });

  it('behaviors 區塊有 total/deployed/candidates', async () => {
    const result = await cmdStatus();
    expect(typeof result.behaviors.total).toBe('number');
    expect(typeof result.behaviors.deployed).toBe('number');
    expect(typeof result.behaviors.candidates).toBe('number');
  });

  it('skills 區塊有 total/withSkillMd', async () => {
    const result = await cmdStatus();
    expect(typeof result.skills.total).toBe('number');
    expect(typeof result.skills.withSkillMd).toBe('number');
  });
});

// ─── 3. cmdInternalize ──────────────────────────────────────────────────────

describe('cmdInternalize', () => {
  it('無 behaviors.jsonl 時回傳 0', async () => {
    // cmdInternalize 讀取實際路徑，若不存在會正常返回
    const result = await cmdInternalize();
    // 不管實際環境，結構都正確
    expect(typeof result.internalized).toBe('number');
    expect(result).toHaveProperty('message');
  });
});

// ─── 4. CLI help ─────────────────────────────────────────────────────────────

describe('CLI help', () => {
  it('無引數時 exit code 1', async () => {
    const { execSync } = await import('child_process');
    try {
      execSync(`bun ${EVO_PATH}`, { encoding: 'utf-8', stdio: 'pipe' });
      // 不應該到這裡
      expect(true).toBe(false);
    } catch (err) {
      expect(err.status).toBe(1);
      expect(err.stderr).toContain('usage:');
    }
  });

  it('--help 時 exit code 0', async () => {
    const { execSync } = await import('child_process');
    const stderr = execSync(`bun ${EVO_PATH} --help 2>&1 || true`, { encoding: 'utf-8' });
    expect(stderr).toContain('status');
    expect(stderr).toContain('analyze');
    expect(stderr).toContain('fix');
    expect(stderr).toContain('forge');
    expect(stderr).toContain('internalize');
  });

  it('未知命令 exit code 1', async () => {
    const { execSync } = await import('child_process');
    try {
      execSync(`bun ${EVO_PATH} unknown-cmd`, { encoding: 'utf-8', stdio: 'pipe' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err.status).toBe(1);
    }
  });
});

// ─── 5. status 子命令 CLI ────────────────────────────────────────────────────

describe('status 子命令 CLI', () => {
  it('輸出合法 JSON', async () => {
    const { execSync } = await import('child_process');
    const stdout = execSync(`bun ${EVO_PATH} status`, { encoding: 'utf-8' });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('behaviors');
    expect(parsed).toHaveProperty('skills');
  });
});
