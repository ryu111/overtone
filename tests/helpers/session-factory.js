'use strict';
/**
 * session-factory.js — 測試用 SessionContext 工廠
 *
 * 提供統一的 session setup/teardown，消除 67+ 測試檔案中的重複程式碼。
 *
 * 使用範例：
 *   const { makeTmpProject, createCtx, setupWorkflow, cleanupProject } = require('./session-factory');
 *
 *   let projectRoot;
 *   beforeEach(() => { projectRoot = makeTmpProject(); });
 *   afterEach(() => { cleanupProject(projectRoot); });
 *
 *   test('xxx', () => {
 *     const ctx = createCtx(projectRoot);
 *     setupWorkflow(ctx, 'quick', ['DEV', 'REVIEW']);
 *   });
 */

const { mkdirSync, rmSync } = require('fs');
const { mkdtempSync } = require('fs');
const { join } = require('path');
const os = require('os');
const { SCRIPTS_LIB } = require('./paths');

const paths = require(join(SCRIPTS_LIB, 'paths'));
const SessionContext = require(join(SCRIPTS_LIB, 'session-context'));
const state = require(join(SCRIPTS_LIB, 'state'));

let _counter = 0;

/**
 * 建立隔離的臨時專案目錄
 * @param {string} [prefix='ot-test'] - 目錄前綴
 * @returns {string} 臨時目錄絕對路徑
 */
function makeTmpProject(prefix = 'ot-test') {
  return mkdtempSync(join(os.tmpdir(), `${prefix}-`));
}

/**
 * 建立 SessionContext 並確保目錄存在
 * @param {string} projectRoot - 專案根目錄（通常來自 makeTmpProject）
 * @param {string} [sessionId] - 自動產生唯一 ID
 * @param {string} [workflowId] - 可選 workflowId
 * @returns {SessionContext}
 */
function createCtx(projectRoot, sessionId, workflowId) {
  const sid = sessionId || `test-session-${Date.now()}-${++_counter}`;
  const ctx = new SessionContext(projectRoot, sid, workflowId || null);
  mkdirSync(ctx.sessionDir(), { recursive: true });
  return ctx;
}

/**
 * 初始化 workflow 狀態（使用 Ctx API）
 * @param {SessionContext} ctx
 * @param {string} workflowType - 'quick'、'standard' 等
 * @param {string[]} stageList - ['DEV', 'REVIEW'] 等
 * @param {object} [options] - 傳遞給 initStateCtx 的額外選項
 * @returns {object} 初始化後的 workflow state
 */
function setupWorkflow(ctx, workflowType, stageList, options = {}) {
  return state.initStateCtx(ctx, workflowType, stageList, options);
}

/**
 * 安全清理臨時專案目錄
 * @param {string} projectRoot
 */
function cleanupProject(projectRoot) {
  if (!projectRoot) return;
  try {
    rmSync(projectRoot, { recursive: true, force: true });
  } catch { /* 清理失敗不阻塞測試 */ }
}

module.exports = { makeTmpProject, createCtx, setupWorkflow, cleanupProject };
