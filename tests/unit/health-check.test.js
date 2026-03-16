/**
 * health-check.test.js — health-check.js 單元 + 整合測試
 *
 * 測試策略：
 * 1. scan 層：scanSkills / scanAgents / scanHooks 回傳正確結構
 * 2. check 層：陽性測試（mock fs 製造缺口，驗證偵測到 finding）
 * 3. orchestrator：runAll / runQuick 格式 + summary 計算
 * 4. CLI 整合：execSync 驗證 stdout 為合法 JSON
 * 5. 真實系統整合：~/.claude/ 執行後 0 critical finding
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { execSync } from 'child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

// ─── 輔助函式 ─────────────────────────────────────────────────────────────────

function makeTmpDir(prefix = 'health-check-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** 建立模擬的 ~/.claude/ 目錄結構 */
function makeClaudeDir(baseDir) {
  const dirs = [
    'skills',
    'agents',
    'hooks/modules',
    'scripts',
  ];
  for (const d of dirs) {
    mkdirSync(join(baseDir, d), { recursive: true });
  }
  return baseDir;
}

function writeSkill(claudeDir, skillName, frontmatter = '', body = '', refs = []) {
  const skillDir = join(claudeDir, 'skills', skillName);
  mkdirSync(skillDir, { recursive: true });

  const fm = frontmatter || `---\nname: ${skillName}\ndescription: Test skill\n---\n`;
  const refsSection = refs.length > 0
    ? '\n## 資源索引\n' + refs.map(r => `| 💡 \`./references/${r}\` | desc |`).join('\n')
    : '';
  writeFileSync(join(skillDir, 'SKILL.md'), `${fm}\n# ${skillName}\n${body}${refsSection}\n`);
  return skillDir;
}

function writeSkillRef(claudeDir, skillName, refFile, content = '# ref') {
  const refsDir = join(claudeDir, 'skills', skillName, 'references');
  mkdirSync(refsDir, { recursive: true });
  writeFileSync(join(refsDir, refFile), content);
}

function writeAgent(claudeDir, agentName, skills = []) {
  const skillsYaml = skills.length > 0
    ? `skills:\n${skills.map(s => `  - ${s}`).join('\n')}\n`
    : '';
  const content = `---\nname: ${agentName}\ndescription: Test agent\nmodel: sonnet\n${skillsYaml}---\n\n# ${agentName}\n`;
  writeFileSync(join(claudeDir, 'agents', `${agentName}.md`), content);
}

function writeSettings(claudeDir, hooks = {}) {
  const settings = { hooks };
  writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2));
}

function writeHookClient(claudeDir, fallbackModules = {}) {
  const fbStr = Object.entries(fallbackModules)
    .map(([k, v]) => `  '${k}': { path: '${v.path}', fn: '${v.fn}' },`)
    .join('\n');
  const content = `// hook-client.js (test stub)
const FALLBACK_MODULES = {
${fbStr}
};
`;
  const hooksDir = join(claudeDir, 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(join(hooksDir, 'hook-client.js'), content);
}

function writeModule(claudeDir, moduleName, exportedFns = []) {
  const fnDefs = exportedFns.map(fn => `export async function ${fn}(input) { return {}; }`).join('\n');
  const content = `// ${moduleName} (test stub)\n${fnDefs}\n`;
  writeFileSync(join(claudeDir, 'hooks', 'modules', moduleName), content);
}

// ─── 直接 import 被測模組（使用真實路徑） ────────────────────────────────────

const HC_PATH = '/Users/sbu/.claude/scripts/health-check.js';

const {
  checkClosedLoop,
  checkSkillCoverage,
  checkHookIntegrity,
  checkAgentAlignment,
  runAll,
  runQuick,
} = await import(HC_PATH);

// 從模組中提取 scan 函式（透過直接 import 需要存取）
// 注意：scan 層函式未 export，透過間接測試驗證

// ─── 1. Scan 層測試 ──────────────────────────────────────────────────────────

describe('scan 層（間接驗證）', () => {
  it('checkClosedLoop 對空目錄回傳空 findings', async () => {
    const tmpDir = makeTmpDir();
    makeClaudeDir(tmpDir);
    // 建立空 skills 目錄
    const results = [];
    // 用 cache 注入空 scan 結果
    const cache = { skills: [], agents: [] };
    const findings = await checkClosedLoop(cache);
    expect(findings).toBeArray();
    expect(findings.length).toBe(0);
    rmSync(tmpDir, { recursive: true });
  });

  it('checkAgentAlignment 對空 agents 回傳空 findings', async () => {
    const cache = { agents: [], skills: [] };
    const findings = await checkAgentAlignment(cache);
    expect(findings).toBeArray();
    expect(findings.length).toBe(0);
  });

  it('checkHookIntegrity 對空 hooks 回傳空 findings', async () => {
    const cache = { hooks: [], modules: [] };
    const findings = await checkHookIntegrity(cache);
    expect(findings).toBeArray();
    // 空的 hooks + 空的 modules，FALLBACK_MODULES 來自真實 hook-client.js
    // 只驗證回傳陣列即可
  });
});

// ─── 2. checkClosedLoop 陽性測試 ─────────────────────────────────────────────

describe('checkClosedLoop', () => {
  it('偵測 missing-skillmd（目錄存在但無 SKILL.md）', async () => {
    // 模擬一個有目錄但無 SKILL.md 的 skill
    const cache = {
      skills: [{
        name: 'orphan-dir',
        dir: '/tmp/orphan-dir',
        skillMdPath: null,
        hasSkillMd: false,
        frontmatter: {},
        content: null,
        refFiles: [],
        exampleFiles: [],
      }],
      agents: [],
    };
    const findings = await checkClosedLoop(cache);
    const f = findings.find(f => f.type === 'missing-skillmd');
    expect(f).toBeDefined();
    expect(f.severity).toBe('critical');
    expect(f.element).toContain('orphan-dir');
  });

  it('偵測 orphan-skill（未被任何 agent 引用）', async () => {
    const cache = {
      skills: [{
        name: 'unused-skill',
        dir: '/tmp/unused-skill',
        skillMdPath: '/tmp/unused-skill/SKILL.md',
        hasSkillMd: true,
        frontmatter: { name: 'unused-skill' },
        content: '# unused-skill\n',
        refFiles: [],
        exampleFiles: [],
      }],
      agents: [],  // 沒有 agent 引用
    };
    const findings = await checkClosedLoop(cache);
    const f = findings.find(f => f.type === 'orphan-skill');
    expect(f).toBeDefined();
    expect(f.severity).toBe('warning');
    expect(f.element).toContain('unused-skill');
  });

  it('偵測 name-mismatch（目錄名與 frontmatter name 不符）', async () => {
    const cache = {
      skills: [{
        name: 'dir-name',
        dir: '/tmp/dir-name',
        skillMdPath: '/tmp/dir-name/SKILL.md',
        hasSkillMd: true,
        frontmatter: { name: 'different-name' },
        content: '# skill\n',
        refFiles: [],
        exampleFiles: [],
      }],
      agents: [{ name: 'agent', path: '/tmp/agent.md', frontmatter: { skills: ['dir-name'] }, skills: ['dir-name'] }],
    };
    const findings = await checkClosedLoop(cache);
    const f = findings.find(f => f.type === 'name-mismatch');
    expect(f).toBeDefined();
    expect(f.severity).toBe('warning');
  });

  it('偵測 unindexed-reference（references/ 有檔案但 SKILL.md 無索引）', async () => {
    const cache = {
      skills: [{
        name: 'my-skill',
        dir: '/tmp/my-skill',
        skillMdPath: '/tmp/my-skill/SKILL.md',
        hasSkillMd: true,
        frontmatter: { name: 'my-skill' },
        content: '# my-skill\n無任何 reference 索引\n',
        refFiles: ['hidden-ref.md'],  // 有檔案
        exampleFiles: [],
      }],
      agents: [{ name: 'agent', path: '/tmp/agent.md', frontmatter: { skills: ['my-skill'] }, skills: ['my-skill'] }],
    };
    const findings = await checkClosedLoop(cache);
    const f = findings.find(f => f.type === 'unindexed-reference');
    expect(f).toBeDefined();
    expect(f.severity).toBe('warning');
    expect(f.description).toContain('hidden-ref.md');
  });

  it('偵測 broken-reference（SKILL.md 索引指向不存在的檔案）', async () => {
    const tmpSkillDir = makeTmpDir('skill-');
    // 建立一個含 reference 索引但檔案不存在的 SKILL.md
    const content = '---\nname: test\n---\n\n| 💡 `./references/nonexistent.md` | desc |\n';
    const cache = {
      skills: [{
        name: 'test',
        dir: tmpSkillDir,
        skillMdPath: join(tmpSkillDir, 'SKILL.md'),
        hasSkillMd: true,
        frontmatter: { name: 'test' },
        content,
        refFiles: [],  // 實際上沒有這個檔案
        exampleFiles: [],
      }],
      agents: [{ name: 'agent', path: '/tmp/agent.md', frontmatter: { skills: ['test'] }, skills: ['test'] }],
    };
    const findings = await checkClosedLoop(cache);
    const f = findings.find(f => f.type === 'broken-reference');
    expect(f).toBeDefined();
    expect(f.severity).toBe('critical');
    expect(f.description).toContain('nonexistent.md');
    rmSync(tmpSkillDir, { recursive: true });
  });
});

// ─── 3. checkSkillCoverage 陽性測試 ─────────────────────────────────────────

describe('checkSkillCoverage', () => {
  it('偵測 empty-references（skill 無任何 reference）', async () => {
    const cache = {
      skills: [{
        name: 'empty-skill',
        hasSkillMd: true,
        content: '# empty',
        refFiles: [],
        exampleFiles: [],
      }],
      scripts: [],
    };
    const findings = await checkSkillCoverage(cache);
    const f = findings.find(f => f.type === 'empty-references');
    expect(f).toBeDefined();
    expect(f.severity).toBe('info');
    expect(f.element).toContain('empty-skill');
  });

  it('偵測 orphan-script（scripts 未被任何 skill 引用）', async () => {
    const cache = {
      skills: [{
        name: 'some-skill',
        hasSkillMd: true,
        content: '# some-skill\n沒有提及任何腳本',
        refFiles: [],
        exampleFiles: [],
      }],
      scripts: [{ name: 'mystery-tool.js', path: '/tmp/mystery-tool.js' }],
    };
    const findings = await checkSkillCoverage(cache);
    const f = findings.find(f => f.type === 'orphan-script');
    expect(f).toBeDefined();
    expect(f.severity).toBe('warning');
    expect(f.element).toContain('mystery-tool.js');
  });

  it('有 skill 引用腳本時不產生 orphan-script', async () => {
    const cache = {
      skills: [{
        name: 'some-skill',
        hasSkillMd: true,
        content: '# some-skill\n使用 known-tool.js 執行操作',
        refFiles: [],
        exampleFiles: [],
      }],
      scripts: [{ name: 'known-tool.js', path: '/tmp/known-tool.js' }],
    };
    const findings = await checkSkillCoverage(cache);
    const orphans = findings.filter(f => f.type === 'orphan-script');
    expect(orphans.length).toBe(0);
  });
});

// ─── 4. checkHookIntegrity 陽性測試 ─────────────────────────────────────────

describe('checkHookIntegrity', () => {
  it('偵測 broken-hook-command（hook command 指向不存在腳本）', async () => {
    const cache = {
      hooks: [{
        eventType: 'SessionEnd',
        matcher: '',
        command: `bun ${homedir()}/.claude/scripts/nonexistent-script.js`,
      }],
      modules: [],
    };
    const findings = await checkHookIntegrity(cache);
    const f = findings.find(f => f.type === 'broken-hook-command');
    expect(f).toBeDefined();
    expect(f.severity).toBe('critical');
    expect(f.description).toContain('nonexistent-script.js');
  });

  it('存在的腳本不產生 broken-hook-command', async () => {
    const cache = {
      hooks: [{
        eventType: 'SessionEnd',
        matcher: '',
        command: `bun ${homedir()}/.claude/scripts/maintainer.js`,
      }],
      modules: [],
    };
    const findings = await checkHookIntegrity(cache);
    const f = findings.find(f => f.type === 'broken-hook-command');
    expect(f).toBeUndefined();
  });
});

// ─── 5. checkAgentAlignment 陽性測試 ────────────────────────────────────────

describe('checkAgentAlignment', () => {
  it('偵測 missing-skill-dir（agent skills[] 引用不存在的 skill 目錄）', async () => {
    const cache = {
      agents: [{
        name: 'my-agent',
        path: '/tmp/my-agent.md',
        frontmatter: { skills: ['ghost-skill'] },
        skills: ['ghost-skill'],
      }],
      skills: [],  // 空的，沒有 ghost-skill
    };
    const findings = await checkAgentAlignment(cache);
    const f = findings.find(f => f.type === 'missing-skill-dir');
    expect(f).toBeDefined();
    expect(f.severity).toBe('critical');
    expect(f.description).toContain('ghost-skill');
  });

  it('偵測 missing-skill-definition（skill 目錄存在但無 SKILL.md）', async () => {
    const cache = {
      agents: [{
        name: 'my-agent',
        path: '/tmp/my-agent.md',
        frontmatter: { skills: ['incomplete-skill'] },
        skills: ['incomplete-skill'],
      }],
      skills: [{
        name: 'incomplete-skill',
        dir: '/tmp/incomplete-skill',
        skillMdPath: null,
        hasSkillMd: false,  // 無 SKILL.md
        frontmatter: {},
        content: null,
        refFiles: [],
        exampleFiles: [],
      }],
    };
    const findings = await checkAgentAlignment(cache);
    const f = findings.find(f => f.type === 'missing-skill-definition');
    expect(f).toBeDefined();
    expect(f.severity).toBe('critical');
  });

  it('偵測 no-skills-defined（agent frontmatter 缺少 skills 欄位）', async () => {
    const cache = {
      agents: [{
        name: 'lazy-agent',
        path: '/tmp/lazy-agent.md',
        frontmatter: { name: 'lazy-agent' },  // 無 skills
        skills: [],
      }],
      skills: [],
    };
    const findings = await checkAgentAlignment(cache);
    const f = findings.find(f => f.type === 'no-skills-defined');
    expect(f).toBeDefined();
    expect(f.severity).toBe('info');
  });

  it('偵測 shared-skill（同一 skill 被多個 agent 引用）', async () => {
    const cache = {
      agents: [
        {
          name: 'agent-a',
          path: '/tmp/agent-a.md',
          frontmatter: { skills: ['shared'] },
          skills: ['shared'],
        },
        {
          name: 'agent-b',
          path: '/tmp/agent-b.md',
          frontmatter: { skills: ['shared'] },
          skills: ['shared'],
        },
      ],
      skills: [{
        name: 'shared',
        dir: '/tmp/shared',
        skillMdPath: '/tmp/shared/SKILL.md',
        hasSkillMd: true,
        frontmatter: { name: 'shared' },
        content: '# shared\n',
        refFiles: [],
        exampleFiles: [],
      }],
    };
    const findings = await checkAgentAlignment(cache);
    const f = findings.find(f => f.type === 'shared-skill');
    expect(f).toBeDefined();
    expect(f.severity).toBe('info');
    expect(f.description).toContain('2');
  });

  it('正常對齊時不產生 critical finding', async () => {
    const cache = {
      agents: [{
        name: 'good-agent',
        path: '/tmp/good-agent.md',
        frontmatter: { skills: ['good-skill'] },
        skills: ['good-skill'],
      }],
      skills: [{
        name: 'good-skill',
        dir: '/tmp/good-skill',
        skillMdPath: '/tmp/good-skill/SKILL.md',
        hasSkillMd: true,
        frontmatter: { name: 'good-skill' },
        content: '# good\n',
        refFiles: [],
        exampleFiles: [],
      }],
    };
    const findings = await checkAgentAlignment(cache);
    const criticals = findings.filter(f => f.severity === 'critical');
    expect(criticals.length).toBe(0);
  });
});

// ─── 6. runAll / runQuick 格式測試 ───────────────────────────────────────────

describe('runAll', () => {
  it('回傳符合 HealthReport 結構', async () => {
    const report = await runAll();
    // summary
    expect(report.summary).toBeDefined();
    expect(['healthy', 'warning', 'critical']).toContain(report.summary.status);
    expect(typeof report.summary.total).toBe('number');
    expect(typeof report.summary.critical).toBe('number');
    expect(typeof report.summary.warning).toBe('number');
    expect(typeof report.summary.info).toBe('number');
    expect(typeof report.summary.duration).toBe('number');
    // findings
    expect(Array.isArray(report.findings)).toBe(true);
    // metadata
    expect(report.metadata).toBeDefined();
    expect(typeof report.metadata.timestamp).toBe('string');
    expect(report.metadata.version).toBe('1.0.0');
    expect(Array.isArray(report.metadata.checksRun)).toBe(true);
  });

  it('summary 計數與 findings 陣列一致', async () => {
    const report = await runAll();
    const { summary, findings } = report;
    const criticalActual = findings.filter(f => f.severity === 'critical').length;
    const warningActual = findings.filter(f => f.severity === 'warning').length;
    const infoActual = findings.filter(f => f.severity === 'info').length;
    expect(summary.critical).toBe(criticalActual);
    expect(summary.warning).toBe(warningActual);
    expect(summary.info).toBe(infoActual);
    expect(summary.total).toBe(findings.length);
  });

  it('指定 checks 時只跑指定的 check', async () => {
    const report = await runAll({ checks: ['closedLoop'] });
    expect(report.metadata.checksRun).toEqual(['closedLoop']);
    // 只有 closedLoop 的 findings
    for (const f of report.findings) {
      expect(f.check).toBe('closedLoop');
    }
  });

  it('status 正確：0 critical → healthy 或 warning', async () => {
    const report = await runAll({ checks: ['agentAlignment'] });
    if (report.summary.critical === 0 && report.summary.warning === 0) {
      expect(report.summary.status).toBe('healthy');
    } else if (report.summary.critical === 0) {
      expect(report.summary.status).toBe('warning');
    } else {
      expect(report.summary.status).toBe('critical');
    }
  });

  it('每個 finding 都有必要欄位', async () => {
    const report = await runAll();
    for (const f of report.findings) {
      expect(typeof f.check).toBe('string');
      expect(typeof f.type).toBe('string');
      expect(['critical', 'warning', 'info']).toContain(f.severity);
      expect(typeof f.element).toBe('string');
      expect(typeof f.description).toBe('string');
    }
  });
});

describe('runQuick', () => {
  it('只跑 closedLoop 和 hookIntegrity', async () => {
    const report = await runQuick();
    expect(report.metadata.checksRun).toContain('closedLoop');
    expect(report.metadata.checksRun).toContain('hookIntegrity');
    expect(report.metadata.checksRun.length).toBe(2);
    expect(report.metadata.checksRun).not.toContain('skillCoverage');
    expect(report.metadata.checksRun).not.toContain('agentAlignment');
  });

  it('回傳合法 HealthReport', async () => {
    const report = await runQuick();
    expect(report.summary).toBeDefined();
    expect(report.findings).toBeArray();
    expect(report.metadata).toBeDefined();
  });
});

// ─── 7. CLI 整合測試 ─────────────────────────────────────────────────────────

describe('CLI 整合', () => {
  it('stdout 為合法 JSON（全量檢查）', () => {
    const output = execSync(
      `bun ${HC_PATH}`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    const parsed = JSON.parse(output);
    expect(parsed.summary).toBeDefined();
    expect(parsed.findings).toBeDefined();
    expect(parsed.metadata).toBeDefined();
  });

  it('stdout 為合法 JSON（--quick 模式）', () => {
    const output = execSync(
      `bun ${HC_PATH} --quick`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    const parsed = JSON.parse(output);
    expect(parsed.metadata.checksRun.length).toBe(2);
  });

  it('指定 check 參數時只跑該 check', () => {
    const output = execSync(
      `bun ${HC_PATH} closedLoop`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    const parsed = JSON.parse(output);
    expect(parsed.metadata.checksRun).toEqual(['closedLoop']);
  });

  it('exit code 為 0', () => {
    expect(() => {
      execSync(`bun ${HC_PATH}`, { encoding: 'utf-8', timeout: 10000 });
    }).not.toThrow();
  });

  it('未知參數時 exit code 為 1', () => {
    expect(() => {
      execSync(`bun ${HC_PATH} unknownCheck`, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }).toThrow();
  });
});

// ─── 8. 真實系統整合測試 ─────────────────────────────────────────────────────

describe('真實 ~/.claude/ 整合', () => {
  it('全量檢查：0 個 critical finding', async () => {
    const report = await runAll();
    const criticals = report.findings.filter(f => f.severity === 'critical');
    if (criticals.length > 0) {
      console.error('Critical findings 詳情:');
      for (const f of criticals) {
        console.error(`  [${f.check}] ${f.element}: ${f.description}`);
      }
    }
    expect(criticals.length).toBe(0);
  });

  it('runAll 執行時間 <2000ms', async () => {
    const start = performance.now();
    await runAll();
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(2000);
  });

  it('runQuick 執行時間 <500ms', async () => {
    const start = performance.now();
    await runQuick();
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(500);
  });

  it('相同輸入 → 相同輸出（確定性）', async () => {
    const r1 = await runAll({ checks: ['closedLoop'] });
    const r2 = await runAll({ checks: ['closedLoop'] });
    // 比較 findings 數量和類型（不比較 timestamp 和 duration）
    expect(r1.findings.length).toBe(r2.findings.length);
    expect(r1.summary.critical).toBe(r2.summary.critical);
    expect(r1.summary.warning).toBe(r2.summary.warning);
  });

  it('metadata.checksRun 包含所有 4 個 check', async () => {
    const report = await runAll();
    expect(report.metadata.checksRun).toContain('closedLoop');
    expect(report.metadata.checksRun).toContain('skillCoverage');
    expect(report.metadata.checksRun).toContain('hookIntegrity');
    expect(report.metadata.checksRun).toContain('agentAlignment');
  });
});
