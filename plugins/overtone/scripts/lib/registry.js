'use strict';
/**
 * registry.js — Overtone Single Source of Truth
 *
 * 統一定義所有 agent/stage/emoji/color/model 映射。
 * 所有模組統一從此處 import。
 */

// Stage 定義（14 個 agent 對應 12 個 stage）
const stages = {
  PLAN:       { label: '規劃',     emoji: '📋', agent: 'planner',             color: 'purple' },
  ARCH:       { label: '架構',     emoji: '🏗️', agent: 'architect',           color: 'cyan'   },
  DESIGN:     { label: '設計',     emoji: '🎨', agent: 'designer',            color: 'cyan'   },
  DEV:        { label: '開發',     emoji: '💻', agent: 'developer',           color: 'yellow' },
  DEBUG:      { label: '除錯',     emoji: '🔧', agent: 'debugger',            color: 'orange' },
  REVIEW:     { label: '審查',     emoji: '🔍', agent: 'code-reviewer',       color: 'blue'   },
  TEST:       { label: '測試',     emoji: '🧪', agent: 'tester',              color: 'pink'   },
  SECURITY:   { label: '安全',     emoji: '🛡️', agent: 'security-reviewer',   color: 'red'    },
  'DB-REVIEW':{ label: 'DB審查',   emoji: '🗄️', agent: 'database-reviewer',   color: 'red'    },
  QA:         { label: '驗證',     emoji: '🏁', agent: 'qa',                  color: 'yellow' },
  E2E:        { label: 'E2E',     emoji: '🌐', agent: 'e2e-runner',          color: 'green'  },
  'BUILD-FIX':{ label: '修構建',   emoji: '🔨', agent: 'build-error-resolver', color: 'orange' },
  REFACTOR:   { label: '清理',     emoji: '🧹', agent: 'refactor-cleaner',    color: 'blue'   },
  DOCS:       { label: '文件',     emoji: '📝', agent: 'doc-updater',         color: 'purple' },
};

// Agent Model 分配（可透過環境變數覆蓋）
const agentModels = {
  // Opus（4 個決策型）
  'planner':           'opus',
  'architect':         'opus',
  'code-reviewer':     'opus',
  'security-reviewer': 'opus',

  // Sonnet（9 個執行型）
  'designer':            'sonnet',
  'developer':           'sonnet',
  'debugger':            'sonnet',
  'database-reviewer':   'sonnet',
  'tester':              'sonnet',
  'qa':                  'sonnet',
  'e2e-runner':          'sonnet',
  'build-error-resolver':'sonnet',
  'refactor-cleaner':    'sonnet',

  // Haiku（1 個簡單任務）
  'doc-updater':         'haiku',
};

// 工作流模板（12 個）
// BDD 規則：含 PLAN/ARCH 的 workflow 在 DEV 前加入 TEST:spec
const workflows = {
  // 基本模板（5 個）
  'single':        { label: '單步修改',   stages: ['DEV'] },
  'quick':         { label: '快速開發',   stages: ['DEV', 'REVIEW', 'TEST'] },
  'standard':      { label: '標準功能',   stages: ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'DOCS'] },
  'full':          { label: '完整功能',   stages: ['PLAN', 'ARCH', 'DESIGN', 'TEST', 'DEV', 'REVIEW', 'TEST', 'QA', 'E2E', 'DOCS'] },
  'secure':        { label: '高風險',     stages: ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'SECURITY', 'DOCS'] },

  // 特化模板（7 個，來自 ECC）
  'tdd':           { label: '測試驅動',   stages: ['TEST', 'DEV', 'TEST'] },
  'debug':         { label: '除錯',       stages: ['DEBUG', 'DEV', 'TEST'] },
  'refactor':      { label: '重構',       stages: ['ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST'] },
  'review-only':   { label: '純審查',     stages: ['REVIEW'] },
  'security-only': { label: '安全掃描',   stages: ['SECURITY'] },
  'build-fix':     { label: '修構建',     stages: ['BUILD-FIX'] },
  'e2e-only':      { label: 'E2E 測試',  stages: ['E2E'] },

  // 特化模板（3 個，對應獨立 agent）
  'diagnose':      { label: '診斷',       stages: ['DEBUG'] },
  'clean':         { label: '重構清理',   stages: ['REFACTOR'] },
  'db-review':     { label: 'DB審查',     stages: ['DB-REVIEW'] },
};

// 並行群組：同一群組內的 stages 由 ECC 原生並行（同一訊息多 Task）
const parallelGroups = {
  'quality':        ['REVIEW', 'TEST'],
  'verify':         ['QA', 'E2E'],
  'secure-quality': ['REVIEW', 'TEST', 'SECURITY'],
};

// 預設序列（/ot:auto 參考）
const orchestratePresets = {
  'feature':  ['PLAN', 'DEV', 'REVIEW', 'TEST', 'SECURITY'],
  'bugfix':   ['DEBUG', 'DEV', 'TEST'],
  'refactor': ['ARCH', 'DEV', 'REVIEW', 'TEST'],
  'security': ['SECURITY', 'REVIEW', 'ARCH'],
};

// Loop 設定
const loopDefaults = {
  maxIterations: 100,
  maxConsecutiveErrors: 3,
};

// 重試設定
const retryDefaults = {
  maxRetries: 3,
};

// Timeline 事件類型（18 種，8 分類）
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

  // handoff 類（1）
  'handoff:create':     { label: '交接建立',   category: 'handoff' },

  // parallel 類（2）
  'parallel:start':     { label: '並行啟動',   category: 'parallel' },
  'parallel:converge':  { label: '並行收斂',   category: 'parallel' },

  // error 類（1）
  'error:fatal':        { label: '嚴重錯誤',   category: 'error' },

  // session 類（2）
  'session:start':      { label: '工作階段開始', category: 'session' },
  'session:end':        { label: '工作階段結束', category: 'session' },
};

// Remote 控制命令
const remoteCommands = {
  stop:     { label: '停止 Loop',     description: '標記 Loop 為停止狀態' },
  status:   { label: '查詢狀態',      description: '查詢工作流目前狀態' },
  sessions: { label: '列出工作階段',   description: '列出所有進行中/已完成的工作階段' },
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
  orchestratePresets,
  loopDefaults,
  retryDefaults,
  timelineEvents,
  remoteCommands,
  instinctDefaults,
};
