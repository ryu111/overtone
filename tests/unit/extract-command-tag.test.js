'use strict';
/**
 * extract-command-tag.test.js
 * 測試 extractCommandTag 純函式的六個 BDD 場景
 */

const { describe, it, expect } = require('bun:test');
const { extractCommandTag } = require('../../plugins/overtone/hooks/scripts/tool/post-use');

describe('extractCommandTag', () => {
  // Scenario 1: npm install → 'npm'
  it('npm install 回傳 "npm"', () => {
    expect(extractCommandTag('npm install')).toBe('npm');
  });

  // Scenario 2: npx eslint → 'npm'（npx 規範化）
  it('npx 規範化為 "npm"', () => {
    expect(extractCommandTag('npx eslint --fix .')).toBe('npm');
  });

  // Scenario 3: bun run test → 'bun'
  it('bun run test 回傳 "bun"', () => {
    expect(extractCommandTag('bun run test')).toBe('bun');
  });

  // Scenario 4: git push → 'git'
  it('git push 回傳 "git"', () => {
    expect(extractCommandTag('git push origin main')).toBe('git');
  });

  // Scenario 5: 未知指令 → 清理後的 tag（只含小寫字母、數字與連字符）
  it('未知指令回傳清理後的 tag', () => {
    const result = extractCommandTag('unknown-cmd --flag');
    expect(result).toBe('unknown-cmd');
    expect(result).toMatch(/^[a-z0-9-]+$/);
  });

  // Scenario 6: vitest → 'jest'（vitest 規範化）
  it('vitest 規範化為 "jest"', () => {
    expect(extractCommandTag('vitest run')).toBe('jest');
  });
});
