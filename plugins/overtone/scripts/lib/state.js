#!/usr/bin/env node
'use strict';
/**
 * state.js — workflow.json 讀寫
 *
 * 管理 session 的工作流狀態。
 * 原子寫入：先寫暫存檔再 rename，避免 JSON 損壞。
 */

const { readFileSync, statSync } = require('fs');
const paths = require('./paths');
const { atomicWrite } = require('./utils');

/**
 * 讀取 workflow 狀態
 * @param {string} sessionId
 * @returns {object|null} 狀態物件，不存在時返回 null
 */
function readState(sessionId) {
  try {
    const raw = readFileSync(paths.session.workflow(sessionId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 寫入 workflow 狀態（原子寫入）
 * @param {string} sessionId
 * @param {object} state
 */
function writeState(sessionId, state) {
  atomicWrite(paths.session.workflow(sessionId), state);
}

/**
 * 初始化新的 workflow 狀態
 * @param {string} sessionId
 * @param {string} workflowType - registry 中的 workflow key
 * @param {string[]} stageList - 要執行的 stage 清單
 * @param {object} [options={}] - 額外選項
 * @param {string} [options.featureName] - 對應的 specs feature 名稱（kebab-case）
 * @returns {object} 新建的狀態
 */
function initState(sessionId, workflowType, stageList, options = {}) {
  // 為重複的 stage 名稱加上編號（如 TEST 出現兩次 → TEST, TEST:2）
  const seen = {};
  const stageKeys = stageList.map((s) => {
    seen[s] = (seen[s] || 0) + 1;
    return seen[s] > 1 ? `${s}:${seen[s]}` : s;
  });

  const stages = {};
  for (const key of stageKeys) {
    const base = key.split(':')[0];
    const entry = { status: 'pending', result: null };
    // TEST stage 需要標記 mode（spec 或 verify）
    if (base === 'TEST') {
      const idx = stageKeys.indexOf(key);
      const hasDevBefore = stageList.slice(0, idx).includes('DEV');
      entry.mode = hasDevBefore ? 'verify' : 'spec';
    }
    stages[key] = entry;
  }

  const state = {
    sessionId,
    workflowType,
    createdAt: new Date().toISOString(),
    currentStage: stageKeys[0] || null,
    stages,
    activeAgents: {},
    failCount: 0,
    rejectCount: 0,
    retroCount: 0,
    featureName: options.featureName || null,
  };

  writeState(sessionId, state);
  return state;
}

/**
 * 更新單一 stage 狀態
 * @param {string} sessionId
 * @param {string} stageKey - stage 名稱（可含編號如 TEST:2）
 * @param {object} update - 要更新的欄位 { status, result, ... }
 * @returns {object} 更新後的完整狀態
 */
function updateStage(sessionId, stageKey, update) {
  const state = readState(sessionId);
  if (!state) throw new Error(`找不到 session 狀態：${sessionId}`);
  if (!state.stages[stageKey]) throw new Error(`找不到 stage：${stageKey}`);

  Object.assign(state.stages[stageKey], update);

  // 自動推進 currentStage
  if (update.status === 'completed') {
    const keys = Object.keys(state.stages);
    const nextPending = keys.find((k) => state.stages[k].status === 'pending');
    if (nextPending) {
      state.currentStage = nextPending;
    }
  }

  writeState(sessionId, state);
  return state;
}

/**
 * 記錄 active agent
 * @param {string} sessionId
 * @param {string} agentName
 * @param {string} stageKey
 */
function setActiveAgent(sessionId, agentName, stageKey) {
  const state = readState(sessionId);
  if (!state) return;

  state.activeAgents[agentName] = {
    stage: stageKey,
    startedAt: new Date().toISOString(),
  };
  writeState(sessionId, state);
}

/**
 * 移除 active agent
 * @param {string} sessionId
 * @param {string} agentName
 */
function removeActiveAgent(sessionId, agentName) {
  const state = readState(sessionId);
  if (!state) return;

  delete state.activeAgents[agentName];
  writeState(sessionId, state);
}

/**
 * 設定對應的 Specs feature 名稱
 * 由 /ot:auto skill 或 workflow skill 在大功能初始化 Specs 時呼叫
 * @param {string} sessionId
 * @param {string} name - feature 名稱（kebab-case）
 */
function setFeatureName(sessionId, name) {
  const current = readState(sessionId);
  if (!current) return;
  current.featureName = name;
  writeState(sessionId, current);
}

/**
 * 原子化更新 state（Compare-and-Swap 模式）
 *
 * 讀取 state → 執行 modifier → 寫回前驗證 mtime 未變。
 * 若被其他 hook 修改則重試（最多 3 次 + exponential jitter），最終 fallback 強制寫入。
 *
 * D1 修復：在每次 retry 前加入 1–5ms 隨機 jitter，縮小 TOCTOU 窗口。
 * Atomics.wait 在 Worker 環境有效，main thread 環境會拋錯 → catch 後降級為忙等短循環。
 *
 * @param {string} sessionId
 * @param {function} modifier - (state) => newState
 * @returns {object} 更新後的 state
 */
function updateStateAtomic(sessionId, modifier) {
  const MAX_RETRIES = 3;
  const filePath = paths.session.workflow(sessionId);

  for (let i = 0; i < MAX_RETRIES; i++) {
    const current = readState(sessionId);
    if (!current) throw new Error(`找不到 session 狀態：${sessionId}`);

    let mtime;
    try { mtime = statSync(filePath).mtimeMs; } catch { mtime = 0; }

    const newState = modifier(current);

    // CAS：寫入前再檢查 mtime
    let currentMtime;
    try { currentMtime = statSync(filePath).mtimeMs; } catch { currentMtime = 0; }

    if (currentMtime !== mtime) {
      // D1：加入 1–5ms 隨機 jitter，縮小 TOCTOU 競爭窗口
      const jitterMs = Math.random() * 4 + 1; // 1.0 ~ 5.0 ms
      try {
        // Worker 環境：Atomics.wait 實際阻塞
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, jitterMs);
      } catch {
        // main thread 環境：Atomics.wait 不可用，改用忙等短循環
        const deadline = Date.now() + Math.ceil(jitterMs);
        while (Date.now() < deadline) { /* spin */ }
      }
      continue; // 被其他 hook 修改，重試
    }

    writeState(sessionId, newState);
    return newState;
  }

  // fallback：最後一次強制寫入
  const current = readState(sessionId);
  if (!current) throw new Error(`找不到 session 狀態：${sessionId}`);
  const newState = modifier(current);
  writeState(sessionId, newState);
  return newState;
}

/**
 * 找到 state 中實際的 stage key（處理重複如 TEST → TEST:2）
 *
 * 優先順序：
 *   1. 完全匹配且 status === 'active'
 *   2. 帶編號且 status === 'active'
 *   3. 任何 pending 的（可能還沒標記 active）
 *
 * @param {object} currentState - workflow state
 * @param {string} baseStage    - 基礎 stage key（不含編號）
 * @returns {string|null}
 */
function findActualStageKey(currentState, baseStage) {
  const stageKeys = Object.keys(currentState.stages);

  // 找正在 active 的
  const active = stageKeys.find(
    (k) => k === baseStage && currentState.stages[k].status === 'active'
  );
  if (active) return active;

  // 找帶編號且 active 的
  const activeNumbered = stageKeys.find(
    (k) => k.startsWith(baseStage + ':') && currentState.stages[k].status === 'active'
  );
  if (activeNumbered) return activeNumbered;

  // 找任何 pending 的（可能還沒標記 active）
  const pending = stageKeys.find(
    (k) => (k === baseStage || k.startsWith(baseStage + ':')) && currentState.stages[k].status === 'pending'
  );
  return pending || null;
}

/**
 * 檢查並行群組是否收斂（全部完成）
 *
 * @param {object} currentState    - workflow state
 * @param {object} parallelGroups  - registry 的 parallelGroups 定義
 * @returns {{ group: string } | null}
 */
function checkParallelConvergence(currentState, parallelGroups) {
  for (const [group, members] of Object.entries(parallelGroups)) {
    const stageKeys = Object.keys(currentState.stages);
    const relevantKeys = stageKeys.filter((k) => {
      const base = k.split(':')[0];
      return members.includes(base);
    });

    if (relevantKeys.length < 2) continue;

    const allCompleted = relevantKeys.every(
      (k) => currentState.stages[k].status === 'completed'
    );
    if (allCompleted) return { group };
  }
  return null;
}

/**
 * 根據當前狀態提示下一步
 *
 * 只有 currentStage 所在的並行群組才會觸發並行提示。
 * 例如 standard 的 [REVIEW + TEST:2] 只在 DEV 完成後才建議並行。
 *
 * @param {object} currentState - workflow state
 * @param {object} options
 * @param {object} options.stages         - registry 的 stages 定義
 * @param {object} options.parallelGroups - registry 的 parallelGroups 定義
 * @returns {string|null}
 */
function getNextStageHint(currentState, { stages, parallelGroups }) {
  const nextStage = currentState.currentStage;
  if (!nextStage) return null;

  // D2：若仍有 active agent，不推進到下一步，提示等待
  const activeAgentKeys = Object.keys(currentState.activeAgents || {});
  if (activeAgentKeys.length > 0) {
    return `等待並行 agent 完成：${activeAgentKeys.join(', ')}`;
  }

  const allCompleted = Object.values(currentState.stages).every(
    (s) => s.status === 'completed'
  );
  if (allCompleted) return null;

  const base = nextStage.split(':')[0];
  const def = stages[base];
  if (!def) return `執行 ${nextStage}`;

  // 只檢查 currentStage 所在的並行群組
  const stageKeys = Object.keys(currentState.stages);
  const nextIdx = stageKeys.indexOf(nextStage);

  for (const [, members] of Object.entries(parallelGroups)) {
    if (!members.includes(base)) continue;

    // 從 currentStage 開始，找連續的 pending 且屬於同群組的 stages
    const parallelCandidates = [];
    for (let i = nextIdx; i < stageKeys.length; i++) {
      const k = stageKeys[i];
      const b = k.split(':')[0];
      if (currentState.stages[k].status !== 'pending') break;
      if (members.includes(b)) {
        parallelCandidates.push(k);
      } else {
        break;
      }
    }

    if (parallelCandidates.length > 1) {
      const labels = parallelCandidates.map((k) => {
        const b = k.split(':')[0];
        return stages[b]?.emoji + ' ' + (stages[b]?.label || k);
      });
      return `並行委派 ${labels.join(' + ')}`;
    }
  }

  return `委派 ${def.emoji} ${def.agent}（${def.label}）`;
}

module.exports = {
  readState,
  writeState,
  initState,
  updateStage,
  setActiveAgent,
  removeActiveAgent,
  setFeatureName,
  updateStateAtomic,
  findActualStageKey,
  checkParallelConvergence,
  getNextStageHint,
};
