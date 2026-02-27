/**
 * pipeline.js — Pipeline 視覺化邏輯
 *
 * window.OT.pipeline 命名空間。
 * 純函式，無 DOM 操作，不依賴 Alpine.js 或外部庫。
 * 由 dashboard.html 直接 <script src> 載入（非 ES Module）。
 */

/* global window */

window.OT = window.OT || {};

window.OT.pipeline = (function () {
  'use strict';

  /**
   * 將 stage key 的冒號後綴移除，取得 baseName。
   * 例如 'TEST:2' → 'TEST'、'REVIEW' → 'REVIEW'
   *
   * @param {string} key
   * @returns {string}
   */
  function baseName(key) {
    const colonIndex = key.indexOf(':');
    if (colonIndex === -1) return key;
    return key.slice(0, colonIndex);
  }

  /**
   * 將扁平 stages 物件轉換為分段渲染結構。
   *
   * 演算法：
   * 1. DEV 之前的所有 stage 都是線性 segment（不參與並行群組匹配）
   * 2. DEV 之後，依並行群組定義合併同群組成員為 parallel segment
   * 3. 並行群組成員只處理一次（避免重複）
   *
   * @param {Object} stages - workflow.json 的 stages 物件，key 為 stage key
   * @param {string} workflowType - 工作流類型（例如 'standard'、'full'）
   * @param {{ [groupName: string]: string[] }} parallelGroupDefs - 群組成員定義
   * @param {{ [workflowType: string]: string[] }} workflowParallelGroups - 各 workflow 使用的群組名稱
   * @returns {Array} 分段結構陣列
   */
  function buildPipelineSegments(stages, workflowType, parallelGroupDefs, workflowParallelGroups) {
    const stageKeys = Object.keys(stages);

    // 空 stages 直接回傳空陣列
    if (stageKeys.length === 0) return [];

    // 取得當前 workflow 使用的並行群組名稱（未知 workflow 則視為空陣列）
    const activeGroupNames = (workflowParallelGroups && workflowParallelGroups[workflowType]) || [];

    // 找到 DEV stage 的 index（分界點）
    const devIndex = stageKeys.indexOf('DEV');

    const segments = [];
    // 已被納入 parallel segment 的 key 集合（避免重複）
    const consumed = new Set();

    stageKeys.forEach(function (key, idx) {
      // 已被並行群組消費，跳過
      if (consumed.has(key)) return;

      // DEV 之前（含 DEV 本身）：全部線性 segment
      if (devIndex === -1 || idx <= devIndex) {
        segments.push({ type: 'stage', key: key, stage: stages[key] });
        return;
      }

      // DEV 之後：嘗試並行群組匹配
      const base = baseName(key);
      let matched = false;

      for (let g = 0; g < activeGroupNames.length; g++) {
        const groupName = activeGroupNames[g];
        const members = (parallelGroupDefs && parallelGroupDefs[groupName]) || [];

        // 確認此 key 的 baseName 屬於該群組
        if (!members.includes(base)) continue;

        // 確認群組內所有成員都在 stageKeys 中出現（以 baseName 比對）
        const allPresent = members.every(function (member) {
          return stageKeys.some(function (k) { return baseName(k) === member; });
        });
        if (!allPresent) continue;

        // 確認此群組尚未建立 parallel segment（以 groupName 判斷）
        const alreadyCreated = segments.some(function (seg) {
          return seg.type === 'parallel' && seg.groupName === groupName;
        });
        if (alreadyCreated) {
          // 已建立過，此 key 仍要 consumed（避免重複出現在線性 segment）
          consumed.add(key);
          matched = true;
          break;
        }

        // 建立 parallel segment：收集 DEV 之後屬於此群組的 stageKeys（依原始順序）
        const parallelStages = [];
        stageKeys.forEach(function (k, ki) {
          if (ki > devIndex && members.includes(baseName(k))) {
            parallelStages.push({ key: k, stage: stages[k] });
            consumed.add(k);
          }
        });

        segments.push({
          type: 'parallel',
          groupName: groupName,
          stages: parallelStages,
        });

        matched = true;
        break;
      }

      // 無群組匹配：線性 segment
      if (!matched) {
        segments.push({ type: 'stage', key: key, stage: stages[key] });
      }
    });

    return segments;
  }

  /**
   * 根據 stage key 和 stages 物件回傳對應 CSS class。
   *
   * @param {string} stageKey
   * @param {Object} stages
   * @returns {string} 'pending' | 'active' | 'completed' | 'failed'
   */
  function getStageClass(stageKey, stages) {
    if (!stages || !stages[stageKey]) return 'pending';
    const status = stages[stageKey].status;
    if (status === 'running' || status === 'active') return 'active';
    if (status === 'completed' || status === 'done') return 'completed';
    if (status === 'failed' || status === 'error') return 'failed';
    return 'pending';
  }

  /**
   * 根據 status 回傳對應圖示字元。
   *
   * @param {string} status
   * @returns {string}
   */
  function getStageIcon(status) {
    if (status === 'running' || status === 'active') return '⚡';
    if (status === 'completed' || status === 'done') return '✅';
    if (status === 'failed' || status === 'error') return '❌';
    return '⏳';
  }

  return {
    buildPipelineSegments: buildPipelineSegments,
    getStageClass: getStageClass,
    getStageIcon: getStageIcon,
  };
}());
