'use strict';
/**
 * knowledge-archiver.js — 知識歸檔封裝器
 *
 * 將 on-stop.js 的知識歸檔邏輯（Block 8）提取為獨立模組。
 * 對每個 fragment 做 try/catch 靜默容錯，單個失敗不中止整體流程。
 *
 * 導出：
 *   archiveKnowledge — 主歸檔函式
 */

const path = require('path');

/**
 * 從 agent 輸出提取知識片段並歸檔到對應 domain。
 *
 * @param {string} agentOutput - agent 輸出（建議已截斷至 3000 chars）
 * @param {object} ctx
 * @param {string} ctx.agentName     - agent 名稱（如 'developer'）
 * @param {string} ctx.actualStageKey - 實際 stage key（如 'DEV', 'TEST:2'）
 * @param {string} ctx.projectRoot   - 專案根目錄
 * @param {string} [ctx.sessionId]   - session ID（用於 gap-observation instinct 記錄）
 * @returns {{ archived: number, errors: number }}
 */
function archiveKnowledge(agentOutput, ctx) {
  const { agentName, actualStageKey, projectRoot, sessionId } = ctx;

  let archived = 0;
  let errors = 0;

  if (!agentOutput || typeof agentOutput !== 'string') {
    return { archived, errors };
  }

  try {
    const { extractKnowledge } = require('./knowledge-searcher');
    const { routeKnowledge, writeKnowledge } = require('./skill-router');

    const pluginRoot = path.join(projectRoot, 'plugins', 'overtone');

    const fragments = extractKnowledge(agentOutput, {
      agentName,
      stageName: actualStageKey,
    });

    for (const fragment of fragments) {
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

  return { archived, errors };
}

module.exports = { archiveKnowledge };
