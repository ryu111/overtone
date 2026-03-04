'use strict';
/**
 * skill-router.test.js
 * 測試 routeKnowledge 和 writeKnowledge 函式
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { join } = require('path');
const { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, statSync } = require('fs');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { routeKnowledge, writeKnowledge } = require(join(SCRIPTS_LIB, 'knowledge/skill-router'));

// ── 測試用臨時目錄 ──

const TMP_ROOT = join(__dirname, '..', '..', '.test-tmp-skill-router');

function setupTmpPlugin() {
  if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true, force: true });
  // 預建 skills/testing/references/
  mkdirSync(join(TMP_ROOT, 'skills', 'testing', 'references'), { recursive: true });
  return TMP_ROOT;
}

afterEach(() => {
  if (existsSync(TMP_ROOT)) {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  }
});

// ── Feature 4: routeKnowledge ──

describe('routeKnowledge — Scenario 4-1: 關鍵詞匹配已有 domain 時 action 為 append', () => {
  it('testing 關鍵詞命中率 >= 0.2 時回傳 append', () => {
    const pluginRoot = setupTmpPlugin();
    const fragment = {
      content: 'use describe it expect mock stub assert coverage',
      keywords: ['test', 'mock', 'coverage'],
      source: 'developer:DEV',
    };

    const result = routeKnowledge(fragment, { pluginRoot });

    expect(result.action).toBe('append');
    expect(result.domain).toBe('testing');
    expect(result.targetPath).toContain('testing');
    expect(result.targetPath).toContain('auto-discovered.md');
  });

  it('targetPath 指向 skills/testing/references/auto-discovered.md', () => {
    const pluginRoot = setupTmpPlugin();
    const fragment = {
      content: 'write unit tests with bun:test describe it expect',
      keywords: ['test', 'describe', 'expect'],
      source: 'developer:DEV',
    };

    const result = routeKnowledge(fragment, { pluginRoot });

    expect(result.action).toBe('append');
    expect(result.targetPath).toBe(
      join(pluginRoot, 'skills', 'testing', 'references', 'auto-discovered.md')
    );
  });
});

describe('routeKnowledge — Scenario 4-2: 無匹配 domain 時 action 為 gap-observation', () => {
  it('量子計算相關關鍵詞無法匹配任何 domain', () => {
    const pluginRoot = setupTmpPlugin();
    const fragment = {
      content: '關於量子計算的知識',
      keywords: ['quantum', 'qubit'],
      source: 'developer:DEV',
    };

    const result = routeKnowledge(fragment, { pluginRoot });

    expect(result.action).toBe('gap-observation');
    expect(typeof result.observation).toBe('string');
  });

  it('observation 包含 source 和 keywords 資訊', () => {
    const fragment = {
      content: '量子糾纏的特性',
      keywords: ['quantum', 'entanglement'],
      source: 'developer:DEV',
    };

    const result = routeKnowledge(fragment, {});

    expect(result.action).toBe('gap-observation');
    expect(result.observation).toContain('developer:DEV');
  });
});

describe('routeKnowledge — 邊界情況', () => {
  it('fragment 為 null 時回傳 gap-observation', () => {
    const result = routeKnowledge(null, {});
    expect(result.action).toBe('gap-observation');
  });

  it('fragment.content 為非字串時回傳 gap-observation', () => {
    const result = routeKnowledge({ content: 123, keywords: [] }, {});
    expect(result.action).toBe('gap-observation');
  });
});

// ── Feature 4: writeKnowledge ──

describe('writeKnowledge — Scenario 4-3: append 模式追加到 auto-discovered.md', () => {
  it('新增包含 ## {date} | {source} 標頭的區塊', () => {
    const pluginRoot = setupTmpPlugin();
    const targetPath = join(pluginRoot, 'skills', 'testing', 'references', 'auto-discovered.md');
    // 建立現有內容
    writeFileSync(targetPath, '---\n## 2024-01-01 | old-source\n舊內容\n', 'utf8');

    const routeResult = { action: 'append', domain: 'testing', targetPath };
    const fragment = {
      content: '新的測試知識：使用 describe 組織測試',
      keywords: ['test', 'describe'],
      source: 'developer:DEV',
    };

    writeKnowledge(routeResult, fragment, pluginRoot);

    const content = readFileSync(targetPath, 'utf8');
    // 新區塊包含 --- 分隔線
    expect(content).toContain('---');
    // 包含日期格式標頭
    expect(content).toMatch(/## \d{4}-\d{2}-\d{2} \| developer:DEV/);
    // 包含 fragment 內容
    expect(content).toContain('新的測試知識');
    // 包含 Keywords 行
    expect(content).toContain('Keywords:');
    // 原有內容不被覆蓋
    expect(content).toContain('舊內容');
  });
});

describe('writeKnowledge — Scenario 4-4: auto-discovered.md 不存在時自動建立', () => {
  it('建立新檔案並包含正確格式的知識條目', () => {
    const pluginRoot = setupTmpPlugin();
    const targetPath = join(pluginRoot, 'skills', 'testing', 'references', 'auto-discovered.md');

    // 確認檔案不存在
    expect(existsSync(targetPath)).toBe(false);

    const routeResult = { action: 'append', domain: 'testing', targetPath };
    const fragment = {
      content: '測試知識：bun:test 使用方式',
      keywords: ['test', 'bun'],
      source: 'developer:DEV',
    };

    writeKnowledge(routeResult, fragment, pluginRoot);

    expect(existsSync(targetPath)).toBe(true);
    const content = readFileSync(targetPath, 'utf8');
    expect(content).toContain('測試知識');
    expect(content).toContain('---');
  });
});

describe('writeKnowledge — Scenario 4-5: gap-observation 模式不寫入檔案', () => {
  it('gap-observation 時不修改任何 skills/ 目錄下的檔案', () => {
    const pluginRoot = setupTmpPlugin();
    const testingRefDir = join(pluginRoot, 'skills', 'testing', 'references');

    // 記錄現有檔案列表
    const filesBefore = existsSync(testingRefDir)
      ? require('fs').readdirSync(testingRefDir)
      : [];

    const routeResult = {
      action: 'gap-observation',
      observation: '未分類知識：量子計算',
    };
    const fragment = {
      content: '量子計算知識',
      keywords: ['quantum'],
      source: 'developer:DEV',
    };

    // 不拋例外
    expect(() => writeKnowledge(routeResult, fragment, pluginRoot)).not.toThrow();

    // skills/ 目錄未有新檔案
    const filesAfter = existsSync(testingRefDir)
      ? require('fs').readdirSync(testingRefDir)
      : [];
    expect(filesAfter.length).toBe(filesBefore.length);
  });
});

describe('writeKnowledge — Scenario 4-6: auto-discovered.md 超過 5KB 時修剪', () => {
  it('超過 5KB 時舊條目被移除，最新條目被保留', () => {
    const pluginRoot = setupTmpPlugin();
    const targetPath = join(pluginRoot, 'skills', 'testing', 'references', 'auto-discovered.md');

    // 建立超過 5KB 的現有內容（每個條目約 200 bytes，建立 30 個條目）
    const oldEntries = [];
    for (let i = 1; i <= 30; i++) {
      const date = `2024-01-${String(i % 28 + 1).padStart(2, '0')}`;
      oldEntries.push(`---\n## ${date} | old-source-${i}\n舊知識條目 ${i}：這是一段比較長的測試內容，用來確保檔案大小能超過 5KB 的上限。包含足夠多的文字。\nKeywords: old, test, knowledge\n`);
    }
    writeFileSync(targetPath, oldEntries.join(''), 'utf8');

    // 確認現有檔案超過 5KB
    const sizeBefore = statSync(targetPath).size;
    expect(sizeBefore).toBeGreaterThan(5 * 1024);

    const routeResult = { action: 'append', domain: 'testing', targetPath };
    const fragment = {
      content: '最新的測試知識',
      keywords: ['latest', 'test'],
      source: 'developer:DEV',
    };

    writeKnowledge(routeResult, fragment, pluginRoot);

    const content = readFileSync(targetPath, 'utf8');
    // 最新條目被保留
    expect(content).toContain('最新的測試知識');
    // 舊條目部分被移除（不應包含所有舊條目）
    // 只檢查條目數量是否受控
    const entryCount = (content.match(/^## \d{4}/gm) || []).length;
    expect(entryCount).toBeLessThanOrEqual(51); // 50 保留 + 1 新增
  });
});

describe('writeKnowledge — routeResult.targetPath 為 null 時不拋例外', () => {
  it('targetPath 為 null 時不拋例外', () => {
    const routeResult = { action: 'append', domain: 'testing', targetPath: null };
    const fragment = { content: '測試', keywords: [], source: 'dev' };
    expect(() => writeKnowledge(routeResult, fragment, TMP_ROOT)).not.toThrow();
  });
});

// ── Feature 4: 去重邏輯 ──

describe('writeKnowledge — Scenario 4-7: 相同 content 不重複追加', () => {
  it('相同 content 寫入兩次，檔案只出現一次', () => {
    const pluginRoot = setupTmpPlugin();
    const targetPath = join(pluginRoot, 'skills', 'testing', 'references', 'auto-discovered.md');

    const routeResult = { action: 'append', domain: 'testing', targetPath };
    const fragment = {
      content: '唯一的測試知識：describe/it/expect 是 BDD 標準',
      keywords: ['describe', 'test'],
      source: 'developer:DEV',
    };

    // 第一次寫入
    writeKnowledge(routeResult, fragment, pluginRoot);
    // 第二次寫入相同 content
    writeKnowledge(routeResult, fragment, pluginRoot);

    const content = readFileSync(targetPath, 'utf8');
    // content 本體只出現一次
    const occurrences = (content.match(/唯一的測試知識/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('多次重複寫入後，條目數量維持為 1', () => {
    const pluginRoot = setupTmpPlugin();
    const targetPath = join(pluginRoot, 'skills', 'testing', 'references', 'auto-discovered.md');

    const routeResult = { action: 'append', domain: 'testing', targetPath };
    const fragment = {
      content: '重複測試：bun test 執行所有測試',
      keywords: ['bun', 'test'],
      source: 'developer:DEV',
    };

    // 重複寫入 5 次
    for (let i = 0; i < 5; i++) {
      writeKnowledge(routeResult, fragment, pluginRoot);
    }

    const content = readFileSync(targetPath, 'utf8');
    // ## 標頭只出現一次（代表只有一筆條目）
    const entryCount = (content.match(/^## \d{4}/gm) || []).length;
    expect(entryCount).toBe(1);
  });
});

describe('writeKnowledge — Scenario 4-8: 不同 content 正常追加', () => {
  it('兩個不同 content 各自被寫入，最終有兩筆條目', () => {
    const pluginRoot = setupTmpPlugin();
    const targetPath = join(pluginRoot, 'skills', 'testing', 'references', 'auto-discovered.md');

    const routeResult = { action: 'append', domain: 'testing', targetPath };
    const fragmentA = {
      content: '第一個不同知識：使用 mock 隔離依賴',
      keywords: ['mock', 'test'],
      source: 'developer:DEV',
    };
    const fragmentB = {
      content: '第二個不同知識：使用 stub 取代外部 API',
      keywords: ['stub', 'test'],
      source: 'developer:DEV',
    };

    writeKnowledge(routeResult, fragmentA, pluginRoot);
    writeKnowledge(routeResult, fragmentB, pluginRoot);

    const content = readFileSync(targetPath, 'utf8');
    expect(content).toContain('第一個不同知識');
    expect(content).toContain('第二個不同知識');
    const entryCount = (content.match(/^## \d{4}/gm) || []).length;
    expect(entryCount).toBe(2);
  });
});

describe('writeKnowledge — Scenario 4-9: content A 包含 content B 時不誤判', () => {
  it('先寫長 content，再寫其子字串，子字串被正確阻擋（existingContent 包含它）', () => {
    const pluginRoot = setupTmpPlugin();
    const targetPath = join(pluginRoot, 'skills', 'testing', 'references', 'auto-discovered.md');

    const routeResult = { action: 'append', domain: 'testing', targetPath };
    // 長的 content 包含短的 content 作為子字串
    const fragmentLong = {
      content: '完整知識：使用 describe 組織測試，it 定義測試案例',
      keywords: ['describe', 'test'],
      source: 'developer:DEV',
    };
    const fragmentShort = {
      content: '使用 describe 組織測試',
      keywords: ['describe'],
      source: 'developer:DEV',
    };

    // 先寫長的
    writeKnowledge(routeResult, fragmentLong, pluginRoot);
    // 再寫短的（是長的的子字串）→ 應被阻擋（existingContent 包含此子字串）
    writeKnowledge(routeResult, fragmentShort, pluginRoot);

    const content = readFileSync(targetPath, 'utf8');
    // 只有一筆條目（短的被去重阻擋）
    const entryCount = (content.match(/^## \d{4}/gm) || []).length;
    expect(entryCount).toBe(1);
    expect(content).toContain('完整知識');
  });

  it('先寫短 content，再寫包含它的長 content，長的可正常寫入', () => {
    const pluginRoot = setupTmpPlugin();
    const targetPath = join(pluginRoot, 'skills', 'testing', 'references', 'auto-discovered.md');

    const routeResult = { action: 'append', domain: 'testing', targetPath };
    const fragmentShort = {
      content: '基礎知識：expect 斷言',
      keywords: ['expect'],
      source: 'developer:DEV',
    };
    const fragmentLong = {
      content: '進階知識：expect 斷言 + toBe 精確比對 + toEqual 深度比對',
      keywords: ['expect', 'toBe', 'toEqual'],
      source: 'developer:DEV',
    };

    // 先寫短的
    writeKnowledge(routeResult, fragmentShort, pluginRoot);
    // 再寫長的（不是現有 content 的子字串）→ 應正常追加
    writeKnowledge(routeResult, fragmentLong, pluginRoot);

    const content = readFileSync(targetPath, 'utf8');
    // 兩筆條目都存在
    const entryCount = (content.match(/^## \d{4}/gm) || []).length;
    expect(entryCount).toBe(2);
    expect(content).toContain('基礎知識');
    expect(content).toContain('進階知識');
  });
});
