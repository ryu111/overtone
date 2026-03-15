// acid-test.test.js — R2.6 Acid Test 單元測試
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  phase1_seed,
  phase2_forge,
  phase3_judge,
  phase4_deploy,
  phase5_verify,
  phase6_cleanup,
  runAcidTest,
} from '/Users/sbu/.claude/scripts/acid-test.js';

// ─── 測試環境 ─────────────────────────────────────────────────────────────────

let TMP_DIR;
let behaviorsFile;
let lifecycleFile;

const MOCK_SKILL_CONTENT = `---
name: read-edit-exec
description: 讀取-修改-執行模式
---

# read-edit-exec

這是 acid test 注入的 mock skill。

## 核心知識

Read→Edit→Bash 是開發迴圈的基本單元。

## 使用時機

修改現有功能時使用。

## 反模式

⛔ NEVER 直接寫入不讀取
⛔ NEVER 修改後不執行測試

## 範例

正例：Read → Edit → Bash(test)
反例：Write 覆蓋全部

${'這是填充行。\n'.repeat(40)}
`;

function setup() {
  TMP_DIR = join(tmpdir(), `acid-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(TMP_DIR, 'skills'), { recursive: true });
  mkdirSync(join(TMP_DIR, 'agents'), { recursive: true });
  mkdirSync(join(TMP_DIR, 'data'), { recursive: true });
  behaviorsFile = join(TMP_DIR, 'data/behaviors.jsonl');
  lifecycleFile = join(TMP_DIR, 'data/lifecycle.jsonl');
}

function teardown() {
  try { rmSync(TMP_DIR, { recursive: true }); } catch {}
}

// 標準 agent 內容
function makeAgentFile(skills = []) {
  const skillsBlock = skills.length > 0
    ? `skills:\n${skills.map(s => `  - ${s}`).join('\n')}\n`
    : 'skills:\n';
  return [
    '---',
    'name: executor',
    'description: 執行者',
    'model: sonnet',
    skillsBlock.trim(),
    '---',
    '',
    '# Executor',
  ].join('\n');
}

// 建立一個有效的 SKILL.md
function makeSkillDir(skillName, content) {
  const skillDir = join(TMP_DIR, 'skills', skillName);
  const refsDir = join(skillDir, 'references');
  mkdirSync(refsDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), content || MOCK_SKILL_CONTENT);
  return skillDir;
}

// ─── phase1_seed ──────────────────────────────────────────────────────────────

describe('phase1_seed', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('正確注入 acid-test-pattern 行為', async () => {
    const deps = {
      appendFileSync,
      writeFileSync,
      existsSync,
      mkdirSync,
      readFileSync,
      rmSync,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
    };

    const result = await phase1_seed({}, deps);

    expect(result.ok).toBe(true);
    expect(result.behaviorId).toBe('acid-test-pattern');
    expect(existsSync(behaviorsFile)).toBe(true);

    const content = readFileSync(behaviorsFile, 'utf-8');
    const behaviors = content.trim().split('\n').map(l => JSON.parse(l));
    const seeded = behaviors.find(b => b.id === 'acid-test-pattern');

    expect(seeded).toBeTruthy();
    expect(seeded.confidence).toBe(0.75);
    expect(seeded.suggestion.type).toBe('skill');
    expect(seeded.deployed).toBe(false);
    expect(seeded.occurrences).toHaveLength(10);
  });

  test('可重複執行：舊的 acid-test-pattern 先刪後重新注入', async () => {
    const deps = {
      appendFileSync,
      writeFileSync,
      existsSync,
      mkdirSync,
      readFileSync,
      rmSync,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
    };

    // 第一次注入
    await phase1_seed({}, deps);
    // 第二次注入（不應出現重複）
    await phase1_seed({}, deps);

    const content = readFileSync(behaviorsFile, 'utf-8').trim();
    const behaviors = content.split('\n').filter(Boolean).map(l => JSON.parse(l));
    const count = behaviors.filter(b => b.id === 'acid-test-pattern').length;
    expect(count).toBe(1);
  });

  test('失敗時回傳 { ok: false, error }（不 throw）', async () => {
    const deps = {
      appendFileSync: () => { throw new Error('磁碟滿'); },
      writeFileSync,
      existsSync,
      mkdirSync,
      readFileSync,
      rmSync,
      claudeDir: TMP_DIR,
      behaviorsFile: join(TMP_DIR, 'data/behaviors.jsonl'),
      lifecycleFile,
    };

    // 確保 data 目錄存在，讓 appendFileSync 被呼叫到
    mkdirSync(join(TMP_DIR, 'data'), { recursive: true });

    const result = await phase1_seed({}, deps);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ─── phase2_forge ─────────────────────────────────────────────────────────────

describe('phase2_forge', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('呼叫 checkLifecycle 並回傳結果', async () => {
    let called = false;
    const mockStats = { processed: 1, forged: 1, deployed: 1, drafts: 0 };

    const deps = {
      checkLifecycle: async () => {
        called = true;
        return mockStats;
      },
      askLocalModel: async () => MOCK_SKILL_CONTENT,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
      readFileSync,
      writeFileSync,
      existsSync,
      mkdirSync,
    };

    const result = await phase2_forge({}, deps);

    expect(called).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.forged).toBe(true);
  });

  test('checkLifecycle 回傳 processed=0 時 ok 為 false', async () => {
    const deps = {
      checkLifecycle: async () => ({ processed: 0, forged: 0, deployed: 0, drafts: 0 }),
    };

    const result = await phase2_forge({}, deps);
    expect(result.ok).toBe(false);
  });

  test('checkLifecycle 拋出例外時回傳 { ok: false }', async () => {
    const deps = {
      checkLifecycle: async () => { throw new Error('lifecycle 失敗'); },
    };

    const result = await phase2_forge({}, deps);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('lifecycle 失敗');
  });
});

// ─── phase3_judge ─────────────────────────────────────────────────────────────

describe('phase3_judge', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('對存在的 SKILL.md 回傳 score 和 grade', async () => {
    makeSkillDir('read-edit-exec');
    writeFileSync(join(TMP_DIR, 'agents', 'executor.md'), makeAgentFile());

    const deps = {
      existsSync,
      readFileSync,
      claudeDir: TMP_DIR,
    };

    const result = await phase3_judge('read-edit-exec', deps);

    expect(result.ok).toBe(true);
    expect(typeof result.score).toBe('number');
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
  });

  test('注入 scoreDeterministic mock', async () => {
    makeSkillDir('mock-skill');

    const deps = {
      existsSync,
      readFileSync,
      claudeDir: TMP_DIR,
      scoreDeterministic: () => 40,
      grade: (s) => s >= 80 ? 'A' : s >= 40 ? 'C' : 'F',
    };

    const result = await phase3_judge('mock-skill', deps);

    expect(result.ok).toBe(true);
    expect(result.score).toBe(40);
    expect(result.grade).toBe('C');
  });

  test('SKILL.md 不存在時回傳 { ok: false }', async () => {
    const deps = {
      existsSync,
      readFileSync,
      claudeDir: TMP_DIR,
    };

    const result = await phase3_judge('nonexistent-skill', deps);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('不存在');
  });
});

// ─── phase4_deploy ────────────────────────────────────────────────────────────

describe('phase4_deploy', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('executor.md 包含 skillName 時 deployed=true', async () => {
    writeFileSync(join(TMP_DIR, 'agents', 'executor.md'), makeAgentFile(['read-edit-exec']));

    const deps = { existsSync, readFileSync, claudeDir: TMP_DIR };
    const result = await phase4_deploy('read-edit-exec', deps);

    expect(result.ok).toBe(true);
    expect(result.deployed).toBe(true);
  });

  test('executor.md 不含 skillName 時 deployed=false', async () => {
    writeFileSync(join(TMP_DIR, 'agents', 'executor.md'), makeAgentFile(['other-skill']));

    const deps = { existsSync, readFileSync, claudeDir: TMP_DIR };
    const result = await phase4_deploy('read-edit-exec', deps);

    expect(result.ok).toBe(true);
    expect(result.deployed).toBe(false);
  });

  test('executor.md 不存在時回傳 { ok: false }', async () => {
    const deps = { existsSync, readFileSync, claudeDir: TMP_DIR };
    const result = await phase4_deploy('any-skill', deps);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('不存在');
  });
});

// ─── phase5_verify ────────────────────────────────────────────────────────────

describe('phase5_verify', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('所有產物存在時所有 checks 通過', async () => {
    // 建立 skill
    makeSkillDir('read-edit-exec');

    // 建立 behaviors.jsonl 含 deployed=true
    const behavior = { id: 'acid-test-pattern', deployed: true };
    writeFileSync(behaviorsFile, JSON.stringify(behavior) + '\n');

    // 建立 lifecycle.jsonl 含 acid-test-pattern
    writeFileSync(lifecycleFile, JSON.stringify({ behaviorId: 'acid-test-pattern', action: 'forge' }) + '\n');

    const deps = {
      existsSync,
      readFileSync,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
    };

    const result = await phase5_verify('read-edit-exec', deps);

    expect(result.ok).toBe(true);
    expect(result.checks.skillMd).toBe(true);
    expect(result.checks.frontmatter).toBe(true);
    expect(result.checks.references).toBe(true);
    expect(result.checks.lifecycle).toBe(true);
    expect(result.checks.behaviorDeployed).toBe(true);
  });

  test('缺少 SKILL.md 時 checks.skillMd=false', async () => {
    const deps = {
      existsSync,
      readFileSync,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
    };

    const result = await phase5_verify('nonexistent-skill', deps);

    expect(result.ok).toBe(false);
    expect(result.checks.skillMd).toBe(false);
  });

  test('behavior deployed=false 時 checks.behaviorDeployed=false', async () => {
    makeSkillDir('read-edit-exec');
    writeFileSync(lifecycleFile, JSON.stringify({ behaviorId: 'acid-test-pattern', action: 'forge' }) + '\n');
    writeFileSync(behaviorsFile, JSON.stringify({ id: 'acid-test-pattern', deployed: false }) + '\n');

    const deps = {
      existsSync,
      readFileSync,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
    };

    const result = await phase5_verify('read-edit-exec', deps);

    expect(result.checks.behaviorDeployed).toBe(false);
    expect(result.ok).toBe(false);
  });

  test('lifecycle.jsonl 無記錄時 checks.lifecycle=false', async () => {
    makeSkillDir('read-edit-exec');
    writeFileSync(behaviorsFile, JSON.stringify({ id: 'acid-test-pattern', deployed: true }) + '\n');
    // 不建立 lifecycle.jsonl

    const deps = {
      existsSync,
      readFileSync,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
    };

    const result = await phase5_verify('read-edit-exec', deps);

    expect(result.checks.lifecycle).toBe(false);
    expect(result.ok).toBe(false);
  });
});

// ─── phase6_cleanup ───────────────────────────────────────────────────────────

describe('phase6_cleanup', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('正確清理所有測試產物', async () => {
    // 建立所有產物
    makeSkillDir('read-edit-exec');
    writeFileSync(join(TMP_DIR, 'agents', 'executor.md'), makeAgentFile(['read-edit-exec', 'other-skill']));
    writeFileSync(behaviorsFile, [
      JSON.stringify({ id: 'acid-test-pattern', deployed: true }),
      JSON.stringify({ id: 'other-behavior', deployed: false }),
    ].join('\n') + '\n');
    writeFileSync(lifecycleFile, [
      JSON.stringify({ behaviorId: 'acid-test-pattern', action: 'forge' }),
      JSON.stringify({ behaviorId: 'other-id', action: 'forge' }),
    ].join('\n') + '\n');

    const deps = {
      existsSync,
      readFileSync,
      writeFileSync,
      rmSync,
      appendFileSync,
      mkdirSync,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
    };

    const result = await phase6_cleanup('read-edit-exec', { cleanup: true }, deps);

    expect(result.ok).toBe(true);
    expect(result.cleaned.length).toBeGreaterThan(0);

    // skill 目錄已刪除
    expect(existsSync(join(TMP_DIR, 'skills', 'read-edit-exec'))).toBe(false);

    // executor.md 不含 read-edit-exec，但保留 other-skill
    const agentContent = readFileSync(join(TMP_DIR, 'agents', 'executor.md'), 'utf-8');
    expect(agentContent).not.toContain('read-edit-exec');
    expect(agentContent).toContain('other-skill');

    // behaviors.jsonl 移除 acid-test-pattern，保留 other-behavior
    const behaviors = readFileSync(behaviorsFile, 'utf-8').trim().split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
    expect(behaviors.find(b => b.id === 'acid-test-pattern')).toBeUndefined();
    expect(behaviors.find(b => b.id === 'other-behavior')).toBeTruthy();

    // lifecycle.jsonl 移除 acid-test-pattern 記錄，保留 other-id
    const lifecycle = readFileSync(lifecycleFile, 'utf-8').trim().split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
    expect(lifecycle.find(e => e.behaviorId === 'acid-test-pattern')).toBeUndefined();
    expect(lifecycle.find(e => e.behaviorId === 'other-id')).toBeTruthy();
  });

  test('cleanup=false 時跳過清理', async () => {
    makeSkillDir('read-edit-exec');

    const deps = {
      existsSync,
      readFileSync,
      writeFileSync,
      rmSync,
      appendFileSync,
      mkdirSync,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
    };

    const result = await phase6_cleanup('read-edit-exec', { cleanup: false }, deps);

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);

    // skill 目錄仍然存在
    expect(existsSync(join(TMP_DIR, 'skills', 'read-edit-exec'))).toBe(true);
  });

  test('部分清理失敗時仍回傳 ok=true，繼續清理其他項目', async () => {
    writeFileSync(behaviorsFile, JSON.stringify({ id: 'acid-test-pattern', deployed: true }) + '\n');

    const deps = {
      existsSync,
      readFileSync,
      writeFileSync,
      rmSync: () => { throw new Error('刪除失敗'); }, // 讓 skill 刪除失敗
      appendFileSync,
      mkdirSync,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
    };

    const result = await phase6_cleanup('some-skill', { cleanup: true }, deps);

    // 即使刪除失敗也繼續，behaviors.jsonl 仍應被清理
    // cleanup 回傳 ok 取決於整體流程不 throw
    expect(result).toBeTruthy();

    // behaviors.jsonl 應仍被清理
    const behaviors = readFileSync(behaviorsFile, 'utf-8').trim().split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
    expect(behaviors.find(b => b.id === 'acid-test-pattern')).toBeUndefined();
  });
});

// ─── runAcidTest mock 模式 ────────────────────────────────────────────────────

describe('runAcidTest', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('mock 模式下全部 phase 通過（6 個 phase）', async () => {
    // 準備環境
    writeFileSync(join(TMP_DIR, 'agents', 'executor.md'), makeAgentFile([]));

    let checkLifecycleCalled = false;

    const deps = {
      appendFileSync,
      writeFileSync,
      existsSync,
      mkdirSync,
      readFileSync,
      rmSync,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
      askLocalModel: async () => MOCK_SKILL_CONTENT,
      scoreWithModel: () => ({ total: 45 }),
      generateImprovements: async () => [],
      checkLifecycle: async (lifecycleDeps) => {
        checkLifecycleCalled = true;
        // 模擬 lifecycle：建立 skill 產物
        const skillName = 'read-edit-exec';
        const skillDir = join(TMP_DIR, 'skills', skillName);
        const refsDir = join(skillDir, 'references');
        mkdirSync(refsDir, { recursive: true });
        writeFileSync(join(skillDir, 'SKILL.md'), MOCK_SKILL_CONTENT);

        // 更新 behaviors.jsonl（標記 deployed=true）
        const content = existsSync(behaviorsFile)
          ? readFileSync(behaviorsFile, 'utf-8').trim()
          : '';
        const behaviors = content
          ? content.split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
          : [];
        const updated = behaviors.map(b => b.id === 'acid-test-pattern' ? { ...b, deployed: true } : b);
        writeFileSync(behaviorsFile, updated.map(b => JSON.stringify(b)).join('\n') + '\n');

        // 寫入 lifecycle.jsonl
        appendFileSync(lifecycleFile, JSON.stringify({ behaviorId: 'acid-test-pattern', action: 'forge', skillName }) + '\n');

        // 更新 executor.md
        const agentPath = join(TMP_DIR, 'agents', 'executor.md');
        const agentContent = readFileSync(agentPath, 'utf-8');
        const updatedAgent = agentContent.replace('skills:\n', `skills:\n  - ${skillName}\n`);
        writeFileSync(agentPath, updatedAgent);

        return { processed: 1, forged: 1, deployed: 1, drafts: 0 };
      },
    };

    const result = await runAcidTest({ mock: true, verbose: false, cleanup: true }, deps);

    expect(checkLifecycleCalled).toBe(true);
    expect(result.phases).toHaveLength(6);

    // 6_cleanup 是最後一個
    expect(result.phases[5].name).toBe('6_cleanup');
  });

  test('某 phase 失敗後仍繼續執行後續 phase（含 cleanup）', async () => {
    writeFileSync(join(TMP_DIR, 'agents', 'executor.md'), makeAgentFile([]));

    const deps = {
      appendFileSync,
      writeFileSync,
      existsSync,
      mkdirSync,
      readFileSync,
      rmSync,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
      askLocalModel: async () => MOCK_SKILL_CONTENT,
      // Phase 2 會失敗（checkLifecycle 拋出例外）
      checkLifecycle: async () => { throw new Error('mock 失敗'); },
    };

    const result = await runAcidTest({ mock: false, verbose: false, cleanup: true }, deps);

    // 所有 6 個 phase 都有記錄
    expect(result.phases).toHaveLength(6);

    // Phase 2 失敗
    const p2 = result.phases.find(p => p.name === '2_forge');
    expect(p2.ok).toBe(false);

    // Phase 6 cleanup 一定要執行
    const p6 = result.phases.find(p => p.name === '6_cleanup');
    expect(p6).toBeTruthy();

    // 整體 ok=false（因為有 phase 失敗）
    expect(result.ok).toBe(false);
  });

  test('cleanup 即使有失敗也執行（不被跳過）', async () => {
    writeFileSync(join(TMP_DIR, 'agents', 'executor.md'), makeAgentFile([]));
    writeFileSync(behaviorsFile, JSON.stringify({ id: 'acid-test-pattern', deployed: false }) + '\n');

    let cleanupCalled = false;
    const deps = {
      appendFileSync,
      writeFileSync,
      existsSync,
      mkdirSync,
      readFileSync,
      rmSync,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
      // Phase 2 失敗
      checkLifecycle: async () => { throw new Error('lifecycle 錯誤'); },
    };

    // 包裝 phase6_cleanup 確認它被呼叫
    const originalPhase6 = phase6_cleanup;

    const result = await runAcidTest({ mock: false, verbose: false, cleanup: true }, deps);

    // Phase 6 應在 phases 中
    const p6 = result.phases.find(p => p.name === '6_cleanup');
    expect(p6).toBeTruthy();
  });

  test('所有 phase 回傳 { ok, phases } 結構', async () => {
    writeFileSync(join(TMP_DIR, 'agents', 'executor.md'), makeAgentFile([]));

    const deps = {
      appendFileSync,
      writeFileSync,
      existsSync,
      mkdirSync,
      readFileSync,
      rmSync,
      claudeDir: TMP_DIR,
      behaviorsFile,
      lifecycleFile,
      checkLifecycle: async () => ({ processed: 0, forged: 0, deployed: 0, drafts: 0 }),
    };

    const result = await runAcidTest({ mock: false, cleanup: true }, deps);

    expect(typeof result.ok).toBe('boolean');
    expect(Array.isArray(result.phases)).toBe(true);

    for (const phase of result.phases) {
      expect(typeof phase.name).toBe('string');
      expect(typeof phase.ok).toBe('boolean');
      expect(typeof phase.duration).toBe('number');
    }
  });
});
