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
 *
 * 資料模型：
 *   InterviewSession：{ featureName, outputPath, answers, startedAt, completedAt, options }
 *   Question：{ id, facet, text, required, dependsOn }
 *   ProjectSpec：{ feature, generatedAt, facets: { functional, flow, ui, edgeCases, acceptance } }
 */

const fs = require('fs');
const path = require('path');
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
 * 從 acceptance 面向的回答建立 BDD 場景
 * @param {object} session
 * @returns {object[]} BDDScenario 陣列
 */
function buildBDDScenarios(session) {
  const answers = session.answers || {};
  const scenarios = [];

  // 從 acceptance 問題的回答提取場景
  const accQuestions = QUESTION_BANK.filter(q => q.facet === 'acceptance');
  for (const q of accQuestions) {
    const answer = answers[q.id];
    if (!answer) continue;

    // 拆分多個場景（按換行或句號分割）
    const parts = answer
      .split(/[。\n.]+/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    if (parts.length === 0 && answer.trim().length > 0) {
      parts.push(answer.trim());
    }

    for (const part of parts) {
      scenarios.push({
        title: `${q.text.slice(0, 30)}：${part.slice(0, 40)}`,
        given: `${session.featureName} 功能已啟用`,
        when: part,
        then: '系統應按預期完成操作並給予適當反饋',
      });
    }
  }

  // 若場景不足 10 個，從 edge-cases 補充
  if (scenarios.length < 10) {
    const edgeQuestions = QUESTION_BANK.filter(q => q.facet === 'edge-cases');
    for (const q of edgeQuestions) {
      if (scenarios.length >= 10) break;
      const answer = answers[q.id];
      if (!answer) continue;

      const parts = answer
        .split(/[。\n.]+/)
        .map(s => s.trim())
        .filter(s => s.length > 5);

      for (const part of parts) {
        if (scenarios.length >= 10) break;
        scenarios.push({
          title: `邊界場景：${part.slice(0, 50)}`,
          given: `${session.featureName} 功能面對邊界條件`,
          when: part,
          then: '系統應妥善處理邊界情況，不崩潰並給予明確提示',
        });
      }
    }
  }

  // 若仍不足 10 個，用補充場景填充
  if (scenarios.length < 10) {
    const supplementary = buildSupplementaryScenarios(session, 10 - scenarios.length);
    scenarios.push(...supplementary);
  }

  return scenarios;
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
      acceptance: buildBDDScenarios(session),
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
  };
  atomicWrite(statePath, data);
}

// ── 匯出 ──

module.exports = {
  init,
  nextQuestion,
  recordAnswer,
  isComplete,
  generateSpec,
  loadSession,
  saveSession,
  // 匯出問題庫供測試直接查詢（Feature 7）
  QUESTION_BANK,
};
