# Gap Analyzer — 技術設計

## 深度路由：D2
**理由**：單一新增檔案 + 對應測試，無安全敏感操作（只讀 health-check 產出 + 純轉換），不需 reviewer。選 D2 而非 D1 是因為 Gap 物件是合約介面（gap-fixer 和 evolution.js 都依賴），需要 planner 先定義再實作。

---

## 技術摘要

- **方案**：確定性映射表 + 純函式轉換，零 AI 依賴
- **理由**：Finding → Gap 的映射是確定性的（同一 type 永遠產出同一 category），不需要語意判斷
- **取捨**：repairHint 為硬編碼文字而非動態生成——簡化實作且確保一致性，犧牲上下文感知的修復建議（由 gap-fixer 用 AI 補充）

## 方案比較

| 維度 | A：確定性映射表（選擇） | B：本地模型語意分類 |
|------|:-------------------:|:-----------------:|
| 一致性 | 高（同一 input 永遠同一 output） | 低（模型輸出有隨機性） |
| 延遲 | < 1ms（查表） | 300ms+（模型推論） |
| 可測試性 | 高（純函式斷言） | 低（需 mock 模型） |
| 靈活度 | 低（新 type 需手動加映射） | 高（自動分類） |
| 離線可用 | 是 | 否（需本地模型啟動） |
| **結論** | 選擇：確定性邏輯不需 AI | 過度工程——16 個 type 用查表足矣 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 | 消費者 |
|---|------|------|------|------|--------|
| 1 | gap-analyzer.js | `~/.claude/scripts/` | ~300 | Finding → Gap 轉換 + CLI | gap-fixer.js, evolution.js, evolve skill |
| 2 | gap-analyzer.test.js | `~/projects/nova-brain/tests/unit/` | ~200 | 單元測試 | bun test |

### 修改檔案

無。gap-analyzer 是獨立新增模組，不修改現有檔案。

### API 設計

```javascript
// ─── 常數 ─────────────────────────────────────────────────────────────────

/**
 * Finding type → Gap 映射表
 * 每個 entry: { category, repairHint, impactFactor }
 * impactFactor: 0.0-1.0，用於 priority 計算的 impact 加成
 */
const GAP_MAP = {
  // closedLoop
  'missing-skillmd':      { category: 'structure',     repairHint: '建立 SKILL.md（frontmatter + 消費者 + 資源索引）', impactFactor: 0.9 },
  'orphan-skill':         { category: 'dependency',    repairHint: '在對應 agent frontmatter 的 skills[] 加入引用', impactFactor: 0.5 },
  'name-mismatch':        { category: 'consistency',   repairHint: '統一目錄名與 frontmatter name 欄位', impactFactor: 0.3 },
  'unindexed-reference':  { category: 'documentation', repairHint: '在 SKILL.md 的資源索引表中加入該檔案連結', impactFactor: 0.2 },
  'broken-reference':     { category: 'integrity',     repairHint: '建立缺失的 reference 檔案，或移除 SKILL.md 中的失效索引', impactFactor: 0.8 },
  'parse-error':          { category: 'integrity',     repairHint: '修正 SKILL.md frontmatter YAML 語法', impactFactor: 0.7 },

  // skillCoverage
  'orphan-script':        { category: 'dependency',    repairHint: '在對應 skill 的 SKILL.md 中引用該腳本', impactFactor: 0.3 },
  'empty-references':     { category: 'coverage',      repairHint: '為 skill 建立 references 目錄並加入至少一份深度參考', impactFactor: 0.4 },

  // hookIntegrity
  'broken-hook-command':  { category: 'integrity',     repairHint: '修正 settings.json 中的 hook command 路徑', impactFactor: 1.0 },
  'broken-fallback':      { category: 'integrity',     repairHint: '修正 FALLBACK_MODULES 中的模組路徑', impactFactor: 0.9 },
  'handler-mismatch':     { category: 'consistency',   repairHint: '同步 FALLBACK_MODULES 的 fn 欄位與模組實際 export', impactFactor: 0.6 },

  // agentAlignment
  'missing-skill-dir':    { category: 'structure',     repairHint: '建立缺失的 skill 目錄', impactFactor: 0.9 },
  'missing-skill-definition': { category: 'structure', repairHint: '為已存在的 skill 目錄建立 SKILL.md', impactFactor: 0.9 },
  'no-skills-defined':    { category: 'coverage',      repairHint: '在 agent frontmatter 加入 skills 欄位', impactFactor: 0.4 },
  'shared-skill':         { category: 'info',          repairHint: '資訊性：確認共用是有意設計而非意外重複', impactFactor: 0.0 },

  // system
  'check-error':          { category: 'system',        repairHint: '檢查 check 函式本身的錯誤並修復', impactFactor: 1.0 },
};

const FALLBACK_GAP = { category: 'unknown', repairHint: '手動檢查 — 未知的 finding type', impactFactor: 0.5 };

// ─── 純函式 ───────────────────────────────────────────────────────────────

/**
 * 計算優先級分數
 * @param {'critical'|'warning'|'info'} severity
 * @param {number} impactFactor - 0.0-1.0
 * @returns {number} 0-100
 *
 * 公式：severityWeight * 60 + impactFactor * 40
 *   critical = 1.0, warning = 0.6, info = 0.2
 */
function calculatePriority(severity, impactFactor) {
  const weights = { critical: 1.0, warning: 0.6, info: 0.2 };
  const w = weights[severity] ?? 0.2;
  return Math.round(w * 60 + impactFactor * 40);
}

/**
 * 單一 Finding → Gap 轉換（純函式）
 * @param {Finding} finding
 * @returns {Gap}
 */
function findingToGap(finding) {
  const mapping = GAP_MAP[finding.type] || FALLBACK_GAP;
  const priority = calculatePriority(finding.severity, mapping.impactFactor);

  // id: 用 check:type:element 組合，element 做簡單 hash 避免特殊字元
  const elementHash = finding.element.replace(/[^a-zA-Z0-9\-_\/]/g, '_');
  const id = `${finding.check}:${finding.type}:${elementHash}`;

  return {
    id,
    category: mapping.category,
    severity: finding.severity,
    priority,
    repairHint: mapping.repairHint,
    source: finding,
    context: {
      element: finding.element,
      check: finding.check,
      type: finding.type,
      files: extractFiles(finding),
    },
  };
}

/**
 * 從 Finding 提取相關檔案路徑
 * 解析 element 和 description 中的路徑資訊
 */
function extractFiles(finding) {
  const files = [];
  // element 通常是 'skills/name' 或 'hooks.EventType[Matcher]'
  if (finding.element.startsWith('skills/')) {
    files.push(`~/.claude/${finding.element}`);
  } else if (finding.element.startsWith('agents/')) {
    files.push(`~/.claude/${finding.element}.md`);
  } else if (finding.element.startsWith('scripts/')) {
    files.push(`~/.claude/${finding.element}`);
  }
  return files;
}

// ─── 主函式 ───────────────────────────────────────────────────────────────

/**
 * 完整分析：health-check → Gap 轉換 → GapReport
 * @param {{ checks?: string[] }} options
 * @returns {Promise<GapReport>}
 */
async function analyzeGaps(options = {}) {
  const start = performance.now();
  let report;
  try {
    const { runAll } = await import('./health-check.js');
    report = await runAll(options.checks ? { checks: options.checks } : {});
  } catch (err) {
    return {
      gaps: [],
      stats: { total: 0, byCategory: {}, bySeverity: {} },
      metadata: { timestamp: new Date().toISOString(), version: '1.0.0', duration: 0 },
      error: err.message,
    };
  }

  const gaps = report.findings
    .map(findingToGap)
    .sort((a, b) => b.priority - a.priority);

  // 統計
  const byCategory = {};
  const bySeverity = {};
  for (const gap of gaps) {
    byCategory[gap.category] = (byCategory[gap.category] || 0) + 1;
    bySeverity[gap.severity] = (bySeverity[gap.severity] || 0) + 1;
  }

  const duration = Math.round(performance.now() - start);

  return {
    gaps,
    stats: { total: gaps.length, byCategory, bySeverity },
    metadata: {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      healthCheckVersion: report.metadata.version,
      duration,
    },
  };
}
```

### CLI 設計

```
argv 解析：
  --summary        → stderr 人可讀摘要，stdout 不輸出 JSON
  --category=X     → 過濾特定 category
  --all            → 包含 info severity（預設排除）
  --checks X Y     → 透傳給 health-check

stdout：GapReport JSON（預設）
stderr：人可讀摘要（--summary 時）
exit code：0（分析完成就是成功，無論結果）
```

## 資料模型

- 儲存格式：不持久化（純轉換層）
- 儲存位置：N/A
- 清理策略：N/A

## Gap Category 語意定義

| category | 語意 | 修復難度 |
|----------|------|:--------:|
| structure | 缺少必要的結構性檔案（SKILL.md、目錄） | 中 |
| integrity | 現有引用/指向已失效 | 高 |
| dependency | 元件間的引用關係缺失 | 低 |
| consistency | 命名或定義不一致 | 低 |
| documentation | 文件索引不完整 | 低 |
| coverage | 知識覆蓋不足 | 中 |
| info | 資訊性通知，不需修復 | N/A |
| system | 系統層級錯誤 | 高 |
| unknown | 未知的 finding type（fallback） | 未知 |

## 優先級公式

```
priority = severityWeight * 60 + impactFactor * 40

severityWeight:
  critical = 1.0  → 基礎 60 分
  warning  = 0.6  → 基礎 36 分
  info     = 0.2  → 基礎 12 分

impactFactor: 0.0 - 1.0（每個 finding.type 在 GAP_MAP 中定義）
  1.0 = 影響系統運作（broken-hook-command）
  0.5 = 影響品質但不影響運作（orphan-skill）
  0.0 = 純資訊（shared-skill）

範例:
  critical + broken-hook-command(1.0) = 60 + 40 = 100
  critical + missing-skillmd(0.9)     = 60 + 36 = 96
  warning  + orphan-skill(0.5)        = 36 + 20 = 56
  info     + shared-skill(0.0)        = 12 + 0  = 12
```

## 執行步驟

### Phase 1：核心實作（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | gap-analyzer.js | GAP_MAP 映射表 + FALLBACK_GAP + extractFiles |
| 1b | gap-analyzer.js | calculatePriority + findingToGap 純函式 |
| 1c | gap-analyzer.js | analyzeGaps 主函式（import health-check + 轉換 + 統計） |
| 1d | gap-analyzer.js | CLI 入口（argv 解析 + --summary + --category + --all + --checks） |

### Phase 2：測試（sequential，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2a | gap-analyzer.test.js | GAP_MAP 完整性測試（16 個 type 全覆蓋） |
| 2b | gap-analyzer.test.js | findingToGap 純函式測試（正常 + fallback + 邊界） |
| 2c | gap-analyzer.test.js | calculatePriority 公式測試（各 severity + impactFactor 組合） |
| 2d | gap-analyzer.test.js | analyzeGaps 整合測試（mock health-check） |
| 2e | gap-analyzer.test.js | CLI 輸出格式測試 |

## Pre-mortem

**假設 gap-analyzer 上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | health-check 新增 finding.type 但 GAP_MAP 未同步更新 | 高 | 低 | FALLBACK_GAP 兜底 + 測試斷言 GAP_MAP 覆蓋所有已知 type |
| 2 | Gap 物件結構變更破壞 gap-fixer | 低 | 高 | version 欄位 + Gap 結構作為合約介面文件化 |
| 3 | priority 公式不符實際修復優先序 | 中 | 低 | calculatePriority 為獨立純函式，可迭代調整不影響其他邏輯 |
| 4 | import health-check.js 路徑在不同環境失敗 | 低 | 中 | 使用相對路徑 import（同目錄 `./health-check.js`） |

**Pre-mortem 觸發重新設計的條件**：風險 #1（高機率）已有 FALLBACK_GAP 兜底，影響低，不觸發重新設計。無「高機率 + 高影響」的風險。

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| gap-analyzer.test.js | GAP_MAP 覆蓋 health-check 所有 16 個已知 finding.type |
| gap-analyzer.test.js | findingToGap 對每個 type 產出正確的 category + repairHint |
| gap-analyzer.test.js | findingToGap 對未知 type 使用 FALLBACK_GAP |
| gap-analyzer.test.js | calculatePriority(critical, 1.0) = 100 |
| gap-analyzer.test.js | calculatePriority(info, 0.0) = 12 |
| gap-analyzer.test.js | analyzeGaps 結果按 priority 降序排列 |
| gap-analyzer.test.js | analyzeGaps 在 health-check 失敗時回傳含 error 的 GapReport |
| gap-analyzer.test.js | CLI stdout 輸出合法 JSON |

## 不做什麼

1. **不做修復**：gap-analyzer 只分析和分類，修復邏輯是 gap-fixer.js 的職責
2. **不做 AI 語意分析**：16 個 finding.type 用確定性映射表足夠，不需要語意分類
3. **不做歷史趨勢**：不持久化 Gap 歷史——未來由 evolution.js 統一管理趨勢
4. **不做 health-check 擴展**：不新增 check 類型——health-check 的擴展是獨立任務
