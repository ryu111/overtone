'use strict';
/**
 * knowledge-domain-chain.test.js — Knowledge Domain 三層鏈路驗證
 *
 * 驗證 7 個 knowledge domain 的完整鏈路：
 *   A. Frontmatter 合規（disable-model-invocation + user-invocable + name）
 *   B. Agent → Skill 連結（consumer agent 的 skills frontmatter 指向存在的 domain）
 *   C. Skill → Reference 完整性（references/ 和 examples/ 下的檔案都存在）
 *   D. 閉環驗證（6 個有 consumer 的 domain 各至少 1 agent 引用 + 所有 reference 內容非空）
 */

const { describe, test, expect, beforeAll } = require('bun:test');
const { join } = require('path');
const fs = require('fs');
const { PLUGIN_ROOT } = require('../helpers/paths');
const { parseFrontmatter } = require('../helpers/frontmatter');

const SKILLS_DIR = join(PLUGIN_ROOT, 'skills');
const AGENTS_DIR = join(PLUGIN_ROOT, 'agents');

// 7 個 knowledge domain 定義
const KNOWLEDGE_DOMAINS = [
  'testing',
  'workflow-core',
  'security-kb',
  'database',
  'dead-code',
  'commit-convention',
  'code-review',
];

// Agent → Domain 映射（6 個有 consumer 的 domain）
// workflow-core 無直接 agent consumer
const AGENT_DOMAIN_MAP = new Map([
  ['tester',            'testing'],
  ['qa',                'testing'],
  ['developer',         'commit-convention'],
  ['code-reviewer',     'code-review'],
  ['database-reviewer', 'database'],
  ['refactor-cleaner',  'dead-code'],
  ['security-reviewer', 'security-kb'],
]);

// 收集 domain 的所有 reference/example 檔案（相對路徑）
function collectDomainFiles(domainName) {
  const files = [];
  for (const subDir of ['references', 'examples']) {
    const dirPath = join(SKILLS_DIR, domainName, subDir);
    if (!fs.existsSync(dirPath)) continue;
    for (const file of fs.readdirSync(dirPath)) {
      if (file.endsWith('.md')) {
        files.push({ relPath: `${subDir}/${file}`, fullPath: join(dirPath, file) });
      }
    }
  }
  return files;
}

// ── 預先載入所有 agent frontmatter ──

const agentFrontmatters = {};
const agentFiles = [...AGENT_DOMAIN_MAP.keys()];

beforeAll(() => {
  for (const name of agentFiles) {
    const path = join(AGENTS_DIR, `${name}.md`);
    if (fs.existsSync(path)) {
      agentFrontmatters[name] = parseFrontmatter(path);
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Feature A：Frontmatter 合規
// ────────────────────────────────────────────────────────────────────────────

describe('Feature A：Knowledge Domain SKILL.md Frontmatter 合規', () => {
  for (const domain of KNOWLEDGE_DOMAINS) {
    describe(`A-${domain}：${domain} SKILL.md frontmatter`, () => {
      const skillPath = join(SKILLS_DIR, domain, 'SKILL.md');

      test(`${domain} SKILL.md 檔案存在`, () => {
        expect(fs.existsSync(skillPath)).toBe(true);
      });

      test(`${domain} frontmatter 包含 name: ${domain}`, () => {
        const fm = parseFrontmatter(skillPath);
        expect(fm.name).toBe(domain);
      });

      test(`${domain} frontmatter 包含 disable-model-invocation: true`, () => {
        const fm = parseFrontmatter(skillPath);
        expect(fm['disable-model-invocation']).toBe(true);
      });

      test(`${domain} frontmatter 包含 user-invocable: false`, () => {
        const fm = parseFrontmatter(skillPath);
        expect(fm['user-invocable']).toBe(false);
      });
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Feature B：Agent → Skill 連結
// ────────────────────────────────────────────────────────────────────────────

describe('Feature B：Agent → Skill 連結完整性', () => {
  for (const [agentName, domainName] of AGENT_DOMAIN_MAP) {
    describe(`B-${agentName}：${agentName} → ${domainName}`, () => {
      test(`${agentName} frontmatter 含 skills 欄位`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm).toBeDefined();
        expect(fm.skills).toBeDefined();
      });

      test(`${agentName} skills 包含 ${domainName}`, () => {
        const fm = agentFrontmatters[agentName];
        // skills 欄位為 Array（多行 YAML list 格式）
        const skills = Array.isArray(fm.skills) ? fm.skills : [fm.skills];
        expect(skills).toContain(domainName);
      });

      test(`${agentName} 引用的 ${domainName} SKILL.md 存在`, () => {
        const skillPath = join(SKILLS_DIR, domainName, 'SKILL.md');
        expect(fs.existsSync(skillPath)).toBe(true);
      });
    });
  }

  // workflow-core 無直接 agent consumer，但 SKILL.md 必須存在
  describe('B-workflow-core：workflow-core 無 consumer（SKILL.md 存在即可）', () => {
    test('workflow-core SKILL.md 存在', () => {
      const skillPath = join(SKILLS_DIR, 'workflow-core', 'SKILL.md');
      expect(fs.existsSync(skillPath)).toBe(true);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature C：Skill → Reference 完整性
// ────────────────────────────────────────────────────────────────────────────

describe('Feature C：Skill → Reference 完整性', () => {
  for (const domain of KNOWLEDGE_DOMAINS) {
    describe(`C-${domain}：${domain} references/ 和 examples/ 下的檔案存在`, () => {
      const domainFiles = collectDomainFiles(domain);

      test(`${domain} 至少有 1 個 reference 或 example 檔案`, () => {
        expect(domainFiles.length).toBeGreaterThan(0);
      });

      for (const { relPath, fullPath } of domainFiles) {
        test(`${domain}/${relPath} 存在`, () => {
          expect(fs.existsSync(fullPath)).toBe(true);
        });
      }
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Feature D：閉環驗證
// ────────────────────────────────────────────────────────────────────────────

describe('Feature D：閉環驗證', () => {
  // D-1：6 個有 consumer 的 domain 各至少 1 agent 引用
  describe('D-1：6 個有 consumer 的 domain 至少 1 個 agent 引用', () => {
    // 計算每個 domain 被多少 agent 引用
    const domainsWithConsumer = new Set(AGENT_DOMAIN_MAP.values());

    for (const domain of domainsWithConsumer) {
      test(`${domain} 至少被 1 個 agent 引用`, () => {
        const consumers = [...AGENT_DOMAIN_MAP.entries()]
          .filter(([, d]) => d === domain)
          .map(([a]) => a);
        expect(consumers.length).toBeGreaterThan(0);
      });
    }
  });

  // D-2：所有 reference 內容非空
  describe('D-2：所有 reference/example 檔案內容非空', () => {
    for (const domain of KNOWLEDGE_DOMAINS) {
      const domainFiles = collectDomainFiles(domain);

      for (const { relPath, fullPath } of domainFiles) {
        test(`${domain}/${relPath} 內容非空`, () => {
          const content = fs.readFileSync(fullPath, 'utf8').trim();
          expect(content.length).toBeGreaterThan(0);
        });
      }
    }
  });

  // D-3：確認 agent frontmatter 正確載入（所有 consumer agent 都存在）
  describe('D-3：所有 consumer agent 的 agent .md 檔案存在', () => {
    for (const agentName of AGENT_DOMAIN_MAP.keys()) {
      test(`${agentName}.md 存在`, () => {
        const agentPath = join(AGENTS_DIR, `${agentName}.md`);
        expect(fs.existsSync(agentPath)).toBe(true);
      });
    }
  });
});
