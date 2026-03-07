'use strict';
/**
 * health-check-expand.test.js — 新增偵測項目單元測試
 *
 * 覆蓋：
 *   Feature 18: checkTestFileAlignment  — scripts/lib 模組測試覆蓋對齊偵測
 *   Feature 19: checkSkillReferenceIntegrity — SKILL.md 引用完整性偵測
 */

const { test, expect, describe, beforeEach, afterEach } = require('bun:test');
const path = require('path');
const { join } = path;
const os = require('os');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { SCRIPTS_DIR } = require('../helpers/paths');

const {
  checkTestFileAlignment,
  checkSkillReferenceIntegrity,
  PLUGIN_ROOT,
  PROJECT_ROOT,
} = require(join(SCRIPTS_DIR, 'health-check'));

// ══════════════════════════════════════════════════════════════════
// Feature 18: checkTestFileAlignment — 測試覆蓋對齊偵測
// ══════════════════════════════════════════════════════════════════

describe('checkTestFileAlignment', () => {
  let tmpLibDir;
  let tmpUnitDir;

  beforeEach(() => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    tmpLibDir = path.join(os.tmpdir(), `ot-lib-${suffix}`);
    tmpUnitDir = path.join(os.tmpdir(), `ot-unit-${suffix}`);
    mkdirSync(tmpLibDir, { recursive: true });
    mkdirSync(tmpUnitDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpLibDir, { recursive: true, force: true });
    rmSync(tmpUnitDir, { recursive: true, force: true });
  });

  // Scenario 18-1: 模組有完全同名測試 → 無 warning
  test('Scenario 18-1: 有完全同名 .test.js 時不產生 warning', () => {
    writeFileSync(path.join(tmpLibDir, 'foo.js'), `'use strict';\nmodule.exports = {};\n`);
    writeFileSync(path.join(tmpUnitDir, 'foo.test.js'), `'use strict';\n`);

    const findings = checkTestFileAlignment(tmpLibDir, tmpUnitDir);
    const fooFindings = findings.filter((f) => f.message.includes('foo.js'));
    expect(fooFindings.length).toBe(0);
  });

  // Scenario 18-2: 模組有前綴匹配測試（寬鬆比對）→ 無 warning
  test('Scenario 18-2: 有前綴匹配測試（state-invariants.test.js）時不產生 warning', () => {
    writeFileSync(path.join(tmpLibDir, 'state.js'), `'use strict';\nmodule.exports = {};\n`);
    writeFileSync(path.join(tmpUnitDir, 'state-invariants.test.js'), `'use strict';\n`);

    const findings = checkTestFileAlignment(tmpLibDir, tmpUnitDir);
    const stateFindings = findings.filter((f) => f.message.includes('state.js'));
    expect(stateFindings.length).toBe(0);
  });

  // Scenario 18-3: 模組沒有任何測試 → warning
  test('Scenario 18-3: 無對應測試時產生 warning', () => {
    writeFileSync(path.join(tmpLibDir, 'orphan.js'), `'use strict';\nmodule.exports = {};\n`);
    // 不建立任何測試檔

    const findings = checkTestFileAlignment(tmpLibDir, tmpUnitDir);
    expect(findings.length).toBe(1);
    expect(findings[0].check).toBe('test-file-alignment');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].message).toContain('orphan.js');
    expect(findings[0].message).toContain('缺少對應的 tests/unit/ 測試檔案');
  });

  // Scenario 18-4: finding 包含 detail 建議
  test('Scenario 18-4: finding 包含 detail 欄位建議新增測試檔案', () => {
    writeFileSync(path.join(tmpLibDir, 'no-test.js'), `'use strict';\nmodule.exports = {};\n`);

    const findings = checkTestFileAlignment(tmpLibDir, tmpUnitDir);
    expect(findings.length).toBe(1);
    expect(typeof findings[0].detail).toBe('string');
    expect(findings[0].detail).toContain('no-test.test.js');
  });

  // Scenario 18-5: 混合情況（部分有測試、部分無測試）→ 只有無測試的產生 warning
  test('Scenario 18-5: 混合情況只對無測試模組產生 warning', () => {
    writeFileSync(path.join(tmpLibDir, 'has-test.js'), `'use strict';\nmodule.exports = {};\n`);
    writeFileSync(path.join(tmpLibDir, 'no-test.js'), `'use strict';\nmodule.exports = {};\n`);
    writeFileSync(path.join(tmpUnitDir, 'has-test.test.js'), `'use strict';\n`);

    const findings = checkTestFileAlignment(tmpLibDir, tmpUnitDir);
    expect(findings.length).toBe(1);
    expect(findings[0].message).toContain('no-test.js');
    expect(findings.some((f) => f.message.includes('has-test.js'))).toBe(false);
  });

  // Scenario 18-6: lib 目錄不存在時回傳空陣列
  test('Scenario 18-6: lib 目錄不存在時回傳空陣列', () => {
    const nonExist = path.join(os.tmpdir(), 'ot-nonexist-lib-xyz-99999');
    const findings = checkTestFileAlignment(nonExist, tmpUnitDir);
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBe(0);
  });

  // Scenario 18-7: 前綴比對不應跨越模組邊界
  // state-manager.test.js 不應讓 state.js 通過（只有 state- 前綴才符合）
  test('Scenario 18-7: 完全不同名稱的測試不視為有覆蓋', () => {
    writeFileSync(path.join(tmpLibDir, 'abc.js'), `'use strict';\nmodule.exports = {};\n`);
    writeFileSync(path.join(tmpUnitDir, 'xabc.test.js'), `'use strict';\n`); // 前綴不符
    writeFileSync(path.join(tmpUnitDir, 'abcd.test.js'), `'use strict';\n`); // 前綴相反

    const findings = checkTestFileAlignment(tmpLibDir, tmpUnitDir);
    expect(findings.length).toBe(1);
    expect(findings[0].message).toContain('abc.js');
  });

  // Scenario 18-8: finding schema 相容性
  test('Scenario 18-8: finding 包含必要欄位', () => {
    writeFileSync(path.join(tmpLibDir, 'schema-check.js'), `'use strict';\nmodule.exports = {};\n`);

    const findings = checkTestFileAlignment(tmpLibDir, tmpUnitDir);
    expect(findings.length).toBe(1);
    const f = findings[0];
    expect(typeof f.check).toBe('string');
    expect(f.check).toBe('test-file-alignment');
    expect(f.severity).toBe('warning');
    expect(typeof f.file).toBe('string');
    expect(typeof f.message).toBe('string');
    expect(typeof f.detail).toBe('string');
  });

  // Scenario 18-9: 真實 codebase 掃描不拋出例外
  test('Scenario 18-9: 真實 codebase 掃描不拋出例外', () => {
    expect(() => checkTestFileAlignment()).not.toThrow();
    const findings = checkTestFileAlignment();
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.check).toBe('test-file-alignment');
      expect(f.severity).toBe('warning');
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 19: checkSkillReferenceIntegrity — SKILL.md 引用完整性偵測
// ══════════════════════════════════════════════════════════════════

describe('checkSkillReferenceIntegrity', () => {
  let tmpSkillsDir;

  beforeEach(() => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    tmpSkillsDir = path.join(os.tmpdir(), `ot-skills-${suffix}`);
    mkdirSync(tmpSkillsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpSkillsDir, { recursive: true, force: true });
  });

  // Scenario 19-1: SKILL.md 引用的相對路徑存在 → 無 error
  test('Scenario 19-1: 引用的 references 檔案存在時無 error', () => {
    const skillDir = path.join(tmpSkillsDir, 'my-skill');
    const refsDir = path.join(skillDir, 'references');
    mkdirSync(refsDir, { recursive: true });
    writeFileSync(path.join(skillDir, 'SKILL.md'), `# my-skill\n\n| 1 | references/guide.md | 說明 |\n`);
    writeFileSync(path.join(refsDir, 'guide.md'), '# Guide\n');

    const findings = checkSkillReferenceIntegrity(tmpSkillsDir);
    expect(findings.length).toBe(0);
  });

  // Scenario 19-2: SKILL.md 引用的相對路徑不存在 → error
  test('Scenario 19-2: 引用的 references 檔案不存在時產生 error', () => {
    const skillDir = path.join(tmpSkillsDir, 'broken-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(path.join(skillDir, 'SKILL.md'), `# broken-skill\n\n| 1 | references/missing.md | 說明 |\n`);
    // 不建立 references/missing.md

    const findings = checkSkillReferenceIntegrity(tmpSkillsDir);
    expect(findings.length).toBe(1);
    expect(findings[0].check).toBe('skill-reference-integrity');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('broken-skill');
    expect(findings[0].message).toContain('references/missing.md');
  });

  // Scenario 19-3: ${CLAUDE_PLUGIN_ROOT} 跨 skill 引用存在 → 無 error
  test('Scenario 19-3: 跨 skill 的 CLAUDE_PLUGIN_ROOT 引用存在時無 error', () => {
    const skillA = path.join(tmpSkillsDir, 'skill-a');
    const skillB = path.join(tmpSkillsDir, 'skill-b', 'references');
    mkdirSync(skillA, { recursive: true });
    mkdirSync(skillB, { recursive: true });
    writeFileSync(
      path.join(skillA, 'SKILL.md'),
      `# skill-a\n\n\`\${CLAUDE_PLUGIN_ROOT}/skills/skill-b/references/api.md\`\n`,
    );
    writeFileSync(path.join(skillB, 'api.md'), '# API\n');

    const findings = checkSkillReferenceIntegrity(tmpSkillsDir);
    expect(findings.length).toBe(0);
  });

  // Scenario 19-4: ${CLAUDE_PLUGIN_ROOT} 跨 skill 引用不存在 → error
  test('Scenario 19-4: 跨 skill 的 CLAUDE_PLUGIN_ROOT 引用不存在時產生 error', () => {
    const skillA = path.join(tmpSkillsDir, 'skill-a');
    mkdirSync(skillA, { recursive: true });
    writeFileSync(
      path.join(skillA, 'SKILL.md'),
      `# skill-a\n\n\`\${CLAUDE_PLUGIN_ROOT}/skills/skill-b/references/nonexistent.md\`\n`,
    );
    // skill-b 不存在

    const findings = checkSkillReferenceIntegrity(tmpSkillsDir);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('skill-b');
    expect(findings[0].message).toContain('nonexistent.md');
  });

  // Scenario 19-5: examples/ 路徑也被偵測
  test('Scenario 19-5: examples/ 路徑不存在時也產生 error', () => {
    const skillDir = path.join(tmpSkillsDir, 'ex-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `# ex-skill\n\n| 1 | examples/sample.md | 範例 |\n`,
    );

    const findings = checkSkillReferenceIntegrity(tmpSkillsDir);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('examples/sample.md');
  });

  // Scenario 19-6: 含有 ${CLAUDE_PLUGIN_ROOT} 的行不會觸發格式 1 相對路徑匹配
  test('Scenario 19-6: CLAUDE_PLUGIN_ROOT 行不重複偵測', () => {
    const skillDir = path.join(tmpSkillsDir, 'cross-skill');
    const otherSkillRefs = path.join(tmpSkillsDir, 'other-skill', 'references');
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(otherSkillRefs, { recursive: true });
    // 這行同時符合格式 2（CLAUDE_PLUGIN_ROOT），不應被格式 1 重複處理
    writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `# cross-skill\n\n\`\${CLAUDE_PLUGIN_ROOT}/skills/other-skill/references/doc.md\`\n`,
    );
    writeFileSync(path.join(otherSkillRefs, 'doc.md'), '# Doc\n');

    const findings = checkSkillReferenceIntegrity(tmpSkillsDir);
    // 格式 2 存在且路徑正確 → 無 error
    expect(findings.length).toBe(0);
  });

  // Scenario 19-7: 沒有 SKILL.md 的目錄跳過
  test('Scenario 19-7: 沒有 SKILL.md 的技能目錄跳過（不產生 finding）', () => {
    mkdirSync(path.join(tmpSkillsDir, 'no-skill-md'), { recursive: true });
    // 不建立 SKILL.md

    const findings = checkSkillReferenceIntegrity(tmpSkillsDir);
    expect(findings.length).toBe(0);
  });

  // Scenario 19-8: finding schema 相容性
  test('Scenario 19-8: finding 只包含 Finding schema 定義的欄位', () => {
    const skillDir = path.join(tmpSkillsDir, 'schema-check');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(path.join(skillDir, 'SKILL.md'), `# schema-check\n\n| 1 | references/nonexist.md | 說明 |\n`);

    const findings = checkSkillReferenceIntegrity(tmpSkillsDir);
    expect(findings.length).toBe(1);

    const validKeys = new Set(['check', 'severity', 'file', 'message', 'detail']);
    const f = findings[0];
    for (const key of Object.keys(f)) {
      expect(validKeys.has(key)).toBe(true);
    }
    expect(f.check).toBe('skill-reference-integrity');
    expect(f.severity).toBe('error');
  });

  // Scenario 19-9: 真實 codebase 掃描不拋出例外且無 error finding
  test('Scenario 19-9: 真實 codebase 掃描不拋出例外且無 error finding', () => {
    expect(() => checkSkillReferenceIntegrity()).not.toThrow();
    const findings = checkSkillReferenceIntegrity();
    expect(Array.isArray(findings)).toBe(true);
    // 真實 codebase 應無缺失引用（若有則應修正）
    const errors = findings.filter((f) => f.severity === 'error');
    expect(errors.length).toBe(0);
  });
});
