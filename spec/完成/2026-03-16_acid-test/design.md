# Acid Test — 技術設計

## 深度路由：D2
**理由**：單一測試腳本，邏輯清晰（6 phase 線性流程），無跨模組修改，只需規劃-執行。

---

## 技術摘要

- **方案**：獨立 CLI 腳本，import Skill Lifecycle 模組進行端到端驗證
- **理由**：不依賴 SessionEnd 觸發，開發者可手動執行，快速驗證
- **取捨**：不模擬真實的 SessionEnd 流程，而是直接呼叫 API（測試的是模組正確性，不是觸發鏈）

## 方案比較

| 維度 | A：獨立 CLI 腳本（選擇） | B：bun test 整合測試 |
|------|:----------------------:|:------------------:|
| 執行便利性 | 高（一行指令） | 中（混在 test suite 中）|
| 隔離性 | 高（獨立檔案路徑） | 中（需要 mock） |
| 真實度 | 高（呼叫真實 API） | 低（mock 本地模型） |
| CI 適用 | 中（需本地模型） | 高（可全 mock） |
| **結論** | 選擇：L2 驗收需要真實度 | 留給單元測試 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | acid-test.js | `~/.claude/scripts/` | ~180 | 端到端驗收腳本（6 phase） |

### 修改檔案

無。Acid Test 是獨立的驗證腳本，不修改任何現有檔案。

### API 設計

```javascript
// acid-test.js
const TEST_PREFIX = 'acid-test-';

async function runAcidTest(opts = {}) {
  const report = { result: 'pass', phases: [], duration: 0 };
  const start = Date.now();

  // Phase 1: 環境準備
  // - 建立 /tmp/acid-test/ 工作目錄
  // - 寫入假的 behaviors.jsonl（高信心 skill 候選）

  // Phase 2: 觸發 Lifecycle
  // - import { checkLifecycle } from lifecycle-orchestrator.js
  // - 呼叫 checkLifecycle({ behaviorsFile: testBehaviorsFile })

  // Phase 3: 驗證 Forge
  // - 檢查 ~/.claude/skills/{TEST_PREFIX}*/ 存在
  // - 驗證 SKILL.md 有 frontmatter

  // Phase 4: 驗證 Judge
  // - 讀取 lifecycle.jsonl 找 action === 'judge' 的條目
  // - 確認有評分記錄

  // Phase 5: 驗證 Deploy
  // - 如果品質通過，確認 agent skills[] 包含新 Skill
  // - 如果品質不過，確認標記為 draft

  // Phase 6: 清理
  // - 刪除 acid-test-* skills
  // - 恢復 agent skills[]
  // - 刪除測試 behaviors 和 lifecycle 條目

  report.duration = (Date.now() - start) / 1000;
  return report;
}
```

## 資料模型

- 測試 behaviors 檔案：`/tmp/acid-test/behaviors.jsonl`
- 測試報告：`/tmp/acid-test-report.json`
- 清理策略：Phase 6 刪除所有 `acid-test-*` 前綴的產物

## 執行步驟

### Phase 1：實作（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1 | acid-test.js | 實作 6 phase 端到端測試腳本 |

Phase 1 只有一步，因為 acid-test.js 是獨立腳本，依賴 Skill Lifecycle 已完成。

## Pre-mortem

**假設 Acid Test 上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | 清理不完整，acid-test-* Skill 殘留 | 中 | 中 | Phase 6 用 glob 刪除所有 acid-test-* |
| 2 | 本地模型回應格式不穩定，導致 Forge 失敗 | 中 | 低 | 降級模式：跳過需要本地模型的 phase |
| 3 | Skill Lifecycle 模組 API 變更導致 import 失敗 | 低 | 高 | acid-test.js 在 import 階段做 try-catch |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| acid-test.test.js | mock 模式下 6 phase 全通過 |
| acid-test.test.js | 清理後無殘留產物 |
| acid-test.test.js | 降級模式正確運作 |

## 不做什麼

1. **不模擬 SessionEnd**：直接呼叫 API，不走 hook 觸發鏈
2. **不做效能基準**：Acid Test 驗證正確性，不測速度
