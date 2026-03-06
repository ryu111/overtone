'use strict';
/**
 * tts-templates.js — TTS 事件模板
 *
 * 事件鍵 → 自然口語字串映射。
 * 純資料模組，不依賴任何外部模組。
 *
 * 模板字串使用 {key} 佔位符，由 interpolate() 替換。
 * 事件鍵對齊 registry.js timelineEvents 分類。
 */

// 模板定義
const TEMPLATES = {
  // agent 類
  'agent:complete': '{stage} 完成',
  'agent:error':    '{stage} 失敗',

  // stage 類
  'stage:complete': '{stage} 階段完成',
  'stage:retry':    '{stage} 重試中',

  // workflow 類
  'workflow:complete': '工作流程完成',
  'workflow:abort':    '工作流程中斷',

  // loop 類
  'loop:complete': '所有任務完成',

  // parallel 類
  'parallel:converge': '並行任務收斂',

  // session 類
  'session:start':   'Overtone 啟動',
  'session:compact': '正在壓縮 context',

  // error 類
  'error:fatal': '發生嚴重錯誤',

  // notification 類（Hook Notification 觸發）
  'notification:ask': '需要你的決定',
};

/**
 * 替換模板字串中的 {key} 佔位符
 * @param {string} template - 模板字串（含 {key} 佔位符）
 * @param {object} params - 插值參數
 * @returns {string} 插值後的字串
 */
function interpolate(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

/**
 * 取得事件模板並插值
 * @param {string} eventKey - 事件鍵（如 'agent:complete'）
 * @param {object} [params] - 插值參數（如 { stage: 'DEV', agent: 'developer' }）
 * @returns {string|null} 插值後的字串，未知事件鍵回傳 null
 */
function getTemplate(eventKey, params = {}) {
  const template = TEMPLATES[eventKey];
  if (template === undefined) return null;
  return interpolate(template, params);
}

/**
 * 取得所有已定義的事件鍵
 * @returns {string[]}
 */
function getDefinedKeys() {
  return Object.keys(TEMPLATES);
}

module.exports = { getTemplate, getDefinedKeys };
