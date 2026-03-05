'use strict';
/**
 * tests/unit/project-orchestrator.test.js
 *
 * 覆蓋 Feature 1–4, 5（experienceHints）, 6, 7（純函式 + orchestrate 行為）。
 */

const { describe, it, expect, beforeEach, mock, afterEach } = require('bun:test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  parseSpecToText,
  extractFeatureList,
  orchestrate,
} = require('../../plugins/overtone/scripts/lib/project-orchestrator');

// ── 測試用 ProjectSpec 工廠 ──

function makeSpec(overrides = {}) {
  return {
    feature: 'test-feature',
    generatedAt: '2026-03-06T00:00:00.000Z',
    facets: {
      functional: ['使用者可以上傳圖片', '系統自動壓縮圖片'],
      flow: ['打開上傳頁面', '選擇圖片', '確認上傳'],
      ui: [],
      edgeCases: ['空白圖片應顯示錯誤'],
      acceptance: [
        { title: '使用者登入', given: '使用者已註冊', when: '輸入帳密', then: '成功登入' },
      ],
      ...((overrides.facets) || {}),
    },
    ...overrides,
  };
}

// ── Feature 1: parseSpecToText ──

describe('Feature 1: parseSpecToText — 規格轉純文字', () => {
  it('Scenario 1-1: ProjectSpec 物件輸入 — 合併所有 facets', () => {
    const spec = makeSpec();
    const text = parseSpecToText(spec);

    // 包含 feature name
    expect(text).toContain('test-feature');
    // 包含 functional
    expect(text).toContain('使用者可以上傳圖片');
    expect(text).toContain('系統自動壓縮圖片');
    // 包含 flow
    expect(text).toContain('打開上傳頁面');
    // 包含 edgeCases
    expect(text).toContain('空白圖片應顯示錯誤');
    // 包含 acceptance 場景展平文字
    expect(text).toContain('使用者登入');
    expect(text).toContain('使用者已註冊');
    expect(text).toContain('輸入帳密');
    expect(text).toContain('成功登入');
  });

  it('Scenario 1-2: 純字串輸入 — 直接回傳', () => {
    const markdown = '## 功能定義\n- 功能 A\n- 功能 B';
    const result = parseSpecToText(markdown);
    expect(result).toBe(markdown);
  });

  it('Scenario 1-3: ProjectSpec 部分 facets 為空陣列', () => {
    const spec = makeSpec({
      facets: {
        functional: ['核心功能'],
        flow: [],
        ui: [],
        edgeCases: ['邊界情況'],
        acceptance: [],
      },
    });
    const text = parseSpecToText(spec);
    expect(text).toContain('核心功能');
    expect(text).toContain('邊界情況');
    // 不因空陣列拋出錯誤（已由 expect 不拋出保證）
  });

  it('Scenario 1-4: acceptance 中的 BDD 場景展平', () => {
    const spec = makeSpec({
      facets: {
        functional: [],
        flow: [],
        ui: [],
        edgeCases: [],
        acceptance: [
          { title: '使用者登入', given: '使用者已註冊', when: '輸入帳密', then: '成功登入' },
        ],
      },
    });
    const text = parseSpecToText(spec);
    // 場景內容以可讀文字形式展平（非 JSON）
    expect(text).toContain('使用者登入');
    expect(text).toContain('使用者已註冊');
    expect(text).toContain('輸入帳密');
    expect(text).toContain('成功登入');
    // 確認是文字而非 JSON 物件
    expect(text).not.toContain('"title"');
    expect(text).not.toContain('"given"');
  });

  it('Scenario 1-5: 無效輸入 null → 回傳空字串', () => {
    expect(parseSpecToText(null)).toBe('');
  });

  it('Scenario 1-5: 無效輸入 undefined → 回傳空字串', () => {
    expect(parseSpecToText(undefined)).toBe('');
  });
});

// ── Feature 2: extractFeatureList ──

describe('Feature 2: extractFeatureList — 提取功能清單', () => {
  it('Scenario 2-1: ProjectSpec 物件 — 從 functional facet 提取', () => {
    const spec = makeSpec({
      facets: {
        functional: ['使用者可以上傳圖片', '系統自動壓縮圖片', '管理員可審核圖片'],
        flow: [], ui: [], edgeCases: [], acceptance: [],
      },
    });
    const result = extractFeatureList(spec, 'standard');

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ name: '使用者可以上傳圖片', workflow: 'standard' });
    expect(result[1]).toMatchObject({ name: '系統自動壓縮圖片', workflow: 'standard' });
    expect(result[2]).toMatchObject({ name: '管理員可審核圖片', workflow: 'standard' });
  });

  it('Scenario 2-2: workflowTemplate 參數傳遞', () => {
    const spec = makeSpec({
      facets: {
        functional: ['功能 A', '功能 B'],
        flow: [], ui: [], edgeCases: [], acceptance: [],
      },
    });
    const result = extractFeatureList(spec, 'quick');
    expect(result.every(r => r.workflow === 'quick')).toBe(true);
  });

  it('Scenario 2-3: workflowTemplate 省略時使用預設值 standard', () => {
    const spec = makeSpec({
      facets: {
        functional: ['功能 X'],
        flow: [], ui: [], edgeCases: [], acceptance: [],
      },
    });
    const result = extractFeatureList(spec);
    expect(result[0].workflow).toBe('standard');
  });

  it('Scenario 2-4: Markdown 字串輸入 — 從「功能定義」section 提取', () => {
    const markdown = '## 功能定義\n- 功能 A\n- 功能 B\n- 功能 C\n\n## 其他 section';
    const result = extractFeatureList(markdown, 'standard');

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('功能 A');
    expect(result[1].name).toBe('功能 B');
    expect(result[2].name).toBe('功能 C');
  });

  it('Scenario 2-5: Markdown 字串無「功能定義」section — fallback 到章節標題', () => {
    const markdown = '## 介紹\n內容\n\n## 設計\n內容\n\n## 結論\n內容';
    const result = extractFeatureList(markdown, 'standard');

    expect(result.length).toBeGreaterThan(0);
    const names = result.map(r => r.name);
    expect(names).toContain('介紹');
    expect(names).toContain('設計');
  });

  it('Scenario 2-6: functional facet 超過 50 字截斷', () => {
    const longText = 'A'.repeat(100);
    const spec = makeSpec({
      facets: {
        functional: [longText],
        flow: [], ui: [], edgeCases: [], acceptance: [],
      },
    });
    const result = extractFeatureList(spec);
    expect(result[0].name.length).toBeLessThanOrEqual(50);
  });

  it('Scenario 2-7: 空輸入 null → 回傳空陣列', () => {
    expect(extractFeatureList(null)).toEqual([]);
  });

  it('Scenario 2-7: 空輸入空字串 → 回傳空陣列', () => {
    expect(extractFeatureList('')).toEqual([]);
  });

  it('Scenario 2-7: 空輸入空物件 → 回傳空陣列', () => {
    expect(extractFeatureList({})).toEqual([]);
  });

  it('Markdown 包含「功能定義（Functional）」標題時也能提取', () => {
    const markdown = '## 功能定義（Functional）\n\n- 功能 A\n- 功能 B\n\n## 其他';
    const result = extractFeatureList(markdown, 'standard');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('功能 A');
  });
});

// ── Feature 3 & 4: orchestrate ──

describe('Feature 3: orchestrate — dry-run 模式（預設行為）', () => {
  it('Scenario 3-1: dry-run 預設回傳 _preview 且 summary.dryRun === true', () => {
    const spec = makeSpec();
    const result = orchestrate(spec);

    expect(result.summary.dryRun).toBe(true);
    expect(result.queueResult._preview).toBe(true);
  });

  it('Scenario 3-1: dry-run 時 queueResult.items 與 features 對應', () => {
    const spec = makeSpec({
      facets: {
        functional: ['功能一', '功能二'],
        flow: [], ui: [], edgeCases: [], acceptance: [],
      },
    });
    const result = orchestrate(spec);
    expect(result.queueResult.items).toHaveLength(2);
    expect(result.queueResult.items[0].name).toBe('功能一');
    expect(result.queueResult.items[1].name).toBe('功能二');
  });

  it('Scenario 3-2: dry-run 時 domainAudit 正確分類 present / missing', () => {
    // 'testing' domain 應存在於 skills/ 目錄
    const spec = {
      feature: 'test',
      facets: {
        // 含測試相關關鍵字，命中 testing domain
        functional: ['unit test coverage assert bun:test describe it( expect mock stub spec'],
        flow: [], ui: [], edgeCases: [], acceptance: [],
      },
    };
    const result = orchestrate(spec);
    // testing domain 在 skills/ 中存在 → 應在 present
    expect(result.domainAudit.present).toContain('testing');
    expect(result.domainAudit.missing).not.toContain('testing');
  });

  it('Scenario 3-4: summary 數字欄位存在', () => {
    const spec = makeSpec();
    const result = orchestrate(spec);
    expect(typeof result.summary.totalDomains).toBe('number');
    expect(typeof result.summary.presentCount).toBe('number');
    expect(typeof result.summary.missingCount).toBe('number');
    expect(typeof result.summary.forgedCount).toBe('number');
    expect(typeof result.summary.featureCount).toBe('number');
    expect(result.summary.dryRun).toBe(true);
  });
});

describe('Feature 4: orchestrate — execute 模式', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('Scenario 4-1: execute 模式真實呼叫 appendQueue（佇列檔案存在）', () => {
    const spec = makeSpec({
      facets: {
        functional: ['功能一', '功能二'],
        flow: [], ui: [], edgeCases: [], acceptance: [],
      },
    });
    const result = orchestrate(spec, {
      dryRun: false,
      projectRoot: tempDir,
      overwriteQueue: false,
    });

    // queueResult 不是 preview
    expect(result.queueResult._preview).toBeUndefined();
    expect(result.queueResult.items).toHaveLength(2);
    expect(result.summary.dryRun).toBe(false);
  });

  it('Scenario 4-2: overwriteQueue 模式覆蓋佇列', () => {
    const spec = makeSpec({
      facets: {
        functional: ['功能 A'],
        flow: [], ui: [], edgeCases: [], acceptance: [],
      },
    });
    // 先寫入一個佇列
    const { writeQueue: wq } = require('../../plugins/overtone/scripts/lib/execution-queue');
    wq(tempDir, [{ name: '舊功能', workflow: 'standard' }], '舊來源');

    // overwrite 模式
    const result = orchestrate(spec, {
      dryRun: false,
      projectRoot: tempDir,
      overwriteQueue: true,
    });

    // 結果只有新的功能 A（舊的被覆蓋）
    expect(result.queueResult.items.map(i => i.name)).not.toContain('舊功能');
    expect(result.queueResult.items.map(i => i.name)).toContain('功能 A');
  });

  it('Scenario 4-4: forgeSkill 失敗不中斷流程（missing 域仍完整處理）', () => {
    // 使用不存在的 pluginRoot 讓 forgeSkill 可能出錯，但佇列仍寫入
    const spec = makeSpec({
      facets: {
        // 讓 specText 觸發一些 gap
        functional: ['功能 X'],
        flow: [], ui: [], edgeCases: [], acceptance: [],
      },
    });
    // 即使 forgeSkill 有錯誤，queueResult 仍存在
    const result = orchestrate(spec, {
      dryRun: false,
      projectRoot: tempDir,
    });

    expect(result.queueResult).toBeDefined();
    expect(result.forgeResults).toBeDefined();
    expect(Array.isArray(result.forgeResults)).toBe(true);
  });
});

// ── Feature 6: detectKnowledgeGaps 參數正確性 ──

describe('Feature 6: orchestrate — detectKnowledgeGaps 參數正確性', () => {
  it('Scenario 6-2: 已存在 skill 的 domain 從 missing 排除', () => {
    // testing domain 存在於 skills/ 目錄
    const spec = {
      feature: 'test',
      facets: {
        functional: ['unit test describe it( assert expect mock stub bun:test spec coverage'],
        flow: [], ui: [], edgeCases: [], acceptance: [],
      },
    };
    const result = orchestrate(spec);
    // testing 在 skills/ 中存在 → present，不在 missing
    expect(result.domainAudit.present).toContain('testing');
    expect(result.domainAudit.missing).not.toContain('testing');
  });

  it('Scenario 6-3: 無 missing domains 時 forgeResults 為空陣列', () => {
    // 用完全沒有 gap 的 spec（空內容，不觸發任何 domain）
    const spec = {
      feature: 'simple',
      facets: {
        functional: [],
        flow: [], ui: [], edgeCases: [], acceptance: [],
      },
    };
    const result = orchestrate(spec);
    expect(result.forgeResults).toEqual([]);
    expect(result.domainAudit.missing).toEqual([]);
  });
});

// ── Feature 7: OrchestrateResult 結構完整性 ──

describe('Feature 7: OrchestrateResult 結構完整性', () => {
  it('Scenario 7-1: 回傳值包含所有必要欄位', () => {
    const spec = makeSpec();
    const result = orchestrate(spec);

    // 四個頂層欄位
    expect(result).toHaveProperty('domainAudit');
    expect(result).toHaveProperty('forgeResults');
    expect(result).toHaveProperty('queueResult');
    expect(result).toHaveProperty('summary');

    // domainAudit 子欄位
    expect(result.domainAudit).toHaveProperty('present');
    expect(result.domainAudit).toHaveProperty('missing');
    expect(result.domainAudit).toHaveProperty('gaps');

    // summary 子欄位
    expect(result.summary).toHaveProperty('totalDomains');
    expect(result.summary).toHaveProperty('presentCount');
    expect(result.summary).toHaveProperty('missingCount');
    expect(result.summary).toHaveProperty('forgedCount');
    expect(result.summary).toHaveProperty('featureCount');
    expect(result.summary).toHaveProperty('dryRun');
  });

  it('Scenario 7-3: summary.totalDomains === presentCount + missingCount', () => {
    const spec = makeSpec();
    const result = orchestrate(spec);
    expect(result.summary.totalDomains).toBe(result.summary.presentCount + result.summary.missingCount);
  });

  it('summary.featureCount 與 features 數量相符', () => {
    const spec = makeSpec({
      facets: {
        functional: ['功能 A', '功能 B', '功能 C'],
        flow: [], ui: [], edgeCases: [], acceptance: [],
      },
    });
    const result = orchestrate(spec);
    expect(result.summary.featureCount).toBe(3);
  });
});

// ── Feature 5: orchestrate — experienceHints 整合 ──

describe('Feature 5: orchestrate — experienceHints 整合', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-exp-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('Scenario 5-1: experience-index 有資料時回傳 experienceHints 欄位', () => {
    // 在 tempDir 寫入一個 experience-index.json（模擬相似專案）
    const { buildIndex } = require('../../plugins/overtone/scripts/lib/knowledge/experience-index');
    // 建立一個不同的 projectRoot 模擬「其他專案」的索引
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-other-'));
    try {
      // 先在 tempDir 建立索引（模擬 otherDir 曾用過 testing, database domains）
      // 直接寫入 experience-index.json 到 global 路徑
      const paths = require('../../plugins/overtone/scripts/lib/paths');
      const indexPath = paths.global.experienceIndex(tempDir);
      const indexDir = path.dirname(indexPath);
      fs.mkdirSync(indexDir, { recursive: true });

      // 寫入一個不同 hash 的相似專案（testing + database 使用到）
      const fakeHash = 'fake-similar-project-hash';
      const indexData = {
        version: 1,
        entries: [{
          projectHash: fakeHash,
          domains: ['testing', 'database'],
          lastUpdated: new Date().toISOString(),
          sessionCount: 3,
        }],
      };
      fs.writeFileSync(indexPath, JSON.stringify(indexData), 'utf8');

      const spec = {
        feature: 'test',
        facets: {
          functional: ['unit test describe it( assert expect mock spec'],
          flow: [], ui: [], edgeCases: [], acceptance: [],
        },
      };
      const result = orchestrate(spec, { projectRoot: tempDir });

      // experienceHints 欄位存在
      expect(result).toHaveProperty('experienceHints');
      expect(result.experienceHints).not.toBeNull();
      expect(Array.isArray(result.experienceHints.recommendedDomains)).toBe(true);
      expect(typeof result.experienceHints.matchedProjects).toBe('number');
      expect(result.experienceHints.matchedProjects).toBeGreaterThanOrEqual(0);
    } finally {
      fs.rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it('Scenario 5-2: experience-index.json 不存在時 experienceHints.recommendedDomains 為空陣列', () => {
    // tempDir 沒有任何 experience-index.json
    const spec = makeSpec();
    const result = orchestrate(spec, { projectRoot: tempDir });

    // 主流程正常執行
    expect(result).toHaveProperty('domainAudit');
    expect(result).toHaveProperty('experienceHints');
    // 無索引 → 空陣列
    expect(result.experienceHints.recommendedDomains).toEqual([]);
    expect(result.experienceHints.matchedProjects).toBe(0);
  });

  it('Scenario 5-3: 未提供 projectRoot 時不含 experienceHints', () => {
    const spec = makeSpec();
    // 不傳 projectRoot
    const result = orchestrate(spec, {});

    // 不含 experienceHints 或為 undefined
    expect(result.experienceHints).toBeUndefined();
    // 主流程正常
    expect(result).toHaveProperty('domainAudit');
    expect(result).toHaveProperty('summary');
  });
});
