'use strict';
/**
 * knowledge-archiver.js — 知識歸檔封裝器
 *
 * 將 on-stop.js 的知識歸檔邏輯（Block 8）提取為獨立模組。
 * 對每個 fragment 做 try/catch 靜默容錯，單個失敗不中止整體流程。
 *
 * 導出：
 *   archiveKnowledge — 主歸檔函式
 *   _isExternalFragment — 外部 fragment 判定（可測試）
 */

const path = require('path');

// 外部專案路徑 regex：匹配 projects/<非overtone>/ 模式（不分大小寫）
// negative lookahead 保護：projects/overtone/ 不被誤判
const EXTERNAL_PATH_REGEX = /\bprojects\/(?!overtone[\\/])[^\s/]+[/\\]/i;

/**
 * 判定 fragment 是否來自外部專案。
 * 掃描 fragment.content 是否含外部路徑特徵。
 * 無路徑特徵時保守回傳 false（避免誤傷純文字知識）。
 *
 * @param {{ content: string }} fragment
 * @returns {boolean}
 */
function _isExternalFragment(fragment) {
  if (!fragment || typeof fragment.content !== 'string') return false;
  return EXTERNAL_PATH_REGEX.test(fragment.content);
}

/**
 * 從 agent 輸出提取知識片段並歸檔到對應 domain。
 *
 * @param {string} agentOutput - agent 輸出（建議已截斷至 3000 chars）
 * @param {object} ctx
 * @param {string} ctx.agentName     - agent 名稱（如 'developer'）
 * @param {string} ctx.actualStageKey - 實際 stage key（如 'DEV', 'TEST:2'）
 * @param {string} ctx.projectRoot   - 專案根目錄
 * @param {string} [ctx.sessionId]   - session ID（用於 gap-observation instinct 記錄）
 * @param {object} [_deps={}]        - dependency injection（測試用）
 * @param {object} [_deps.instinct]  - 覆蓋預設 require('./instinct')
 * @returns {{ archived: number, errors: number, skipped: number }}
 */
function archiveKnowledge(agentOutput, ctx, _deps = {}) {
  const { agentName, actualStageKey, projectRoot, sessionId } = ctx;

  let archived = 0;
  let errors = 0;
  let skipped = 0;

  if (!agentOutput || typeof agentOutput !== 'string') {
    return { archived, errors, skipped };
  }

  try {
    const { extractKnowledge } = require('./knowledge-searcher');
    const { routeKnowledge, writeKnowledge } = require('./skill-router');
    const instinct = _deps.instinct || require('./instinct');

    const pluginRoot = path.join(projectRoot, 'plugins', 'overtone');

    const fragments = extractKnowledge(agentOutput, {
      agentName,
      stageName: actualStageKey,
    });

    for (const fragment of fragments) {
      // 外部 fragment 降級：不寫入 skills/，改為 instinct gap-observation
      if (_isExternalFragment(fragment)) {
        skipped++;
        if (sessionId) {
          try {
            instinct.emit(sessionId, 'knowledge_gap', {
              source: fragment.source || agentName,
              content: fragment.content ? fragment.content.slice(0, 200) : '',
              reason: 'external_project_path_detected',
            });
          } catch {
            // instinct emit 失敗靜默忽略
          }
        }
        continue;
      }

      try {
        const routeResult = routeKnowledge(fragment, { pluginRoot });
        writeKnowledge(routeResult, fragment, pluginRoot, sessionId);
        archived++;
      } catch {
        // 單個 fragment 寫入失敗靜默跳過，累計 errors
        errors++;
      }
    }
  } catch {
    // 外層例外（extractKnowledge 或 require 失敗）靜默降級
    if (agentOutput.length > 0) {
      errors++;
    }
  }

  return { archived, errors, skipped };
}

module.exports = { archiveKnowledge, _isExternalFragment };
