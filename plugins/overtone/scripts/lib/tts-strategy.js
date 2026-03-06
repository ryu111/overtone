'use strict';
/**
 * tts-strategy.js — TTS 策略引擎
 *
 * 決定「是否朗讀」+ 「朗讀什麼」。
 * 讀取 ~/.overtone/tts.json 取得 level/voice/enabled 設定。
 * 依賴注入：_deps = { readConfig } 供測試替換。
 */

const { join } = require('path');
const { homedir } = require('os');
const { readFileSync } = require('fs');

const ttsTemplates = require('./tts-templates');

// TTS 設定檔路徑
const TTS_CONFIG_PATH = join(homedir(), '.overtone', 'tts.json');

// TTS Level 定義
const TTS_LEVELS = {
  SILENT:   0,  // 靜音（完全不說話）
  CRITICAL: 1,  // 只說關鍵事件（error:fatal、workflow:complete、notification:ask）
  PROGRESS: 2,  // 加上進度事件（agent:complete、stage:complete、loop:complete）
  VERBOSE:  3,  // 全部（所有有模板的事件）
};

// 每個 level 涵蓋的事件鍵（累積式：level 2 包含 level 1）
const LEVEL_EVENTS = {
  1: ['error:fatal', 'workflow:complete', 'notification:ask', 'workflow:abort'],
  2: ['agent:complete', 'agent:error', 'stage:complete', 'stage:retry', 'loop:complete', 'parallel:converge'],
  3: ['session:start', 'session:compact'],
};

// 預設 TTS 設定
const DEFAULT_CONFIG = {
  enabled: false,
  level: 1,
  voice: null,
  rate: 200,
};

/**
 * 判斷是否應該朗讀
 * @param {string} eventKey - 事件鍵
 * @param {number} level    - TTS level（0-3）
 * @returns {boolean}
 */
function shouldSpeak(eventKey, level) {
  // level 0 = SILENT，完全不說話
  if (level <= 0) return false;

  // 從高往低檢查：只要有任何 level <= 當前 level 的事件集合包含此 key，則回傳 true
  for (let l = 1; l <= level; l++) {
    const events = LEVEL_EVENTS[l] || [];
    if (events.includes(eventKey)) return true;
  }

  return false;
}

/**
 * 建構朗讀參數
 * @param {string} eventKey       - 事件鍵
 * @param {object} [context]      - 插值參數（如 { stage: 'DEV', agent: 'developer' }）
 * @param {object} [config]       - TTS 設定（voice、rate）
 * @returns {{ text: string, opts: { voice?: string, rate?: number } }|null}
 *   null 表示無模板（不應朗讀）
 */
function buildSpeakArgs(eventKey, context = {}, config = {}) {
  const text = ttsTemplates.getTemplate(eventKey, context);
  if (text === null) return null;

  const opts = {};
  if (config.voice) opts.voice = config.voice;
  if (config.rate) opts.rate = config.rate;

  return { text, opts };
}

/**
 * 讀取 TTS 設定（預設值：level=1, enabled=false, voice=null, rate=200）
 * @param {object} [_deps]
 * @param {Function} [_deps.readConfig]  - (path) => object，預設讀 ~/.overtone/tts.json
 * @returns {{ enabled: boolean, level: number, voice: string|null, rate: number }}
 */
function readTtsConfig(_deps = {}) {
  const readConfig = _deps.readConfig || _defaultReadConfig;

  try {
    const config = readConfig(TTS_CONFIG_PATH);
    // 合併預設值，確保所有欄位存在
    return {
      enabled: config.enabled !== undefined ? Boolean(config.enabled) : DEFAULT_CONFIG.enabled,
      level:   config.level   !== undefined ? Number(config.level)   : DEFAULT_CONFIG.level,
      voice:   config.voice   !== undefined ? config.voice           : DEFAULT_CONFIG.voice,
      rate:    config.rate    !== undefined ? Number(config.rate)    : DEFAULT_CONFIG.rate,
    };
  } catch {
    // 設定檔不存在或讀取失敗 → 回傳預設值
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 預設設定讀取函式（讀 JSON 檔案）
 */
function _defaultReadConfig(path) {
  const content = readFileSync(path, 'utf8');
  return JSON.parse(content);
}

module.exports = { shouldSpeak, buildSpeakArgs, readTtsConfig, TTS_LEVELS, LEVEL_EVENTS };
