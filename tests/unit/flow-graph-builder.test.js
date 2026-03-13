import { describe, test, expect } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';

const { buildGraph } = await import(
  join(homedir(), '.claude/scripts/flow/graph-builder.js')
);

describe('flow-graph-builder', () => {
  // 一次 buildGraph，所有測試共用（讀真實 ~/.claude/）
  const graph = buildGraph();

  test('回傳 { nodes, edges, breaks } 結構', () => {
    expect(graph).toHaveProperty('nodes');
    expect(graph).toHaveProperty('edges');
    expect(graph).toHaveProperty('breaks');
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
    expect(Array.isArray(graph.breaks)).toBe(true);
  });

  test('nodes 包含 agent 類型', () => {
    const agentNodes = graph.nodes.filter(n => n.type === 'agent');
    expect(agentNodes.length).toBeGreaterThan(0);
    // 每個 agent node 有 id、name、model
    for (const node of agentNodes) {
      expect(node.id).toMatch(/^agent:/);
      expect(typeof node.name).toBe('string');
      expect(typeof node.model).toBe('string');
    }
  });

  test('nodes 包含 skill 類型', () => {
    const skillNodes = graph.nodes.filter(n => n.type === 'skill');
    expect(skillNodes.length).toBeGreaterThan(0);
    for (const node of skillNodes) {
      expect(node.id).toMatch(/^skill:/);
      expect(typeof node.name).toBe('string');
    }
  });

  test('nodes 包含 hook 類型', () => {
    const hookNodes = graph.nodes.filter(n => n.type === 'hook');
    expect(hookNodes.length).toBeGreaterThan(0);
    for (const node of hookNodes) {
      expect(node.id).toMatch(/^hook:/);
      expect(typeof node.name).toBe('string');
    }
  });

  test('nodes 包含 rule 類型', () => {
    const ruleNodes = graph.nodes.filter(n => n.type === 'rule');
    expect(ruleNodes.length).toBeGreaterThan(0);
    for (const node of ruleNodes) {
      expect(node.id).toMatch(/^rule:/);
      expect(typeof node.name).toBe('string');
    }
  });

  test('agent → skill edges 存在（type: uses）', () => {
    const usesEdges = graph.edges.filter(e => e.type === 'uses');
    expect(usesEdges.length).toBeGreaterThan(0);
    for (const edge of usesEdges) {
      expect(edge.source).toMatch(/^agent:/);
      expect(edge.target).toMatch(/^skill:/);
    }
  });

  test('breaks 中 dangling_skill 項目格式正確', () => {
    const dangling = graph.breaks.filter(b => b.type === 'dangling_skill');
    // 可能為 0（全部 skill 都存在），只驗格式
    for (const b of dangling) {
      expect(typeof b.agent).toBe('string');
      expect(typeof b.skill).toBe('string');
      expect(typeof b.message).toBe('string');
    }
  });

  test('breaks 中有 orphan_skill 類型', () => {
    const orphans = graph.breaks.filter(b => b.type === 'orphan_skill');
    // 真實環境中應有未被 agent 引用的 skill
    expect(orphans.length).toBeGreaterThan(0);
    for (const b of orphans) {
      expect(typeof b.skill).toBe('string');
      expect(typeof b.message).toBe('string');
    }
  });

  test('breaks 中 missing_hook_script 項目格式正確', () => {
    const missing = graph.breaks.filter(b => b.type === 'missing_hook_script');
    // 腳本都建好了可能為 0，只驗格式
    for (const b of missing) {
      expect(typeof b.script).toBe('string');
      expect(typeof b.message).toBe('string');
    }
  });
});
