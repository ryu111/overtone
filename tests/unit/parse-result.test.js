'use strict';
const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

// 從獨立模組 require（Single Source of Truth）
const parseResult = require(join(SCRIPTS_LIB, 'parse-result'));

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

  test('failure mode → pass（false positive 防護）', () => {
    expect(parseResult('all tests ran without error in failure mode analysis', 'TEST')).toEqual({ verdict: 'pass' });
  });

  test('error-free → pass（false positive 防護）', () => {
    expect(parseResult('The test suite is now error-free after fixes', 'TEST')).toEqual({ verdict: 'pass' });
  });
});

describe('parseResult — RETRO stage', () => {
  test('has issues found → issues（RETRO）', () => {
    expect(parseResult('has issues found in the codebase', 'RETRO')).toEqual({ verdict: 'issues' });
  });

  test('there are 改善建議 to consider → issues（RETRO）', () => {
    expect(parseResult('there are 改善建議 to consider', 'RETRO')).toEqual({ verdict: 'issues' });
  });

  test('建議優化架構 → issues（RETRO）', () => {
    expect(parseResult('建議優化架構以提升效能', 'RETRO')).toEqual({ verdict: 'issues' });
  });

  test('0 issues found → pass（RETRO）[false positive 防護]', () => {
    expect(parseResult('0 issues found in this iteration', 'RETRO')).toEqual({ verdict: 'pass' });
  });

  test('no issues → pass（RETRO）[false positive 防護]', () => {
    expect(parseResult('回顧完成，no issues 發現', 'RETRO')).toEqual({ verdict: 'pass' });
  });

  test('no significant issues → pass（RETRO）[false positive 防護]', () => {
    expect(parseResult('no significant issues were found during retrospective', 'RETRO')).toEqual({ verdict: 'pass' });
  });

  test('completed without issues → pass（RETRO）[false positive 防護]', () => {
    expect(parseResult('Sprint completed without issues', 'RETRO')).toEqual({ verdict: 'pass' });
  });

  test('PASS → pass（RETRO）', () => {
    expect(parseResult('回顧完成，品質良好。PASS', 'RETRO')).toEqual({ verdict: 'pass' });
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
