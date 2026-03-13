'use strict';
/**
 * v030-worker-agents.test.js
 * 驗證 v0.30 深度路由的 worker agent 檔案 frontmatter
 *
 * 驗證項目：
 *   - planner.md：model=opus, skills 包含 architecture/testing/thinking
 *   - executor.md：model=sonnet, skills 包含 testing/security-kb/dead-code
 *   - reviewer.md：model=opus, disallowedTools 包含 Bash, skills 包含 code-review
 */

const { describe, it, expect } = require('bun:test');
const { join } = require('path');
const { readFileSync, existsSync } = require('fs');
const { PLUGIN_ROOT } = require('../helpers/paths');

/** 用 regex 解析 YAML frontmatter，回傳 { model, skills, disallowedTools } */
function parseAgent(name) {
  const agentPath = join(PLUGIN_ROOT, 'agents', `${name}.md`);
  if (!existsSync(agentPath)) return null;
  const content = readFileSync(agentPath, 'utf8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return {};
  const fm = fmMatch[1];

  // 解析 model
  const modelMatch = fm.match(/^model:\s*(.+)$/m);
  const model = modelMatch ? modelMatch[1].trim() : undefined;

  // 解析 skills（YAML 列表）
  const skillsMatch = fm.match(/^skills:\n((?:\s+-\s+.+\n?)*)/m);
  const skills = skillsMatch
    ? skillsMatch[1].match(/^\s+-\s+(.+)$/gm).map(s => s.replace(/^\s+-\s+/, '').trim())
    : [];

  // 解析 disallowedTools（YAML 列表）
  const disMatch = fm.match(/^disallowedTools:\n((?:\s+-\s+.+\n?)*)/m);
  const disallowedTools = disMatch
    ? disMatch[1].match(/^\s+-\s+(.+)$/gm).map(s => s.replace(/^\s+-\s+/, '').trim())
    : [];

  return { model, skills, disallowedTools };
}

// ── planner.md ──

describe('v0.30 worker agents — planner.md', () => {
  it('存在', () => {
    expect(existsSync(join(PLUGIN_ROOT, 'agents', 'planner.md'))).toBe(true);
  });

  it('model 為 opus', () => {
    const data = parseAgent('planner');
    expect(data?.model).toBe('opus');
  });

  it('skills 包含 architecture', () => {
    const data = parseAgent('planner');
    expect(data?.skills).toContain('architecture');
  });

  it('skills 包含 thinking', () => {
    const data = parseAgent('planner');
    expect(data?.skills).toContain('thinking');
  });
});

// ── executor.md ──

describe('v0.30 worker agents — executor.md', () => {
  it('存在', () => {
    expect(existsSync(join(PLUGIN_ROOT, 'agents', 'executor.md'))).toBe(true);
  });

  it('model 為 sonnet', () => {
    const data = parseAgent('executor');
    expect(data?.model).toBe('sonnet');
  });

  it('skills 包含 testing', () => {
    const data = parseAgent('executor');
    expect(data?.skills).toContain('testing');
  });

  it('skills 包含 security-kb', () => {
    const data = parseAgent('executor');
    expect(data?.skills).toContain('security-kb');
  });

  it('skills 包含 dead-code', () => {
    const data = parseAgent('executor');
    expect(data?.skills).toContain('dead-code');
  });

  it('skills 包含 commit-convention', () => {
    const data = parseAgent('executor');
    expect(data?.skills).toContain('commit-convention');
  });

  it('skills 包含 craft', () => {
    const data = parseAgent('executor');
    expect(data?.skills).toContain('craft');
  });
});

// ── reviewer.md ──

describe('v0.30 worker agents — reviewer.md', () => {
  it('存在', () => {
    expect(existsSync(join(PLUGIN_ROOT, 'agents', 'reviewer.md'))).toBe(true);
  });

  it('model 為 opus', () => {
    const data = parseAgent('reviewer');
    expect(data?.model).toBe('opus');
  });

  it('disallowedTools 包含 Bash', () => {
    const data = parseAgent('reviewer');
    expect(Array.isArray(data?.disallowedTools)).toBe(true);
    expect(data?.disallowedTools).toContain('Bash');
  });

  it('skills 包含 code-review', () => {
    const data = parseAgent('reviewer');
    expect(data?.skills).toContain('code-review');
  });

  it('skills 包含 security-kb', () => {
    const data = parseAgent('reviewer');
    expect(data?.skills).toContain('security-kb');
  });

  it('skills 包含 architecture', () => {
    const data = parseAgent('reviewer');
    expect(data?.skills).toContain('architecture');
  });

  it('skills 包含 database', () => {
    const data = parseAgent('reviewer');
    expect(data?.skills).toContain('database');
  });
});
