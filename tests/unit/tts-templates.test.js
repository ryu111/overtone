'use strict';
/**
 * tts-templates.test.js — tts-templates.js 單元測試
 *
 * 測試 getTemplate()、getDefinedKeys() 的各種場景。
 */

const { describe, test, expect } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { getTemplate, getDefinedKeys } = require(join(SCRIPTS_LIB, 'tts-templates'));

describe('getTemplate()', () => {
  test('已知事件鍵取得插值後模板', () => {
    const result = getTemplate('agent:complete', { stage: 'DEV' });

    expect(result).toBe('DEV 完成');
    expect(result).not.toMatch(/\{[a-z]+\}/);
  });

  test('無插值參數的模板事件鍵', () => {
    const result = getTemplate('workflow:complete', {});

    expect(result).toBe('工作流程完成');
    expect(result).not.toMatch(/\{[a-z]+\}/);
  });

  test('未知事件鍵回傳 null', () => {
    const result = getTemplate('unknown:event');

    expect(result).toBeNull();
  });

  test('多個參數插值正確 — agent:error', () => {
    const result = getTemplate('agent:error', { stage: 'REVIEW', agent: 'code-reviewer' });

    expect(result).toBe('REVIEW 失敗');
    expect(result).not.toMatch(/\{stage\}/);
    expect(result).not.toMatch(/\{agent\}/);
  });

  test('stage:complete 插值', () => {
    const result = getTemplate('stage:complete', { stage: 'TEST' });

    expect(result).toBe('TEST 階段完成');
  });

  test('stage:retry 插值', () => {
    const result = getTemplate('stage:retry', { stage: 'DEV' });

    expect(result).toBe('DEV 重試中');
  });

  test('notification:ask 回傳固定字串', () => {
    const result = getTemplate('notification:ask');

    expect(result).toBe('需要你的決定');
  });

  test('workflow:abort 回傳固定字串', () => {
    const result = getTemplate('workflow:abort');

    expect(result).toBe('工作流程中斷');
  });

  test('loop:complete 回傳固定字串', () => {
    const result = getTemplate('loop:complete');

    expect(result).toBe('所有任務完成');
  });

  test('session:start 回傳固定字串', () => {
    const result = getTemplate('session:start');

    expect(result).toBe('Overtone 啟動');
  });

  test('error:fatal 回傳固定字串', () => {
    const result = getTemplate('error:fatal');

    expect(result).toBe('發生嚴重錯誤');
  });

  test('佔位符在 params 無對應時保留原樣', () => {
    // agent:complete 有 {stage} 佔位符，若無 stage 參數則保留 {stage}
    const result = getTemplate('agent:complete', {});

    expect(result).toBe('{stage} 完成');
  });
});

describe('getDefinedKeys()', () => {
  test('回傳非空陣列', () => {
    const keys = getDefinedKeys();

    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThan(0);
  });

  test('陣列包含必要事件鍵', () => {
    const keys = getDefinedKeys();

    expect(keys).toContain('agent:complete');
    expect(keys).toContain('workflow:complete');
    expect(keys).toContain('notification:ask');
  });

  test('陣列包含至少 12 個事件鍵', () => {
    const keys = getDefinedKeys();

    expect(keys.length).toBeGreaterThanOrEqual(12);
  });

  test('所有鍵都是字串格式', () => {
    const keys = getDefinedKeys();

    for (const key of keys) {
      expect(typeof key).toBe('string');
      expect(key).toContain(':');
    }
  });
});
