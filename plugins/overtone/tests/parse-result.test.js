'use strict';
const { test, expect, describe } = require('bun:test');

// 從 on-stop.js 提取 parseResult 為可測試的獨立函式
// 由於 on-stop.js 是 hook 腳本（讀 stdin），無法直接 require
// 這裡複製核心邏輯進行單元測試

function parseResult(output, stageKey) {
  // 優先解析結構化 verdict
  const verdictMatch = output.match(/<!--\s*VERDICT:\s*(\{[^}]+\})\s*-->/);
  if (verdictMatch) {
    try {
      const parsed = JSON.parse(verdictMatch[1]);
      if (parsed.result) {
        return { verdict: parsed.result.toLowerCase() };
      }
    } catch {}
  }

  const lower = output.toLowerCase();

  if (stageKey === 'REVIEW' || stageKey === 'SECURITY' || stageKey === 'DB-REVIEW') {
    if ((lower.includes('reject') || lower.includes('拒絕'))
        && !lower.includes('no reject') && !lower.includes('not reject')) {
      return { verdict: 'reject' };
    }
    return { verdict: 'pass' };
  }

  if (stageKey === 'TEST' || stageKey === 'QA' || stageKey === 'E2E' || stageKey === 'BUILD-FIX') {
    if ((lower.includes('fail') || lower.includes('失敗'))
        && !lower.includes('no fail') && !lower.includes('0 fail') && !lower.includes('without fail')) {
      return { verdict: 'fail' };
    }
    if (lower.includes('error') && !lower.includes('0 error') && !lower.includes('no error')
        && !lower.includes('error handling') && !lower.includes('error recovery')) {
      return { verdict: 'fail' };
    }
    return { verdict: 'pass' };
  }

  return { verdict: 'pass' };
}

describe('parseResult — 結構化 verdict', () => {
  test('解析 <!-- VERDICT: {"result": "PASS"} -->', () => {
    const output = 'Some review text\n<!-- VERDICT: {"result": "PASS"} -->\nMore text';
    expect(parseResult(output, 'REVIEW')).toEqual({ verdict: 'pass' });
  });

  test('解析 <!-- VERDICT: {"result": "FAIL"} -->', () => {
    const output = '<!-- VERDICT: {"result": "FAIL"} -->';
    expect(parseResult(output, 'TEST')).toEqual({ verdict: 'fail' });
  });

  test('結構化優先於字串匹配', () => {
    const output = 'This has fail in text but\n<!-- VERDICT: {"result": "PASS"} -->';
    expect(parseResult(output, 'TEST')).toEqual({ verdict: 'pass' });
  });

  test('無效 JSON fallback 到字串匹配', () => {
    const output = '<!-- VERDICT: {invalid} -->\nTest passed with 0 failures';
    expect(parseResult(output, 'TEST')).toEqual({ verdict: 'pass' });
  });
});

describe('parseResult — REVIEW stages', () => {
  test('含 reject 回傳 reject', () => {
    expect(parseResult('Code review: I reject these changes', 'REVIEW')).toEqual({ verdict: 'reject' });
  });

  test('含 拒絕 回傳 reject', () => {
    expect(parseResult('審查結果：拒絕', 'SECURITY')).toEqual({ verdict: 'reject' });
  });

  test('no rejections → pass（false positive 防護）', () => {
    expect(parseResult('No rejections found. All good.', 'REVIEW')).toEqual({ verdict: 'pass' });
  });

  test('not rejected → pass（false positive 防護）', () => {
    expect(parseResult('The code was not rejected', 'REVIEW')).toEqual({ verdict: 'pass' });
  });

  test('正常通過 → pass', () => {
    expect(parseResult('All changes look good. Approved.', 'REVIEW')).toEqual({ verdict: 'pass' });
  });

  test('DB-REVIEW 同樣適用', () => {
    expect(parseResult('拒絕此 migration', 'DB-REVIEW')).toEqual({ verdict: 'reject' });
  });
});

describe('parseResult — TEST/QA/E2E stages', () => {
  test('含 fail 回傳 fail', () => {
    expect(parseResult('3 tests failed', 'TEST')).toEqual({ verdict: 'fail' });
  });

  test('含 失敗 回傳 fail', () => {
    expect(parseResult('測試失敗', 'QA')).toEqual({ verdict: 'fail' });
  });

  test('No failures found → pass（false positive 防護）', () => {
    expect(parseResult('No failures found. All 42 tests passed.', 'TEST')).toEqual({ verdict: 'pass' });
  });

  test('0 failed → pass（false positive 防護）', () => {
    expect(parseResult('Tests: 42 passed, 0 failed', 'TEST')).toEqual({ verdict: 'pass' });
  });

  test('without failure → pass（false positive 防護）', () => {
    expect(parseResult('Completed without failure', 'E2E')).toEqual({ verdict: 'pass' });
  });

  test('error → fail', () => {
    expect(parseResult('Runtime error in module X', 'TEST')).toEqual({ verdict: 'fail' });
  });

  test('0 errors → pass（false positive 防護）', () => {
    expect(parseResult('Lint: 0 errors, 0 warnings', 'TEST')).toEqual({ verdict: 'pass' });
  });

  test('error handling → pass（false positive 防護）', () => {
    expect(parseResult('Added proper error handling for edge cases', 'TEST')).toEqual({ verdict: 'pass' });
  });

  test('正常通過 → pass', () => {
    expect(parseResult('All 15 tests passed successfully', 'TEST')).toEqual({ verdict: 'pass' });
  });

  test('BUILD-FIX 同樣適用', () => {
    expect(parseResult('Build failed: missing dependency', 'BUILD-FIX')).toEqual({ verdict: 'fail' });
  });
});

describe('parseResult — 其他 stages', () => {
  test('DEV → 預設 pass', () => {
    expect(parseResult('Implemented the feature', 'DEV')).toEqual({ verdict: 'pass' });
  });

  test('PLAN → 預設 pass', () => {
    expect(parseResult('Plan complete', 'PLAN')).toEqual({ verdict: 'pass' });
  });

  test('ARCH → 預設 pass（即使含 fail 也是 pass）', () => {
    expect(parseResult('Architecture handles failure scenarios', 'ARCH')).toEqual({ verdict: 'pass' });
  });
});
