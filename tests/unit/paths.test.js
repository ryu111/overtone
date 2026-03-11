'use strict';
const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const {
  NOVA_HOME,
  SESSIONS_DIR,
  CURRENT_SESSION_FILE,
  sessionDir,
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
});
