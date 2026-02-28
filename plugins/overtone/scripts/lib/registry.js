'use strict';
/**
 * registry.js — Overtone Single Source of Truth
 *
 * 統一定義所有 agent/stage/emoji/color/model 映射。
 * 所有模組統一從此處 import。
 */

// Stage 定義（16 個 stage）和 Agent Model 分配從 registry-data.json 讀取
// config-api 需要程式化更新時直接讀寫 registry-data.json
const _registryData = require('./registry-data.json');
const stages = _registryData.stages;
const agentModels = _registryData.agentModels;

// Claude Code 已知工具名稱（用於 disallowedTools/tools 欄位的值域驗證）
const knownTools = [
  'Read', 'Write', 'Edit', 'MultiEdit',
  'Bash', 'Glob', 'Grep',
  'Task', 'TodoRead', 'TodoWrite',
  'NotebookEdit', 'WebFetch',
  'Agent',
];

// Hook 合法 event 名稱（用於 hooks.json 的 event 欄位驗證）
const hookEvents = [
  'SessionStart', 'SessionEnd',
  'PreCompact',
  'UserPromptSubmit',
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'SubagentStop',
  'Stop',
];

// 工作流模板（18 個）
// BDD 規則：含 PLAN/ARCH 的 workflow 在 DEV 前加入 TEST:spec
// D4：parallelGroups 移入各 workflow 定義（per-workflow 自訂），
//     使用 groupName 字串引用，避免在每個 workflow 重複定義成員陣列
const workflows = {
  // 基本模板（5 個）
  'single':        { label: '單步修改',   stages: ['DEV'],                                                                     parallelGroups: [] },
  'quick':         { label: '快速開發',   stages: ['DEV', 'REVIEW', 'TEST', 'RETRO'],                                          parallelGroups: ['quality'] },
  'standard':      { label: '標準功能',   stages: ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS'],          parallelGroups: ['quality'] },
  'full':          { label: '完整功能',   stages: ['PLAN', 'ARCH', 'DESIGN', 'TEST', 'DEV', 'REVIEW', 'TEST', 'QA', 'E2E', 'RETRO', 'DOCS'], parallelGroups: ['quality', 'verify'] },
  'secure':        { label: '高風險',     stages: ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'SECURITY', 'RETRO', 'DOCS'], parallelGroups: ['secure-quality'] },

  // 特化模板（7 個，來自 ECC）
  'tdd':           { label: '測試驅動',   stages: ['TEST', 'DEV', 'TEST'],                                                     parallelGroups: [] },
  'debug':         { label: '除錯',       stages: ['DEBUG', 'DEV', 'TEST'],                                                    parallelGroups: [] },
  'refactor':      { label: '重構',       stages: ['ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST'],                                   parallelGroups: ['quality'] },
  'review-only':   { label: '純審查',     stages: ['REVIEW'],                                                                  parallelGroups: [] },
  'security-only': { label: '安全掃描',   stages: ['SECURITY'],                                                                parallelGroups: [] },
  'build-fix':     { label: '修構建',     stages: ['BUILD-FIX'],                                                               parallelGroups: [] },
  'e2e-only':      { label: 'E2E 測試',  stages: ['E2E'],                                                                     parallelGroups: [] },

  // 特化模板（3 個，對應獨立 agent）
  'diagnose':      { label: '診斷',       stages: ['DEBUG'],                                                                   parallelGroups: [] },
  'clean':         { label: '重構清理',   stages: ['REFACTOR'],                                                                parallelGroups: [] },
  'db-review':     { label: 'DB審查',     stages: ['DB-REVIEW'],                                                               parallelGroups: [] },

  // 產品模板（3 個，PM agent 驅動）
  'product':       { label: '產品功能',   stages: ['PM', 'PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS'],    parallelGroups: ['quality'] },
  'product-full':  { label: '產品完整',   stages: ['PM', 'PLAN', 'ARCH', 'DESIGN', 'TEST', 'DEV', 'REVIEW', 'TEST', 'QA', 'E2E', 'RETRO', 'DOCS'], parallelGroups: ['quality', 'verify'] },
  'discovery':     { label: '產品探索',   stages: ['PM'],                                                                      parallelGroups: [] },
};

// 並行群組成員定義（全域 registry，各 workflow 透過 parallelGroups 欄位引用群組名）
// D4：此為 canonical 成員定義，workflow 層的 parallelGroups 欄位是引用列表（非重複定義）
const parallelGroupDefs = {
  'quality':        ['REVIEW', 'TEST'],
  'verify':         ['QA', 'E2E'],
  'secure-quality': ['REVIEW', 'TEST', 'SECURITY'],
};

// 向後相容：parallelGroups 從 workflows 動態推導（所有唯一群組名對應的成員定義）
// 外部模組 import parallelGroups 仍可正常使用，行為與舊版完全一致
const parallelGroups = (() => {
  const result = {};
  for (const wf of Object.values(workflows)) {
    for (const groupName of (wf.parallelGroups || [])) {
      if (parallelGroupDefs[groupName] && !result[groupName]) {
        result[groupName] = parallelGroupDefs[groupName];
      }
    }
  }
  return result;
})();

// Loop 設定
const loopDefaults = {
  maxIterations: 100,
  maxConsecutiveErrors: 3,
};

// 重試設定
const retryDefaults = {
  maxRetries: 3,
};

// Timeline 事件類型（23 種，11 分類）
// 已移除：handoff:create（Handoff 為虛擬，永遠不會 emit）
const timelineEvents = {
  // workflow 類（3）
  'workflow:start':     { label: '工作流啟動', category: 'workflow' },
  'workflow:complete':  { label: '工作流完成', category: 'workflow' },
  'workflow:abort':     { label: '工作流中斷', category: 'workflow' },

  // stage 類（3）
  'stage:start':        { label: '階段開始',   category: 'stage' },
  'stage:complete':     { label: '階段完成',   category: 'stage' },
  'stage:retry':        { label: '階段重試',   category: 'stage' },

  // agent 類（3）
  'agent:delegate':     { label: '委派代理',   category: 'agent' },
  'agent:complete':     { label: '代理完成',   category: 'agent' },
  'agent:error':        { label: '代理錯誤',   category: 'agent' },

  // loop 類（3）
  'loop:start':         { label: '循環啟動',   category: 'loop' },
  'loop:advance':       { label: '下一個任務', category: 'loop' },
  'loop:complete':      { label: '循環完成',   category: 'loop' },

  // parallel 類（2）
  'parallel:start':     { label: '並行啟動',   category: 'parallel' },
  'parallel:converge':  { label: '並行收斂',   category: 'parallel' },

  // grader 類（1）
  'grader:score':       { label: 'Grader 評分', category: 'grader' },

  // specs 類（2）
  'specs:init':         { label: 'Specs 初始化', category: 'specs' },
  'specs:archive':      { label: 'Specs 歸檔',   category: 'specs' },

  // error 類（1）
  'error:fatal':        { label: '嚴重錯誤',   category: 'error' },

  // session 類（3）
  'session:start':      { label: '工作階段開始', category: 'session' },
  'session:end':        { label: '工作階段結束', category: 'session' },
  'session:compact':    { label: 'Context 壓縮', category: 'session' },

  // tool 類（1）
  'tool:failure':       { label: '工具失敗',     category: 'tool' },

  // system 類（1）
  'system:warning':     { label: '系統警告',     category: 'system' },
};

// Remote 控制命令
const remoteCommands = {
  stop:     { label: '停止 Loop',     description: '標記 Loop 為停止狀態' },
  status:   { label: '查詢狀態',      description: '查詢工作流目前狀態' },
  sessions: { label: '列出工作階段',   description: '列出所有進行中/已完成的工作階段' },
};

// Specs 設定：每種 workflow 對應的 specs 文件類型
// 含 PLAN/ARCH/TEST 的 workflow 需要 bdd 規格，其他只需 tasks
const specsConfig = {
  'full':          ['tasks', 'bdd'],
  'standard':      ['tasks', 'bdd'],
  'secure':        ['tasks', 'bdd'],
  'refactor':      ['tasks', 'bdd'],
  'tdd':           ['tasks', 'bdd'],
  'quick':         ['tasks'],
  'debug':         ['tasks'],
  'single':        [],
  'review-only':   [],
  'security-only': [],
  'build-fix':     [],
  'e2e-only':      [],
  'diagnose':      [],
  'clean':         [],
  'db-review':     [],
  'product':       ['tasks', 'bdd'],
  'product-full':  ['tasks', 'bdd'],
  'discovery':     [],
};

// Instinct 信心分數設定
const instinctDefaults = {
  initialConfidence: 0.3,
  confirmBoost: 0.05,
  contradictionPenalty: -0.10,
  weeklyDecay: -0.02,
  autoApplyThreshold: 0.7,
  autoDeleteThreshold: 0.2,
  skillEvolutionCount: 5,
  agentEvolutionCount: 8,
};

module.exports = {
  stages,
  agentModels,
  workflows,
  parallelGroups,
  parallelGroupDefs,
  loopDefaults,
  retryDefaults,
  timelineEvents,
  remoteCommands,
  instinctDefaults,
  specsConfig,
  knownTools,
  hookEvents,
};
