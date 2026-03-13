// tests/helpers/setup.js — 測試環境 setup
// 提供 tmp dir 隔離，每個測試使用獨立的暫存目錄

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach } from 'bun:test';

let _tmpDir = null;

beforeEach(() => {
  _tmpDir = mkdtempSync(join(tmpdir(), 'overtone-test-'));
});

afterEach(() => {
  if (_tmpDir) {
    rmSync(_tmpDir, { recursive: true, force: true });
    _tmpDir = null;
  }
});

export function getTmpDir() {
  if (!_tmpDir) throw new Error('getTmpDir() 必須在 test 內呼叫');
  return _tmpDir;
}
