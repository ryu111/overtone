'use strict';
/**
 * post-use-handler.test.js — observeBashError, extractCommandTag 純函數測試
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { observeBashError, extractCommandTag } = require(join(SCRIPTS_LIB, 'post-use-handler'));

// ── extractCommandTag 測試 ──

describe('extractCommandTag', () => {
  it('Scenario 1: bun 指令回傳 "bun"', () => {
    expect(extractCommandTag('bun test')).toBe('bun');
  });

  it('Scenario 2: npm 指令回傳 "npm"', () => {
    expect(extractCommandTag('npm run build')).toBe('npm');
  });

  it('Scenario 3: git 指令回傳 "git"', () => {
    expect(extractCommandTag('git commit -m "fix"')).toBe('git');
  });

  it('Scenario 4: tsc 指令回傳 "typescript"', () => {
    expect(extractCommandTag('tsc --noEmit')).toBe('typescript');
  });

  it('Scenario 5: 未知指令回傳原始名稱', () => {
    expect(extractCommandTag('mycommand --flag')).toBe('mycommand');
  });

  it('Scenario 6: 空字串回傳 "shell"', () => {
    expect(extractCommandTag('')).toBe('shell');
  });

  it('Scenario 7: vitest 回傳 "jest"（別名映射）', () => {
    expect(extractCommandTag('vitest run')).toBe('jest');
  });

  it('Scenario 8: python3 回傳 "python"（別名映射）', () => {
    expect(extractCommandTag('python3 script.py')).toBe('python');
  });
});

// ── observeBashError 測試 ──

describe('observeBashError', () => {
  const sessionId = 'test-session-observe';

  it('Scenario 1: exit_code=0 時回傳 null（無錯誤）', () => {
    const result = observeBashError(
      sessionId,
      { command: 'bun test' },
      { exit_code: 0, stderr: '' }
    );
    expect(result).toBeNull();
  });

  it('Scenario 2: exit_code=undefined 時回傳 null', () => {
    const result = observeBashError(
      sessionId,
      { command: 'bun test' },
      {}
    );
    expect(result).toBeNull();
  });

  it('Scenario 3: 空 command 時回傳 null', () => {
    const result = observeBashError(
      sessionId,
      { command: '' },
      { exit_code: 1, stderr: 'error' }
    );
    expect(result).toBeNull();
  });

  it('Scenario 4: 重要工具 + 實質 stderr → 回傳自我修復指令', () => {
    const result = observeBashError(
      sessionId,
      { command: 'bun test' },
      { exit_code: 1, stderr: 'Module not found: cannot resolve "./missing"' }
    );
    expect(result).not.toBeNull();
    expect(result).toContain('Overtone 錯誤守衛');
    expect(result).toContain('debugger');
    expect(result).toContain('developer');
  });

  it('Scenario 5: 重要工具 + 短 stderr（< 20字）→ 回傳 null（非重大）', () => {
    const result = observeBashError(
      sessionId,
      { command: 'git push' },
      { exit_code: 1, stderr: 'rejected' }
    );
    expect(result).toBeNull();
  });

  it('Scenario 6: 非重要工具 + 實質 stderr → 回傳 null', () => {
    const result = observeBashError(
      sessionId,
      { command: 'curl https://example.com' },
      { exit_code: 6, stderr: 'Could not resolve host: example.com' }
    );
    expect(result).toBeNull();
  });

  it('Scenario 7: 支援 exitCode（camelCase）和 returncode 格式', () => {
    // exitCode 格式
    const r1 = observeBashError(
      sessionId,
      { command: 'bun run' },
      { exitCode: 0, stderr: '' }
    );
    expect(r1).toBeNull();

    // returncode 格式
    const r2 = observeBashError(
      sessionId,
      { command: 'bun run' },
      { returncode: 0 }
    );
    expect(r2).toBeNull();
  });

  it('Scenario 8: 重要工具 + 無 stderr → 回傳 null（雖重要但無實質錯誤訊息）', () => {
    const result = observeBashError(
      sessionId,
      { command: 'git push' },
      { exit_code: 128, stderr: '' }
    );
    expect(result).toBeNull();
  });

  it('Scenario 9: 自我修復指令包含 exit code 資訊', () => {
    const result = observeBashError(
      sessionId,
      { command: 'bun test' },
      { exit_code: 2, stderr: 'SyntaxError: unexpected token at line 5' }
    );
    expect(result).toContain('exit 2');
  });

  it('Scenario 10: npm 別名 npx 回傳 "npm"', () => {
    const tag = extractCommandTag('npx create-react-app my-app');
    expect(tag).toBe('npm');
  });

  it('Scenario 11: bun 別名 bunx 回傳 "bun"', () => {
    const tag = extractCommandTag('bunx some-tool');
    expect(tag).toBe('bun');
  });

  it('Scenario 12: pip 回傳 "python"（別名映射）', () => {
    const tag = extractCommandTag('pip install requests');
    expect(tag).toBe('python');
  });
});

// ── handlePostUse 整合測試 ──

const { mkdirSync, rmSync, writeFileSync } = require('fs');
const path = require('path');
const os = require('os');
const { handlePostUse, detectWordingMismatch, WORDING_RULES } = require(join(SCRIPTS_LIB, 'post-use-handler'));

function makeTestSession(suffix) {
  const id = `test_puh_${suffix}_${Date.now().toString(36)}`;
  const dir = path.join(os.homedir(), '.overtone', 'sessions', id);
  mkdirSync(dir, { recursive: true });
  return { id, dir };
}

describe('handlePostUse — 整合行為', () => {
  let session;

  beforeEach(() => {
    session = makeTestSession('main');
  });

  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  it('Scenario H-1: 無 sessionId 時回傳空 result', () => {
    const result = handlePostUse({ tool_name: 'Bash', tool_input: { command: 'ls' } });
    expect(result).toEqual({ output: { result: '' } });
  });

  it('Scenario H-2: 非 Bash/Write/Edit 工具 → 回傳空 result', () => {
    const result = handlePostUse({
      session_id: session.id,
      tool_name: 'Read',
      tool_input: { file_path: '/some/file.md' },
      tool_response: {},
    });
    expect(result).toEqual({ output: { result: '' } });
  });

  it('Scenario H-3: Bash exit_code=0 → 回傳空 result（無錯誤守衛）', () => {
    const result = handlePostUse({
      session_id: session.id,
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
      tool_response: { exit_code: 0, stderr: '' },
    });
    expect(result).toEqual({ output: { result: '' } });
  });

  it('Scenario H-4: Bash 重大失敗 → 回傳錯誤守衛 result', () => {
    const result = handlePostUse({
      session_id: session.id,
      tool_name: 'Bash',
      tool_input: { command: 'bun test' },
      tool_response: { exit_code: 1, stderr: 'Module not found: cannot resolve "./something-missing"' },
    });
    expect(result.output.result).toContain('Overtone 錯誤守衛');
  });

  it('Scenario H-5: Write .md 檔案含 wording 不匹配 → 回傳警告', () => {
    const tmpFile = path.join(os.tmpdir(), `ot-wording-test-${Date.now()}.md`);
    writeFileSync(tmpFile, '💡 MUST do this\n');
    try {
      const result = handlePostUse({
        session_id: session.id,
        tool_name: 'Write',
        tool_input: { file_path: tmpFile },
        tool_response: {},
      });
      expect(result.output.result).toContain('Overtone 措詞檢查');
      expect(result.output.result).toContain(tmpFile);
    } finally {
      rmSync(tmpFile, { force: true });
    }
  });

  it('Scenario H-6: Write .md 檔案無 wording 問題 → 回傳空 result', () => {
    const tmpFile = path.join(os.tmpdir(), `ot-wording-ok-${Date.now()}.md`);
    writeFileSync(tmpFile, '# 正常標題\n\n📋 MUST 完成此任務。\n');
    try {
      const result = handlePostUse({
        session_id: session.id,
        tool_name: 'Write',
        tool_input: { file_path: tmpFile },
        tool_response: {},
      });
      expect(result).toEqual({ output: { result: '' } });
    } finally {
      rmSync(tmpFile, { force: true });
    }
  });

  it('Scenario H-7: Edit 工具觸發 wording 檢查（非 Write）', () => {
    const tmpFile = path.join(os.tmpdir(), `ot-edit-wording-${Date.now()}.md`);
    writeFileSync(tmpFile, '⛔ should do this\n');
    try {
      const result = handlePostUse({
        session_id: session.id,
        tool_name: 'Edit',
        tool_input: { file_path: tmpFile },
        tool_response: {},
      });
      expect(result.output.result).toContain('Overtone 措詞檢查');
    } finally {
      rmSync(tmpFile, { force: true });
    }
  });
});

// ── detectWordingMismatch 直接測試 ──

describe('detectWordingMismatch', () => {
  const { writeFileSync: wf, unlinkSync: uf } = require('fs');
  const path2 = require('path');
  const os2 = require('os');

  function makeTmpMd(content) {
    const file = path2.join(os2.tmpdir(), `ot-wd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.md`);
    wf(file, content);
    return file;
  }

  it('Scenario D-1: 非 .md 檔案回傳空陣列', () => {
    const result = detectWordingMismatch('/some/file.js');
    expect(result).toEqual([]);
  });

  it('Scenario D-2: filePath 為 undefined 回傳空陣列', () => {
    const result = detectWordingMismatch(undefined);
    expect(result).toEqual([]);
  });

  it('Scenario D-3: 無問題的 .md 回傳空陣列', () => {
    const f = makeTmpMd('# 正常標題\n\n📋 MUST 完成任務。\n💡 should 考慮一下。\n');
    try {
      const result = detectWordingMismatch(f);
      expect(result).toEqual([]);
    } finally { uf(f); }
  });

  it('Scenario D-4: 💡 MUST 不匹配 → 回傳一個警告', () => {
    const f = makeTmpMd('💡 MUST 完成此任務\n');
    try {
      const result = detectWordingMismatch(f);
      expect(result.length).toBe(1);
      expect(result[0]).toContain('💡');
      expect(result[0]).toContain('MUST');
    } finally { uf(f); }
  });

  it('Scenario D-5: code fence 內的不匹配不觸發警告', () => {
    const f = makeTmpMd('正常文字\n```\n💡 MUST 此為範例\n```\n後續文字\n');
    try {
      const result = detectWordingMismatch(f);
      expect(result).toEqual([]);
    } finally { uf(f); }
  });

  it('Scenario D-6: 表格行不觸發警告', () => {
    const f = makeTmpMd('| 💡 MUST | 這是表格說明列 |\n');
    try {
      const result = detectWordingMismatch(f);
      expect(result).toEqual([]);
    } finally { uf(f); }
  });

  it('Scenario D-7: WORDING_RULES 包含三個規則（三層強度）', () => {
    expect(WORDING_RULES).toHaveLength(3);
  });
});
