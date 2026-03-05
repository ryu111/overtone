'use strict';
/**
 * interview.js — Deep PM Interview Engine
 *
 * 提供結構化多輪訪談 API，涵蓋五面向問題庫、session 持久化、以及 BDD Project Spec 產生能力。
 *
 * API：
 *   init(featureName, outputPath, options?)        → InterviewSession
 *   nextQuestion(session)                           → Question | null
 *   recordAnswer(session, questionId, answer)       → InterviewSession（純函式）
 *   isComplete(session)                             → boolean
 *   generateSpec(session)                           → ProjectSpec（並寫入 outputPath）
 *   loadSession(statePath)                          → InterviewSession | null
 *   saveSession(session, statePath)                 → void
 *   queryPastInterviews(projectRoot, options?)      → { sessions, total }
 *   extractInsights(sessions)                       → { commonRequirements, boundaryConditions, userPreferences }
 *
 * 資料模型：
 *   InterviewSession：{ featureName, outputPath, answers, startedAt, completedAt, options }
 *   Question：{ id, facet, text, required, dependsOn }
 *   ProjectSpec：{ feature, generatedAt, facets: { functional, flow, ui, edgeCases, acceptance } }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { atomicWrite } = require('./utils');

// ── 問題庫定義 ──

/**
 * 五面向靜態問題庫
 * 總題數設計在 15-30 之間（BDD Feature 7 要求）
 *
 * id 格式：{facet縮寫}-{序號}
 *   func-N    → functional
 *   flow-N    → flow
 *   ui-N      → ui
 *   edge-N    → edge-cases
 *   acc-N     → acceptance
 */
const QUESTION_BANK = [
  // ── functional（3 必問 + 2 補充）──
  {
    id: 'func-1',
    facet: 'functional',
    text: '請描述這個功能的核心目的是什麼？解決了什麼問題？',
    required: true,
    dependsOn: null,
  },
  {
    id: 'func-2',
    facet: 'functional',
    text: '這個功能的主要使用者是誰？他們的使用情境是什麼？',
    required: true,
    dependsOn: null,
  },
  {
    id: 'func-3',
    facet: 'functional',
    text: '功能的輸入是什麼？輸出或結果是什麼？',
    required: true,
    dependsOn: null,
  },
  {
    id: 'func-4',
    facet: 'functional',
    text: '這個功能與系統中哪些其他功能有互動或依賴關係？',
    required: false,
    dependsOn: null,
  },
  {
    id: 'func-5',
    facet: 'functional',
    text: '有哪些功能是這次明確不做的（Out of Scope）？',
    required: false,
    dependsOn: 'func-1',
  },

  // ── flow（3 必問 + 2 補充）──
  {
    id: 'flow-1',
    facet: 'flow',
    text: '使用者完成這個功能的主要操作步驟是什麼？請列出 3-5 個步驟。',
    required: true,
    dependsOn: null,
  },
  {
    id: 'flow-2',
    facet: 'flow',
    text: '操作成功後的結果狀態是什麼？系統會顯示或做什麼？',
    required: true,
    dependsOn: null,
  },
  {
    id: 'flow-3',
    facet: 'flow',
    text: '操作失敗時的主要失敗路徑是什麼？系統如何通知使用者？',
    required: true,
    dependsOn: null,
  },
  {
    id: 'flow-4',
    facet: 'flow',
    text: '使用者可以中途取消操作嗎？如何恢復到操作前的狀態？',
    required: false,
    dependsOn: 'flow-1',
  },
  {
    id: 'flow-5',
    facet: 'flow',
    text: '有哪些狀態轉換？請描述主要的狀態機（如：草稿→送出→完成）。',
    required: false,
    dependsOn: null,
  },

  // ── ui（0 必問 + 4 補充）──
  {
    id: 'ui-1',
    facet: 'ui',
    text: '主要的介面元素有哪些？（如：表單、按鈕、列表、對話框）',
    required: false,
    dependsOn: null,
  },
  {
    id: 'ui-2',
    facet: 'ui',
    text: '使用者互動的模式是什麼？（如：點擊、拖曳、輸入、選擇）',
    required: false,
    dependsOn: null,
  },
  {
    id: 'ui-3',
    facet: 'ui',
    text: '操作過程中，系統如何給予即時反饋？（如：loading、進度條、即時驗證）',
    required: false,
    dependsOn: null,
  },
  {
    id: 'ui-4',
    facet: 'ui',
    text: '有無無障礙設計（a11y）或多語系的需求？',
    required: false,
    dependsOn: null,
  },

  // ── edge-cases（3 必問 + 2 補充）──
  {
    id: 'edge-1',
    facet: 'edge-cases',
    text: '最常見的錯誤情況有哪些？系統應如何處理？',
    required: true,
    dependsOn: null,
  },
  {
    id: 'edge-2',
    facet: 'edge-cases',
    text: '有哪些極端輸入情況需要特別處理？（如：空值、超長字串、特殊字符）',
    required: true,
    dependsOn: null,
  },
  {
    id: 'edge-3',
    facet: 'edge-cases',
    text: '多個使用者同時操作同一資源時，應如何處理並發衝突？',
    required: true,
    dependsOn: null,
  },
  {
    id: 'edge-4',
    facet: 'edge-cases',
    text: '網路中斷或系統逾時時，資料如何保護？使用者如何恢復？',
    required: false,
    dependsOn: null,
  },
  {
    id: 'edge-5',
    facet: 'edge-cases',
    text: '有哪些安全性考量？（如：權限驗證、資料隔離、防止惡意輸入）',
    required: false,
    dependsOn: null,
  },

  // ── acceptance（3 必問 + 2 補充）──
  {
    id: 'acc-1',
    facet: 'acceptance',
    text: '功能「完成」的定義是什麼？有哪些可量測的驗收標準？',
    required: true,
    dependsOn: null,
  },
  {
    id: 'acc-2',
    facet: 'acceptance',
    text: '效能指標是什麼？（如：回應時間 < 200ms、每秒支援 1000 請求）',
    required: true,
    dependsOn: null,
  },
  {
    id: 'acc-3',
    facet: 'acceptance',
    text: '請描述 3 個關鍵的 BDD 場景：1 個正常路徑、1 個錯誤路徑、1 個邊界情況。',
    required: true,
    dependsOn: null,
  },
  {
    id: 'acc-4',
    facet: 'acceptance',
    text: '上線前需要通過哪些測試？（如：單元測試、整合測試、手動 UAT）',
    required: false,
    dependsOn: null,
  },
  {
    id: 'acc-5',
    facet: 'acceptance',
    text: '有哪些監控或告警指標需要在上線後追蹤？',
    required: false,
    dependsOn: null,
  },
];

// ── 常數 ──

/** 面向排序（nextQuestion 按此順序返回問題） */
const FACET_ORDER = ['functional', 'flow', 'ui', 'edge-cases', 'acceptance'];

/** 預設選項 */
const DEFAULT_OPTIONS = {
  minAnswersPerFacet: 2,
  skipFacets: [],
};

/** 必問面向（ui 預設為可選面向，不參與完成度判斷） */
const REQUIRED_FACETS = ['functional', 'flow', 'edge-cases', 'acceptance'];

// ── 工具函式 ──

/**
 * 取得問題庫中特定面向的所有問題
 * @param {string} facet
 * @returns {object[]}
 */
function getQuestionsByFacet(facet) {
  return QUESTION_BANK.filter(q => q.facet === facet);
}

/**
 * 取得 session 中特定面向已回答的必問題數量
 * @param {object} session
 * @param {string} facet
 * @returns {number}
 */
function countAnsweredRequired(session, facet) {
  const answers = session.answers || {};
  return QUESTION_BANK.filter(
    q => q.facet === facet && q.required && Object.prototype.hasOwnProperty.call(answers, q.id)
  ).length;
}

/**
 * 從 edge-cases 和 acceptance 回答拆分補充 BDD 場景
 * @param {object} session
 * @param {number} needed - 需要補充的場景數
 * @returns {object[]} BDDScenario 陣列
 */
function buildSupplementaryScenarios(session, needed) {
  const answers = session.answers || {};
  const supplementary = [];

  // 從 edge-cases 和 acceptance 的回答中拆分
  const sourceFacets = ['edge-cases', 'acceptance'];
  for (const facet of sourceFacets) {
    if (supplementary.length >= needed) break;
    const facetQuestions = QUESTION_BANK.filter(q => q.facet === facet);
    for (const q of facetQuestions) {
      if (supplementary.length >= needed) break;
      const answer = answers[q.id];
      if (!answer) continue;

      // 將回答拆分成多個場景（按句號或換行分割）
      const parts = answer
        .split(/[。\n.]+/)
        .map(s => s.trim())
        .filter(s => s.length > 5);

      for (const part of parts) {
        if (supplementary.length >= needed) break;
        supplementary.push({
          title: `補充場景：${part.slice(0, 50)}`,
          given: `系統處於 ${session.featureName} 相關狀態`,
          when: part,
          then: '系統應按預期行為處理',
        });
      }
    }
  }

  // 補充到達需要數量（用通用場景填充）
  while (supplementary.length < needed) {
    supplementary.push({
      title: `補充場景 ${supplementary.length + 1}：系統行為驗證`,
      given: `系統已初始化並準備好 ${session.featureName} 功能`,
      when: '使用者執行相關操作',
      then: '系統應按設計規格回應',
    });
  }

  return supplementary;
}

/**
 * 從 session 回答組裝面向摘要
 * @param {object} session
 * @param {string} facet
 * @returns {string[]} 該面向的回答清單
 */
function collectFacetAnswers(session, facet) {
  const answers = session.answers || {};
  return QUESTION_BANK
    .filter(q => q.facet === facet && Object.prototype.hasOwnProperty.call(answers, q.id))
    .map(q => answers[q.id])
    .filter(a => a !== undefined && a !== null);
}

/**
 * 從 acceptance 面向的回答建立 BDD 場景，並自動從各 facet 衍生額外場景
 * @param {object} session
 * @returns {object[]} BDDScenario 陣列（去重後）
 */
function buildBDDScenarios(session) {
  const answers = session.answers || {};
  const scenarios = [];
  const seenTitles = new Set();

  /**
   * 安全推入場景（title 去重）
   */
  function pushScenario(s) {
    if (!seenTitles.has(s.title)) {
      seenTitles.add(s.title);
      scenarios.push(s);
    }
  }

  // ── 1. 從 acceptance 問題的回答提取場景 ──
  const accQuestions = QUESTION_BANK.filter(q => q.facet === 'acceptance');
  for (const q of accQuestions) {
    const answer = answers[q.id];
    if (!answer) continue;

    const parts = answer
      .split(/[。\n.]+/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    if (parts.length === 0 && answer.trim().length > 0) {
      parts.push(answer.trim());
    }

    for (const part of parts) {
      pushScenario({
        title: `${q.text.slice(0, 30)}：${part.slice(0, 40)}`,
        given: `${session.featureName} 功能已啟用`,
        when: part,
        then: '系統應按預期完成操作並給予適當反饋',
      });
    }
  }

  // ── 2. 從 edgeCases facet 衍生邊界條件場景 ──
  const edgeQuestions = QUESTION_BANK.filter(q => q.facet === 'edge-cases');
  for (const q of edgeQuestions) {
    const answer = answers[q.id];
    if (!answer) continue;

    const parts = answer
      .split(/[。\n.]+/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    for (const part of parts) {
      pushScenario({
        title: `邊界場景：${part.slice(0, 50)}`,
        given: `${session.featureName} 功能面對邊界條件`,
        when: part,
        then: '系統應妥善處理邊界情況，不崩潰並給予明確提示',
      });
    }
  }

  // ── 3. 從 flow facet 衍生流程場景 ──
  const flowQuestions = QUESTION_BANK.filter(q => q.facet === 'flow');
  for (const q of flowQuestions) {
    const answer = answers[q.id];
    if (!answer) continue;

    const parts = answer
      .split(/[。\n.]+/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    for (const part of parts) {
      pushScenario({
        title: `流程場景：${part.slice(0, 50)}`,
        given: `使用者在 ${session.featureName} 操作流程中`,
        when: part,
        then: '系統應正確轉換至下一狀態並通知使用者',
      });
    }
  }

  // ── 4. 若場景仍不足 10 個，呼叫 enrichBDDScenarios 補充 ──
  if (scenarios.length < 10) {
    const enriched = enrichBDDScenarios(scenarios, session);
    // enriched 已去重並包含原始場景，直接取差集新增
    for (const s of enriched) {
      if (!seenTitles.has(s.title)) {
        seenTitles.add(s.title);
        scenarios.push(s);
      }
    }
  }

  return scenarios;
}

/**
 * 為 BDD 場景陣列補充場景，確保達到 ≥10 個
 *
 * 策略：
 *   1. 若場景數 < 10，從 functional facet 的每條回答衍生 happy path 場景
 *   2. 若仍不足，加入通用模板（空輸入、權限不足、網路逾時），但跳過 edgeCases 中已涵蓋的
 *   3. 最後 fallback 到 buildSupplementaryScenarios
 *
 * @param {object[]} scenarios - 現有場景陣列（不會被修改）
 * @param {object} session - InterviewSession
 * @returns {object[]} enriched 場景陣列（包含原始 + 補充，已去重）
 */
function enrichBDDScenarios(scenarios, session) {
  const answers = session.answers || {};
  // 先對傳入的 base 陣列進行去重，確保 result 不含重複 title
  const seenTitles = new Set();
  const result = [];
  for (const s of scenarios) {
    if (!seenTitles.has(s.title)) {
      seenTitles.add(s.title);
      result.push(s);
    }
  }

  function pushScenario(s) {
    if (!seenTitles.has(s.title)) {
      seenTitles.add(s.title);
      result.push(s);
    }
  }

  // ── 1. 從 functional facet 衍生 happy path 場景 ──
  if (result.length < 10) {
    const funcQuestions = QUESTION_BANK.filter(q => q.facet === 'functional');
    for (const q of funcQuestions) {
      if (result.length >= 10) break;
      const answer = answers[q.id];
      if (!answer) continue;

      const parts = answer
        .split(/[。\n.]+/)
        .map(s => s.trim())
        .filter(s => s.length > 5);

      for (const part of parts) {
        if (result.length >= 10) break;
        pushScenario({
          title: `功能場景：${part.slice(0, 50)}`,
          given: `${session.featureName} 功能已就緒`,
          when: `使用者執行：${part.slice(0, 60)}`,
          then: '系統應依功能定義完成操作並回傳成功結果',
        });
      }
    }
  }

  // ── 2. 通用場景模板（若 edgeCases 未涵蓋） ──
  const edgeAnswers = QUESTION_BANK
    .filter(q => q.facet === 'edge-cases')
    .map(q => answers[q.id] || '')
    .join(' ')
    .toLowerCase();

  const genericTemplates = [
    {
      keywords: ['空', '空白', 'empty', '空值', '空輸入'],
      scenario: {
        title: '通用場景：空輸入處理',
        given: `${session.featureName} 功能的輸入表單已開啟`,
        when: '使用者未填寫任何內容直接送出',
        then: '系統應顯示驗證錯誤提示，且不送出請求',
      },
    },
    {
      keywords: ['權限', '認證', 'auth', '未登入', '未授權'],
      scenario: {
        title: '通用場景：權限不足',
        given: `使用者未具備 ${session.featureName} 功能所需的操作權限`,
        when: '使用者嘗試執行需要權限的操作',
        then: '系統應拒絕操作並顯示權限不足的明確提示',
      },
    },
    {
      keywords: ['網路', 'timeout', '逾時', '中斷', '連線'],
      scenario: {
        title: '通用場景：網路逾時',
        given: `使用者正在使用 ${session.featureName} 功能`,
        when: '網路連線中斷或請求逾時',
        then: '系統應顯示友善錯誤訊息，並提供重試或恢復選項',
      },
    },
  ];

  for (const { keywords, scenario } of genericTemplates) {
    if (result.length >= 10) break;
    // 若 edge cases 回答中已提及此議題，跳過（避免重複）
    const alreadyCovered = keywords.some(kw => edgeAnswers.includes(kw));
    if (!alreadyCovered) {
      pushScenario(scenario);
    }
  }

  // ── 3. Fallback：若仍不足 10 個，用補充場景填充 ──
  if (result.length < 10) {
    const supplementary = buildSupplementaryScenarios(session, 10 - result.length);
    for (const s of supplementary) {
      pushScenario(s);
    }
  }

  return result;
}

/**
 * 將 ProjectSpec 序列化為 Markdown 格式
 * @param {object} spec
 * @returns {string}
 */
function specToMarkdown(spec) {
  const lines = [];

  lines.push(`# ${spec.feature} — Project Spec`);
  lines.push('');
  lines.push(`> 產生時間：${spec.generatedAt}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // functional
  lines.push('## 功能定義（Functional）');
  lines.push('');
  for (const item of spec.facets.functional) {
    lines.push(`- ${item}`);
  }
  lines.push('');

  // flow
  lines.push('## 操作流程（Flow）');
  lines.push('');
  for (const item of spec.facets.flow) {
    lines.push(`- ${item}`);
  }
  lines.push('');

  // ui
  if (spec.facets.ui && spec.facets.ui.length > 0) {
    lines.push('## UI 設計（UI）');
    lines.push('');
    for (const item of spec.facets.ui) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  // edgeCases
  lines.push('## 邊界條件（Edge Cases）');
  lines.push('');
  for (const item of spec.facets.edgeCases) {
    lines.push(`- ${item}`);
  }
  lines.push('');

  // acceptance（BDD 場景）
  lines.push('## 驗收標準（Acceptance Criteria）');
  lines.push('');
  lines.push('### BDD 場景');
  lines.push('');
  for (const scenario of spec.facets.acceptance) {
    lines.push(`#### ${scenario.title}`);
    lines.push('');
    lines.push(`GIVEN ${scenario.given}`);
    lines.push(`WHEN ${scenario.when}`);
    lines.push(`THEN ${scenario.then}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Public API ──

/**
 * 初始化一個新的訪談 session
 *
 * @param {string} featureName - 功能名稱（不可為空字串）
 * @param {string} outputPath - Spec 輸出目錄路徑
 * @param {object} [options] - 選項覆寫
 * @param {number} [options.minAnswersPerFacet=2] - 每個面向的最低必答數
 * @param {string[]} [options.skipFacets=[]] - 要跳過的面向清單
 * @returns {object} InterviewSession
 * @throws {Error} 若 featureName 為空字串
 */
function init(featureName, outputPath, options) {
  if (!featureName || typeof featureName !== 'string' || featureName.trim() === '') {
    const err = new Error('[INVALID_INPUT] featureName 不可為空');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  return {
    featureName,
    outputPath,
    answers: {},
    startedAt: new Date().toISOString(),
    completedAt: undefined,
    options: {
      ...DEFAULT_OPTIONS,
      ...options,
    },
  };
}

/**
 * 取得下一個待回答的問題
 *
 * 順序：按 FACET_ORDER 面向順序，先返回必問題，再返回補充題。
 * dependsOn 前置問題未回答時跳過該問題。
 *
 * @param {object} session
 * @returns {object|null} Question 或 null（全部完成時）
 */
function nextQuestion(session) {
  // 防禦性：answers 為 null 時當成空物件
  const answers = session && session.answers ? session.answers : {};
  const skipFacets = (session && session.options && session.options.skipFacets) || [];

  // 過濾已跳過面向的問題
  const available = QUESTION_BANK.filter(q => !skipFacets.includes(q.facet));

  /**
   * 判斷問題是否可以作答（前置問題已回答）
   */
  function isDependencySatisfied(question) {
    if (!question.dependsOn) return true;
    return Object.prototype.hasOwnProperty.call(answers, question.dependsOn);
  }

  /**
   * 問題是否已回答
   */
  function isAnswered(question) {
    return Object.prototype.hasOwnProperty.call(answers, question.id);
  }

  // 第一輪：按面向順序，取第一個未回答的必問題
  for (const facet of FACET_ORDER) {
    if (skipFacets.includes(facet)) continue;
    const facetRequired = available.filter(q => q.facet === facet && q.required);
    for (const q of facetRequired) {
      if (!isAnswered(q) && isDependencySatisfied(q)) {
        return q;
      }
    }
  }

  // 第二輪：按面向順序，取第一個未回答的補充題
  for (const facet of FACET_ORDER) {
    if (skipFacets.includes(facet)) continue;
    const facetOptional = available.filter(q => q.facet === facet && !q.required);
    for (const q of facetOptional) {
      if (!isAnswered(q) && isDependencySatisfied(q)) {
        return q;
      }
    }
  }

  return null;
}

/**
 * 記錄一個問題的回答（純函式，回傳新 session）
 *
 * @param {object} session - 原始 InterviewSession
 * @param {string} questionId - 問題 id
 * @param {string} answer - 回答內容（空字串也接受）
 * @returns {object} 新的 InterviewSession
 */
function recordAnswer(session, questionId, answer) {
  return {
    ...session,
    answers: {
      ...session.answers,
      [questionId]: answer,
    },
  };
}

/**
 * 判斷訪談是否完成
 *
 * 完成條件：每個必問面向（排除 skipFacets）的必問題回答數 >= minAnswersPerFacet。
 * ui 面向為全補充題，不影響完成判斷。
 *
 * @param {object} session
 * @returns {boolean}
 */
function isComplete(session) {
  const minAnswers = (session.options && session.options.minAnswersPerFacet) || DEFAULT_OPTIONS.minAnswersPerFacet;
  const skipFacets = (session.options && session.options.skipFacets) || [];

  // 必問面向：排除 ui 和 skipFacets 中的面向
  const facetsToCheck = REQUIRED_FACETS.filter(f => !skipFacets.includes(f));

  for (const facet of facetsToCheck) {
    const answered = countAnsweredRequired(session, facet);
    if (answered < minAnswers) return false;
  }

  return true;
}

/**
 * 從 session 回答產生 ProjectSpec 並寫入 outputPath/project-spec.md
 *
 * @param {object} session
 * @returns {object} ProjectSpec
 * @throws {Error} 若寫入失敗（WRITE_ERROR）
 */
function generateSpec(session) {
  const spec = {
    feature: session.featureName,
    generatedAt: new Date().toISOString(),
    facets: {
      functional: collectFacetAnswers(session, 'functional'),
      flow: collectFacetAnswers(session, 'flow'),
      ui: collectFacetAnswers(session, 'ui'),
      edgeCases: collectFacetAnswers(session, 'edge-cases'),
      acceptance: enrichBDDScenarios(buildBDDScenarios(session), session),
    },
    rawAnswers: { ...session.answers },
  };

  // 寫入 Markdown 檔案
  const outputDir = session.outputPath;
  const outputFile = path.join(outputDir, 'project-spec.md');
  const markdown = specToMarkdown(spec);

  try {
    atomicWrite(outputFile, markdown);
  } catch (err) {
    const writeErr = new Error(`[WRITE_ERROR] 無法寫入 ${outputFile}：${err.message}`);
    writeErr.code = 'WRITE_ERROR';
    throw writeErr;
  }

  return spec;
}

/**
 * 從狀態檔還原 InterviewSession
 *
 * @param {string} statePath - 狀態檔路徑（interview-state.json）
 * @returns {object|null} InterviewSession 或 null（不存在或損壞時）
 */
function loadSession(statePath) {
  if (!fs.existsSync(statePath)) {
    return null;
  }

  let raw;
  try {
    raw = fs.readFileSync(statePath, 'utf8');
  } catch {
    return null;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  // 從持久化資料重建 session 物件
  return {
    featureName: data.featureName,
    outputPath: data.outputPath,
    answers: data.answers || {},
    startedAt: data.startedAt,
    completedAt: data.completedAt,
    options: {
      ...DEFAULT_OPTIONS,
      ...data.options,
    },
    domainResearch: data.domainResearch || undefined,
  };
}

/**
 * 將 InterviewSession 儲存到狀態檔
 *
 * @param {object} session
 * @param {string} statePath - 目標路徑（interview-state.json）
 */
function saveSession(session, statePath) {
  const data = {
    version: 1,
    featureName: session.featureName,
    outputPath: session.outputPath,
    answers: session.answers || {},
    startedAt: session.startedAt,
    completedAt: session.completedAt || null,
    options: session.options,
    domainResearch: session.domainResearch || null,
  };
  atomicWrite(statePath, data);
}

// ── 跨 Session 記憶 API ──

/**
 * 查詢過去的訪談記錄
 *
 * 從 ~/.overtone/sessions/{sessionId}/interview-state.json 搜尋過去的訪談。
 *
 * @param {string} projectRoot - 專案根目錄（保留供未來依專案過濾使用）
 * @param {object} [options] - 選項
 * @param {number} [options.limit=10] - 最多回傳幾筆
 * @param {string} [options.feature] - 只回傳特定 feature 的訪談
 * @returns {{ sessions: Array<{sessionId, feature, completedAt, questionCount, answerSummary}>, total: number }}
 */
function queryPastInterviews(projectRoot, options) {
  const limit = (options && options.limit) || 10;
  const filterFeature = options && options.feature;

  const OVERTONE_HOME = path.join(os.homedir(), '.overtone');
  const SESSIONS_DIR = path.join(OVERTONE_HOME, 'sessions');

  // 讀取 sessions 目錄
  let sessionDirs = [];
  try {
    sessionDirs = fs.readdirSync(SESSIONS_DIR);
  } catch {
    // sessions 目錄不存在或無法讀取時回傳空結果
    return { sessions: [], total: 0 };
  }

  const results = [];

  for (const sid of sessionDirs) {
    const statePath = path.join(SESSIONS_DIR, sid, 'interview-state.json');

    let raw;
    try {
      raw = fs.readFileSync(statePath, 'utf8');
    } catch {
      continue; // 此 session 無訪談記錄，跳過
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue; // JSON 損壞，跳過
    }

    if (!data.featureName) continue;

    // 依 feature 過濾
    if (filterFeature && data.featureName !== filterFeature) continue;

    const answers = data.answers || {};
    const questionCount = Object.keys(answers).length;

    // 從 functional 面向回答建立摘要
    const functionalAnswers = QUESTION_BANK
      .filter(q => q.facet === 'functional' && Object.prototype.hasOwnProperty.call(answers, q.id))
      .map(q => answers[q.id])
      .filter(a => a);

    const answerSummary = functionalAnswers.slice(0, 2).join(' | ') || '';

    results.push({
      sessionId: sid,
      feature: data.featureName,
      completedAt: data.completedAt || null,
      questionCount,
      answerSummary,
    });
  }

  // 依 completedAt 降冪排序（completed 的優先，然後是較新的）
  results.sort((a, b) => {
    if (a.completedAt && !b.completedAt) return -1;
    if (!a.completedAt && b.completedAt) return 1;
    if (a.completedAt && b.completedAt) {
      return new Date(b.completedAt) - new Date(a.completedAt);
    }
    return 0;
  });

  const total = results.length;
  return { sessions: results.slice(0, limit), total };
}

/**
 * 從多個訪談 session 中提取共通洞察（純函式）
 *
 * 分析多個訪談記錄，找出共通的功能需求、邊界條件、使用者偏好。
 *
 * @param {Array<{sessionId, feature, completedAt, questionCount, answerSummary}>} sessions
 *   queryPastInterviews 回傳的 sessions 陣列（需包含完整 answers，來自 loadSession）
 * @returns {{
 *   commonRequirements: string[],
 *   boundaryConditions: string[],
 *   userPreferences: string[]
 * }}
 */
function extractInsights(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return { commonRequirements: [], boundaryConditions: [], userPreferences: [] };
  }

  // 收集各面向的所有回答（用詞頻統計找共通）
  const allFunctionalAnswers = [];
  const allEdgeCaseAnswers = [];
  const allFlowAnswers = [];

  for (const s of sessions) {
    const answers = s.answers;
    if (!answers || typeof answers !== 'object') continue;

    // functional → commonRequirements 來源
    QUESTION_BANK
      .filter(q => q.facet === 'functional')
      .forEach(q => {
        if (Object.prototype.hasOwnProperty.call(answers, q.id) && answers[q.id]) {
          allFunctionalAnswers.push(answers[q.id]);
        }
      });

    // edge-cases → boundaryConditions 來源
    QUESTION_BANK
      .filter(q => q.facet === 'edge-cases')
      .forEach(q => {
        if (Object.prototype.hasOwnProperty.call(answers, q.id) && answers[q.id]) {
          allEdgeCaseAnswers.push(answers[q.id]);
        }
      });

    // flow + ui → userPreferences 來源
    QUESTION_BANK
      .filter(q => q.facet === 'flow' || q.facet === 'ui')
      .forEach(q => {
        if (Object.prototype.hasOwnProperty.call(answers, q.id) && answers[q.id]) {
          allFlowAnswers.push(answers[q.id]);
        }
      });
  }

  /**
   * 從回答列表提取關鍵詞，依出現頻率排序後取前 N 條
   * 策略：將每條回答視為一個洞察點（去重後保留）
   */
  function deduplicateInsights(answers, maxCount) {
    const seen = new Set();
    const result = [];
    for (const a of answers) {
      const normalized = a.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
      if (result.length >= maxCount) break;
    }
    return result;
  }

  return {
    commonRequirements: deduplicateInsights(allFunctionalAnswers, 5),
    boundaryConditions: deduplicateInsights(allEdgeCaseAnswers, 5),
    userPreferences: deduplicateInsights(allFlowAnswers, 5),
  };
}

// ── Domain Research ──

/** researchDomain 的預設 timeout（毫秒） */
const DOMAIN_RESEARCH_TIMEOUT_MS = 60000;

/**
 * 針對指定領域進行自主研究，產出摘要、核心概念和深度問題
 *
 * 使用 claude -p headless 模式研究領域知識，失敗時 graceful fallback 回傳空結果。
 *
 * @param {string} topic - 使用者描述的領域或需求（字串）
 * @param {object} [options] - 選項
 * @param {number} [options.timeout=60000] - 逾時毫秒數
 * @returns {{ summary: string, concepts: string[], questions: string[] }}
 */
function researchDomain(topic, options) {
  const result = { summary: '', concepts: [], questions: [] };

  if (!topic || typeof topic !== 'string' || topic.trim() === '') {
    return result;
  }

  const timeout = (options && options.timeout) || DOMAIN_RESEARCH_TIMEOUT_MS;

  const prompt = [
    `請研究「${topic.trim()}」領域，以 JSON 格式回傳下列三個欄位（繁體中文）：`,
    ``,
    `{`,
    `  "summary": "200-500 字的領域摘要，說明核心概念、應用情境與重要性",`,
    `  "concepts": ["核心概念 1", "核心概念 2", "...（5-10 個）"],`,
    `  "questions": ["深度問題 1", "深度問題 2", "...（5-8 個，PM 可用於訪談中追問）"]`,
    `}`,
    ``,
    `注意：`,
    `- summary 必須在 200-500 字之間`,
    `- concepts 必須有 5 到 10 個項目`,
    `- questions 必須有 5 到 8 個項目，且為有深度的開放式問題`,
    `- 只回傳 JSON，不要其他說明文字`,
  ].join('\n');

  /**
   * 嘗試呼叫 claude -p 取得 JSON 結果
   * @returns {{ summary: string, concepts: string[], questions: string[] } | null}
   */
  function trySpawn() {
    let spawnResult;
    try {
      spawnResult = Bun.spawnSync(
        ['claude', '-p', '--output-format', 'json', prompt],
        {
          timeout,
          stderr: 'pipe',
          stdout: 'pipe',
          env: {
            ...process.env,
            OVERTONE_SPAWNED: '1',
            OVERTONE_NO_DASHBOARD: '1',
          },
        }
      );
    } catch {
      return null;
    }

    if (!spawnResult || spawnResult.exitCode !== 0) return null;

    const raw = spawnResult.stdout ? Buffer.from(spawnResult.stdout).toString().trim() : '';
    if (!raw) return null;

    // claude -p --output-format json 回傳外層 JSON wrapper，content 在 result 欄位
    let parsed;
    try {
      const wrapper = JSON.parse(raw);
      // claude 輸出格式：{ result: "...", ... } 或直接是內容 JSON
      const content = (wrapper && typeof wrapper.result === 'string') ? wrapper.result : raw;
      // 擷取 JSON 物件（可能被 markdown code block 包裹）
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;
      parsed = JSON.parse(match[0]);
    } catch {
      // 直接嘗試解析原始輸出
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return null;
        parsed = JSON.parse(match[0]);
      } catch {
        return null;
      }
    }

    if (!parsed || typeof parsed !== 'object') return null;

    // 驗證並正規化結果
    const normalized = {
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      concepts: Array.isArray(parsed.concepts) ? parsed.concepts.filter(c => typeof c === 'string') : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions.filter(q => typeof q === 'string') : [],
    };

    // 至少要有摘要或概念才算有效結果
    if (!normalized.summary && normalized.concepts.length === 0) return null;

    return normalized;
  }

  const research = trySpawn();
  if (!research) return result;

  return research;
}

/**
 * 啟動訪談 session（支援 domain research 整合）
 *
 * 與 init() 相同，但支援 enableDomainResearch 選項：
 * 若啟用，在訪談開始前呼叫 researchDomain() 研究領域知識，
 * 並將結果存入 session.domainResearch，研究產出的問題合併到動態問題池。
 *
 * @param {string} featureName - 功能名稱（不可為空字串）
 * @param {string} outputPath - Spec 輸出目錄路徑
 * @param {object} [options] - 選項覆寫
 * @param {boolean} [options.enableDomainResearch=false] - 啟用領域研究
 * @param {number} [options.researchTimeout=60000] - 研究逾時毫秒數
 * @param {number} [options.minAnswersPerFacet=2] - 每個面向的最低必答數
 * @param {string[]} [options.skipFacets=[]] - 要跳過的面向清單
 * @returns {object} InterviewSession（含 domainResearch 欄位，若有啟用研究）
 * @throws {Error} 若 featureName 為空字串
 */
function startInterview(featureName, outputPath, options) {
  // 先用 init 建立基礎 session
  const session = init(featureName, outputPath, options);

  const enableDomainResearch = options && options.enableDomainResearch === true;

  if (!enableDomainResearch) {
    return session;
  }

  // 執行領域研究
  const researchTimeout = (options && options.researchTimeout) || DOMAIN_RESEARCH_TIMEOUT_MS;
  const research = researchDomain(featureName, { timeout: researchTimeout });

  // 將研究結果存入 session
  const sessionWithResearch = {
    ...session,
    domainResearch: research,
  };

  return sessionWithResearch;
}

/**
 * 取得 session 中來自領域研究的動態問題（供訪談引擎使用）
 *
 * 將 domainResearch.questions 轉換成帶有 source: 'research' 標記的問題物件，
 * 可合併到動態問題池中。
 *
 * @param {object} session - InterviewSession（含 domainResearch）
 * @returns {object[]} 問題物件陣列（含 source: 'research' 標記）
 */
function getResearchQuestions(session) {
  if (!session || !session.domainResearch || !Array.isArray(session.domainResearch.questions)) {
    return [];
  }

  return session.domainResearch.questions.map((text, index) => ({
    id: `research-${index + 1}`,
    facet: 'functional',
    text,
    required: false,
    dependsOn: null,
    source: 'research',
  }));
}

// ── 匯出 ──

module.exports = {
  init,
  startInterview,
  nextQuestion,
  recordAnswer,
  isComplete,
  generateSpec,
  loadSession,
  saveSession,
  queryPastInterviews,
  extractInsights,
  researchDomain,
  getResearchQuestions,
  enrichBDDScenarios,
  // 匯出問題庫供測試直接查詢（Feature 7）
  QUESTION_BANK,
};
