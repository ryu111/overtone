'use strict';
const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');
const {
  NOVA_HOME,
  SESSIONS_DIR,
  CURRENT_SESSION_FILE,
  sessionDir,
  sessionFile,
  session,
  projectLocal,
  _isProjectRoot,
} = require(join(SCRIPTS_LIB, 'paths'));

describe('paths.js 路徑解析', () => {
  describe('NOVA_HOME', () => {
    test('路徑以 .nova 結尾', () => {
      expect(NOVA_HOME.endsWith('.nova')).toBe(true);
    });

    test('路徑為絕對路徑（以 / 開頭）', () => {
      expect(NOVA_HOME.startsWith('/')).toBe(true);
    });
  });

  describe('SESSIONS_DIR', () => {
    test('以 NOVA_HOME 作為前綴', () => {
      expect(SESSIONS_DIR.startsWith(NOVA_HOME)).toBe(true);
    });

    test('結尾為 sessions', () => {
      expect(SESSIONS_DIR.endsWith('sessions')).toBe(true);
    });
  });

  describe('sessionDir(id)', () => {
    const result = sessionDir('abc-123');

    test('回傳值為字串', () => {
      expect(typeof result).toBe('string');
    });

    test('回傳路徑包含 sessionId', () => {
      expect(result.includes('abc-123')).toBe(true);
    });

    test('回傳路徑以 SESSIONS_DIR 作為前綴', () => {
      expect(result.startsWith(SESSIONS_DIR)).toBe(true);
    });
  });

  describe('CURRENT_SESSION_FILE', () => {
    test('以 NOVA_HOME 作為前綴', () => {
      expect(CURRENT_SESSION_FILE.startsWith(NOVA_HOME)).toBe(true);
    });

    test('結尾為 .current-session-id', () => {
      expect(CURRENT_SESSION_FILE.endsWith('.current-session-id')).toBe(true);
    });
  });

  describe('_isProjectRoot', () => {
    test('/Users/foo 回傳 true', () => {
      expect(_isProjectRoot('/Users/foo')).toBe(true);
    });

    test('session-123 回傳 false', () => {
      expect(_isProjectRoot('session-123')).toBe(false);
    });

    test('abc 回傳 false', () => {
      expect(_isProjectRoot('abc')).toBe(false);
    });

    test('空字串回傳 false', () => {
      expect(_isProjectRoot('')).toBe(false);
    });

    test('非字串回傳 false', () => {
      expect(_isProjectRoot(null)).toBe(false);
      expect(_isProjectRoot(undefined)).toBe(false);
      expect(_isProjectRoot(123)).toBe(false);
    });
  });

  describe('sessionDir — overload', () => {
    test('新 API：sessionDir(projectRoot, sessionId) 包含 projectRoot/.nova/sessions/sessionId', () => {
      const result = sessionDir('/tmp/proj', 'sid-42');
      expect(result).toBe('/tmp/proj/.nova/sessions/sid-42');
    });

    test('舊 API：sessionDir(sessionId) 仍使用 ~/.nova/sessions/', () => {
      const result = sessionDir('sid-42');
      expect(result.startsWith(SESSIONS_DIR)).toBe(true);
      expect(result.endsWith('sid-42')).toBe(true);
    });
  });

  describe('session.timeline — overload', () => {
    test('新 API：session.timeline(projectRoot, sessionId) 正確路徑', () => {
      const result = session.timeline('/tmp/proj', 'sid-99');
      expect(result).toBe('/tmp/proj/.nova/sessions/sid-99/timeline.jsonl');
    });

    test('舊 API：session.timeline(sessionId) 仍使用 ~/.nova/sessions/', () => {
      const result = session.timeline('sid-99');
      expect(result.startsWith(SESSIONS_DIR)).toBe(true);
      expect(result).toContain('timeline.jsonl');
    });
  });

  describe('session.workflowFile — 多參數 overload', () => {
    test('新 API：session.workflowFile(projectRoot, sessionId, workflowId) 正確路徑', () => {
      const result = session.workflowFile('/tmp/proj', 'sid-1', 'wid-1');
      expect(result).toBe('/tmp/proj/.nova/sessions/sid-1/workflows/wid-1/workflow.json');
    });

    test('舊 API：session.workflowFile(sessionId, workflowId) 仍使用 ~/.nova/sessions/', () => {
      const result = session.workflowFile('sid-1', 'wid-1');
      expect(result.startsWith(SESSIONS_DIR)).toBe(true);
      expect(result).toContain('workflow.json');
    });
  });

  describe('session.workflowHandoff — 最多參數 overload', () => {
    test('新 API：session.workflowHandoff(projectRoot, sessionId, workflowId, stageKey) 正確路徑', () => {
      const result = session.workflowHandoff('/tmp/proj', 'sid-1', 'wid-1', 'DEV');
      expect(result).toBe('/tmp/proj/.nova/sessions/sid-1/workflows/wid-1/handoffs/DEV.md');
    });

    test('舊 API：session.workflowHandoff(sessionId, workflowId, stageKey) 仍使用 ~/.nova/sessions/', () => {
      const result = session.workflowHandoff('sid-1', 'wid-1', 'DEV');
      expect(result.startsWith(SESSIONS_DIR)).toBe(true);
      expect(result.endsWith('DEV.md')).toBe(true);
    });
  });

  describe('projectLocal.*', () => {
    const root = '/tmp/test-project';

    test('projectLocal.dir 回傳 {projectRoot}/.nova', () => {
      expect(projectLocal.dir(root)).toBe('/tmp/test-project/.nova');
    });

    test('projectLocal.observations 回傳正確路徑', () => {
      expect(projectLocal.observations(root)).toBe('/tmp/test-project/.nova/observations.jsonl');
    });

    test('projectLocal.baselines 回傳正確路徑', () => {
      expect(projectLocal.baselines(root)).toBe('/tmp/test-project/.nova/baselines.jsonl');
    });

    test('projectLocal.scores 回傳正確路徑', () => {
      expect(projectLocal.scores(root)).toBe('/tmp/test-project/.nova/scores.jsonl');
    });

    test('projectLocal.failures 回傳正確路徑', () => {
      expect(projectLocal.failures(root)).toBe('/tmp/test-project/.nova/failures.jsonl');
    });

    test('projectLocal.digests 回傳正確路徑', () => {
      expect(projectLocal.digests(root)).toBe('/tmp/test-project/.nova/digests.jsonl');
    });

    test('projectLocal.experienceIndex 回傳正確路徑', () => {
      expect(projectLocal.experienceIndex(root)).toBe('/tmp/test-project/.nova/experience-index.json');
    });

    test('projectLocal.executionQueue 回傳正確路徑', () => {
      expect(projectLocal.executionQueue(root)).toBe('/tmp/test-project/.nova/execution-queue.json');
    });

    test('projectLocal.currentSessionId 回傳 {projectRoot}/.nova/.current-session-id', () => {
      expect(projectLocal.currentSessionId(root)).toBe('/tmp/test-project/.nova/.current-session-id');
    });
  });
});
