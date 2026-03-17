/**
 * evolution-cli.test.js — evolution.js CLI 整合測試
 *
 * 涵蓋：CLI help 輸出、exit code、status 子命令輸出
 */

import { describe, it, expect } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const EVO_PATH = join(homedir(), '.claude/scripts/evolution.js');

// ─── CLI help ─────────────────────────────────────────────────────────────

describe('CLI help', () => {
  it('無引數時 exit code 1', async () => {
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
    const stderr = execSync(`bun ${EVO_PATH} --help 2>&1 || true`, { encoding: 'utf-8' });
    expect(stderr).toContain('status');
    expect(stderr).toContain('analyze');
    expect(stderr).toContain('fix');
    expect(stderr).toContain('forge');
    expect(stderr).toContain('internalize');
  });

  it('未知命令 exit code 1', async () => {
    try {
      execSync(`bun ${EVO_PATH} unknown-cmd`, { encoding: 'utf-8', stdio: 'pipe' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err.status).toBe(1);
    }
  });
});

// ─── status 子命令 CLI ────────────────────────────────────────────────────────

describe('status 子命令 CLI', () => {
  it('輸出合法 JSON', async () => {
    const stdout = execSync(`bun ${EVO_PATH} status`, { encoding: 'utf-8' });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('behaviors');
    expect(parsed).toHaveProperty('skills');
  });
});
