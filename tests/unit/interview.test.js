import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  init,
  nextQuestion,
  recordAnswer,
  isComplete,
  generateSpec,
  loadSession,
  saveSession,
  startInterview,
  getResearchQuestions,
  QUESTION_BANK,
} from '/Users/sbu/.claude/scripts/lib/interview.js';

const SESSION_DIR = '/tmp/nova-pm-sessions';

// 每個測試前後清理 session 目錄
function cleanupSession(sessionId) {
  const path = join(SESSION_DIR, `${sessionId}.json`);
  if (existsSync(path)) rmSync(path);
}

describe('init', () => {
  test('應回傳包含必要欄位的 session 物件', () => {
    const s = init('my-project', 'product');
    expect(s.projectName).toBe('my-project');
    expect(s.mode).toBe('product');
    expect(s.answers).toEqual({});
    expect(s.startedAt).toBeTruthy();
    expect(s.completedAt).toBeNull();
    expect(s.id).toBeTruthy();
  });

  test('預設模式為 discovery', () => {
    const s = init('test');
    expect(s.mode).toBe('discovery');
  });

  test('應正確套用 options（minAnswersPerFacet、skipFacets）', () => {
    const s = init('test', 'product', { minAnswersPerFacet: 3, skipFacets: ['ui'] });
    expect(s.options.minAnswersPerFacet).toBe(3);
    expect(s.options.skipFacets).toContain('ui');
  });

  test('product-full 模式應可正確建立', () => {
    const s = init('big-feature', 'product-full');
    expect(s.mode).toBe('product-full');
  });
});

describe('nextQuestion', () => {
  test('空 session 應回傳第一個必問題', () => {
    const s = init('test', 'discovery');
    const q = nextQuestion(s);
    expect(q).not.toBeNull();
    expect(q.required).toBe(true);
  });

  test('必問題應優先於補充題', () => {
    // 先答所有 functional 補充題以外的題（讓補充題露出）
    // 本測試驗證：在有未答必問題時，下一題仍是必問題
    const s = init('test', 'discovery');
    const q = nextQuestion(s);
    expect(q.required).toBe(true);
  });

  test('skipFacets 的面向問題應被跳過', () => {
    const s = init('test', 'discovery', { skipFacets: ['ui'] });
    // 收集所有問題，確認無 ui 題
    let current = s;
    const seen = [];
    let q;
    while ((q = nextQuestion(current)) !== null) {
      seen.push(q.facet);
      current = recordAnswer(current, q.id, 'any');
    }
    expect(seen).not.toContain('ui');
  });

  test('已回答問題不應再出現', () => {
    let s = init('test', 'discovery');
    const first = nextQuestion(s);
    s = recordAnswer(s, first.id, '第一個答案');
    const second = nextQuestion(s);
    expect(second?.id).not.toBe(first.id);
  });

  test('dependsOn 前置問題未答時應跳過該問題', () => {
    const s = init('test', 'discovery');
    // func-5 dependsOn func-1，func-1 未答時 func-5 應跳過
    const func5 = QUESTION_BANK.find(q => q.id === 'func-5');
    expect(func5).toBeTruthy();
    expect(func5.dependsOn).toBe('func-1');

    // 檢查在 func-1 未答時，nextQuestion 不會直接回傳 func-5
    let seenFunc5 = false;
    let current = s;
    let q;
    // 只迭代前 5 個問題，確認 func-5 不在其中（func-1 未答時）
    for (let i = 0; i < 5; i++) {
      q = nextQuestion(current);
      if (!q) break;
      if (q.id === 'func-5') { seenFunc5 = true; break; }
      current = recordAnswer(current, q.id, 'ans');
      if (q.id === 'func-1') break; // func-1 已答，停止
    }
    // 在 func-1 答完之前，func-5 不應出現
    expect(seenFunc5).toBe(false);
  });

  test('所有問題都回答後應回傳 null', () => {
    let s = init('test', 'discovery');
    let q;
    while ((q = nextQuestion(s)) !== null) {
      s = recordAnswer(s, q.id, '回答');
    }
    expect(nextQuestion(s)).toBeNull();
  });

  test('discovery 模式應包含所有面向問題', () => {
    const s = init('test', 'discovery');
    let current = s;
    const facets = new Set();
    let q;
    while ((q = nextQuestion(current)) !== null) {
      facets.add(q.facet);
      current = recordAnswer(current, q.id, 'ans');
    }
    expect(facets.has('functional')).toBe(true);
    expect(facets.has('flow')).toBe(true);
    expect(facets.has('edge-cases')).toBe(true);
    expect(facets.has('acceptance')).toBe(true);
  });
});

describe('recordAnswer', () => {
  test('應正確記錄答案到 session', () => {
    let s = init('test', 'product');
    s = recordAnswer(s, 'func-1', '解決付款流程問題');
    expect(s.answers['func-1']).toBe('解決付款流程問題');
  });

  test('回傳新 session 物件（純函式，不修改原 session）', () => {
    const original = init('test', 'product');
    const updated = recordAnswer(original, 'func-1', '答案');
    expect(original.answers['func-1']).toBeUndefined();
    expect(updated.answers['func-1']).toBe('答案');
  });

  test('重複回答同一問題應覆蓋舊答案', () => {
    let s = init('test', 'product');
    s = recordAnswer(s, 'func-1', '第一次答案');
    s = recordAnswer(s, 'func-1', '更新後的答案');
    expect(s.answers['func-1']).toBe('更新後的答案');
  });

  test('未知 questionId 應仍可記錄（不拋錯）', () => {
    let s = init('test', 'product');
    expect(() => {
      s = recordAnswer(s, 'unknown-id', '答案');
    }).not.toThrow();
    expect(s.answers['unknown-id']).toBe('答案');
  });
});

describe('isComplete', () => {
  test('空 session 應回傳 false', () => {
    const s = init('test', 'product');
    expect(isComplete(s)).toBe(false);
  });

  test('回答所有必問題後（每個面向 >= minAnswersPerFacet）應回傳 true', () => {
    let s = init('test', 'product', { minAnswersPerFacet: 2 });

    // 必問面向：functional, flow, edge-cases, acceptance
    // 各面向至少答 2 個必問題
    const mustAnswer = [
      'func-1', 'func-2',       // functional 必問
      'flow-1', 'flow-2',       // flow 必問
      'edge-1', 'edge-2',       // edge-cases 必問
      'acc-1', 'acc-2',         // acceptance 必問
    ];
    for (const id of mustAnswer) {
      s = recordAnswer(s, id, '答案');
    }
    expect(isComplete(s)).toBe(true);
  });

  test('某面向不足 minAnswersPerFacet 時應回傳 false', () => {
    let s = init('test', 'product', { minAnswersPerFacet: 2 });
    // functional 只答 1 個
    s = recordAnswer(s, 'func-1', '答案');
    // flow 答 2 個
    s = recordAnswer(s, 'flow-1', '答案');
    s = recordAnswer(s, 'flow-2', '答案');
    // edge-cases 答 2 個
    s = recordAnswer(s, 'edge-1', '答案');
    s = recordAnswer(s, 'edge-2', '答案');
    // acceptance 答 2 個
    s = recordAnswer(s, 'acc-1', '答案');
    s = recordAnswer(s, 'acc-2', '答案');

    expect(isComplete(s)).toBe(false);
  });

  test('skipFacets 的面向不計入完成判斷', () => {
    let s = init('test', 'product', { minAnswersPerFacet: 2, skipFacets: ['ui'] });
    // 只答必問面向的必問題
    s = recordAnswer(s, 'func-1', 'ans'); s = recordAnswer(s, 'func-2', 'ans');
    s = recordAnswer(s, 'flow-1', 'ans'); s = recordAnswer(s, 'flow-2', 'ans');
    s = recordAnswer(s, 'edge-1', 'ans'); s = recordAnswer(s, 'edge-2', 'ans');
    s = recordAnswer(s, 'acc-1', 'ans'); s = recordAnswer(s, 'acc-2', 'ans');
    // ui 面向被跳過，不影響結果
    expect(isComplete(s)).toBe(true);
  });

  test('minAnswersPerFacet=1 時只需每面向 1 個必問題', () => {
    let s = init('test', 'product', { minAnswersPerFacet: 1 });
    s = recordAnswer(s, 'func-1', 'ans');
    s = recordAnswer(s, 'flow-1', 'ans');
    s = recordAnswer(s, 'edge-1', 'ans');
    s = recordAnswer(s, 'acc-1', 'ans');
    expect(isComplete(s)).toBe(true);
  });
});

describe('generateSpec', () => {
  test('應回傳包含 name/scope/requirements/priorities 的結構', () => {
    let s = init('支付系統', 'product');
    s = recordAnswer(s, 'func-1', '解決付款失敗問題');
    s = recordAnswer(s, 'func-2', '電商用戶，每天多次');
    s = recordAnswer(s, 'acc-1', '付款成功率 > 99%');

    const spec = generateSpec(s);
    expect(spec.name).toBe('支付系統');
    expect(spec.scope).toBeDefined();
    expect(Array.isArray(spec.requirements)).toBe(true);
    expect(Array.isArray(spec.priorities)).toBe(true);
  });

  test('requirements 應包含 functional 面向的回答', () => {
    let s = init('test', 'product');
    s = recordAnswer(s, 'func-1', '核心功能描述');

    const spec = generateSpec(s);
    const funcReqs = spec.requirements.filter(r => r.type === 'functional');
    expect(funcReqs.length).toBeGreaterThan(0);
    expect(funcReqs[0].description).toBe('核心功能描述');
  });

  test('priorities 應包含 acceptance 面向的回答', () => {
    let s = init('test', 'product');
    s = recordAnswer(s, 'acc-1', '回應時間 < 200ms');
    s = recordAnswer(s, 'acc-2', '可用性 99.9%');

    const spec = generateSpec(s);
    expect(spec.priorities).toContain('回應時間 < 200ms');
    expect(spec.priorities).toContain('可用性 99.9%');
  });

  test('func-5 的回答應列入 scope.excluded', () => {
    let s = init('test', 'product');
    s = recordAnswer(s, 'func-1', '核心功能');
    s = recordAnswer(s, 'func-5', '不包含後台管理介面');

    const spec = generateSpec(s);
    expect(spec.scope.excluded).toContain('不包含後台管理介面');
  });

  test('空 session 也應能產生 spec 不拋錯', () => {
    const s = init('empty', 'discovery');
    expect(() => generateSpec(s)).not.toThrow();
    const spec = generateSpec(s);
    expect(spec.name).toBe('empty');
    expect(spec.requirements).toEqual([]);
  });

  test('spec 物件應為 JSON serializable', () => {
    let s = init('test', 'product');
    s = recordAnswer(s, 'func-1', '答案');
    const spec = generateSpec(s);
    expect(() => JSON.stringify(spec)).not.toThrow();
  });
});

describe('loadSession / saveSession', () => {
  let testSessionId;

  afterEach(() => {
    if (testSessionId) cleanupSession(testSessionId);
  });

  test('saveSession 應將 session 寫入磁碟', () => {
    const s = init('io-test', 'product');
    testSessionId = s.id;
    const path = saveSession(s);
    expect(existsSync(path)).toBe(true);
  });

  test('loadSession 應從磁碟還原 session', () => {
    const s = init('load-test', 'discovery');
    testSessionId = s.id;
    saveSession(s);

    const loaded = loadSession(s.id);
    expect(loaded).not.toBeNull();
    expect(loaded.projectName).toBe('load-test');
    expect(loaded.id).toBe(s.id);
  });

  test('session 中的 answers 應在 save/load 後保留', () => {
    let s = init('answers-test', 'product');
    testSessionId = s.id;
    s = recordAnswer(s, 'func-1', '付款問題');
    s = recordAnswer(s, 'func-2', '電商用戶');
    saveSession(s);

    const loaded = loadSession(s.id);
    expect(loaded.answers['func-1']).toBe('付款問題');
    expect(loaded.answers['func-2']).toBe('電商用戶');
  });

  test('loadSession 對不存在的 sessionId 應回傳 null', () => {
    const result = loadSession('nonexistent-session-id-xyz');
    expect(result).toBeNull();
  });

  test('loadSession 對損壞的 JSON 應回傳 null（不拋錯）', () => {
    const dir = SESSION_DIR;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const brokenId = 'broken-session';
    const path = join(dir, `${brokenId}.json`);
    writeFileSync(path, '{ invalid json ');
    testSessionId = brokenId;

    const result = loadSession(brokenId);
    expect(result).toBeNull();

    // 清理
    if (existsSync(path)) rmSync(path);
  });
});

describe('startInterview / getResearchQuestions', () => {
  test('startInterview 應將 domainResearch 注入 session', () => {
    let s = init('test', 'product');
    const research = { summary: '付款領域摘要', concepts: ['支付閘道', '退款'], questions: ['如何處理退款？'] };
    s = startInterview(s, research);
    expect(s.domainResearch).toEqual(research);
  });

  test('startInterview 應回傳新 session（純函式）', () => {
    const original = init('test', 'product');
    const updated = startInterview(original, { summary: '', concepts: [], questions: [] });
    expect(original.domainResearch).toBeNull();
    expect(updated.domainResearch).toBeDefined();
  });

  test('getResearchQuestions 對有 questions 的 session 應回傳問題列表', () => {
    let s = init('test', 'product');
    s = startInterview(s, {
      summary: '摘要',
      concepts: ['A', 'B'],
      questions: ['問題一？', '問題二？', '問題三？'],
    });
    const qs = getResearchQuestions(s);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs[0].text).toBe('問題一？');
  });

  test('getResearchQuestions 對無 domainResearch 的 session 應回傳空陣列', () => {
    const s = init('test', 'product');
    const qs = getResearchQuestions(s);
    expect(qs).toEqual([]);
  });

  test('getResearchQuestions 最多回傳 5 個問題', () => {
    let s = init('test', 'product');
    s = startInterview(s, {
      summary: '',
      concepts: [],
      questions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'],
    });
    const qs = getResearchQuestions(s);
    expect(qs.length).toBeLessThanOrEqual(5);
  });
});

describe('QUESTION_BANK', () => {
  test('應包含所有五個面向', () => {
    const facets = new Set(QUESTION_BANK.map(q => q.facet));
    expect(facets.has('functional')).toBe(true);
    expect(facets.has('flow')).toBe(true);
    expect(facets.has('ui')).toBe(true);
    expect(facets.has('edge-cases')).toBe(true);
    expect(facets.has('acceptance')).toBe(true);
  });

  test('每個必問面向應至少有 2 個必問題', () => {
    for (const facet of ['functional', 'flow', 'edge-cases', 'acceptance']) {
      const required = QUESTION_BANK.filter(q => q.facet === facet && q.required);
      expect(required.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('每個問題應有唯一 id', () => {
    const ids = QUESTION_BANK.map(q => q.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
