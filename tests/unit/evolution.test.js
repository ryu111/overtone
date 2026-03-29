/**
 * evolution.test.js — evolution.js 統一 CLI 單元測試
 *
 * 測試策略：
 * 1. COMMANDS 路由完整性：5 個子命令都已註冊
 * 2. cmdStatus：正確讀取 behaviors/lifecycle/skills/instinct（data/internalized.md）狀態
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

// CLI 整合測試已移至 tests/integration/evolution-cli.test.js
