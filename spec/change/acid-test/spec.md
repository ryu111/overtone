# Acid Test（R2.6 — L2 驗收）

## 動機（Why）

- **問題**：L2 自我進化模組（Skill Lifecycle）建好後，缺乏端到端驗證——無法證明系統真的能從高層目標出發、自主完成全流程
- **目標**：可重複執行的端到端測試腳本，驗證「給目標 → PM → Forge → 開發 → 完成 → 品質驗證」全流程自主
- **不做的代價**：L2 完成標準無法驗收，無法推進 L3，Skill Lifecycle 可能有隱藏的整合問題

## 範圍

### In-scope

- acid-test.js：可重複執行的端到端測試腳本
- 測試場景：「建立一個 hello-world CLI skill」（最小可驗證場景）
- 驗證 Skill Lifecycle 端到端：Learner 觀察 → Forge → Judge → Deploy
- 驗證深度路由 D2/D3 在自主模式下的運作
- 測試報告輸出（JSON 格式 + 人類可讀摘要）

### Out-of-scope

- 複雜的多步驟專案（Acid Test v2 範疇）
- 跨 session 驗證（需要心跳引擎，是 L3 能力）
- 效能基準測試
- UI / 視覺驗證

## 使用者故事

身為開發者，我想要執行 `bun ~/.claude/scripts/acid-test.js` 就能驗證 L2 自我進化的端到端能力，以便確認系統在自主模式下運作正常。

身為 Nova 系統，我想要 Acid Test 通過代表 L2 完成標準達標，以便可以安全推進 L3。

## 行為規格

### 正常路徑

1. 執行 `bun acid-test.js`
2. Phase 1 — 環境準備：建立臨時工作目錄、注入假的 behaviors.jsonl 測試資料
3. Phase 2 — 觸發 Lifecycle：呼叫 checkLifecycle() 處理注入的高信心行為
4. Phase 3 — 驗證 Forge：確認 ~/.claude/skills/{test-skill}/ 存在且 SKILL.md 結構正確
5. Phase 4 — 驗證 Judge：確認評分記錄存在且達到 B 級
6. Phase 5 — 驗證 Deploy：確認目標 agent 的 skills[] 包含新 Skill
7. Phase 6 — 清理：移除測試建立的 Skill 和 behaviors 條目
8. 輸出測試報告（pass/fail + 每個 phase 的結果）

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| Skill Lifecycle 未安裝 | Phase 2 報錯 + 跳到清理 |
| 本地模型不可用 | 測試降級模式（只驗確定性部分） |
| Forge 建立失敗 | Phase 3 fail + 跳到清理 |
| Judge 評分低於 B 級 | 記錄但不視為 test failure（品質閘門本身工作正常） |
| 清理失敗 | log 警告，不影響測試結果 |

### 邊界條件

- 重複執行：冪等，每次從乾淨狀態開始
- 本地模型不可用：降級驗證確定性部分
- 測試 Skill 已存在：先清理再建立

## 資料模型

### 輸入

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| --scenario | string | 否 | 測試場景名稱（預設 'hello-world'） |
| --keep | boolean | 否 | 不清理測試產出（debug 用） |

### 輸出

| 欄位 | 型別 | 說明 |
|------|------|------|
| result | 'pass' / 'fail' | 整體結果 |
| phases | object[] | 每個 phase 的 { name, status, duration, detail } |
| duration | number | 總耗時（秒） |

### 儲存

- 測試報告：`/tmp/acid-test-report.json`
- 人類可讀摘要：stdout

## 介面契約

```javascript
// acid-test.js（CLI 腳本）
// 用法：bun acid-test.js [--scenario name] [--keep]
// 退出碼：0 = pass, 1 = fail

// 內部 API
export async function runAcidTest(opts) → AcidTestReport
export function injectTestBehavior(behaviorId, pattern) → void
export function cleanupTestArtifacts(skillName) → void
```

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | 完整測試 < 10 分鐘（含本地模型推理） |
| 冪等性 | 重複執行結果一致 |
| 隔離性 | 不影響正式的 behaviors.jsonl 和 skills/ |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | skill-forge.js | Forge 引擎 |
| 上游 | lifecycle-orchestrator.js | 生命週期串聯 |
| 上游 | judge.js | 品質評分 |
| 上游 | learner.js | behaviors.jsonl 格式 |
| 上游 | 本地模型（port 8000） | Skill 內容生成 |
| 下游 | 無 | 驗證用，不被其他模組依賴 |

## 驗收標準

- [ ] `bun acid-test.js` 執行完畢，exit code 0 表示通過
- [ ] 測試報告包含所有 6 個 phase 的結果
- [ ] 本地模型不可用時降級執行不 crash
- [ ] 清理完成後，skills/ 和 agents/ 恢復原狀
- [ ] 測試可重複執行（冪等）

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| 清理不完整留下垃圾 Skill | 低 | 中 | 使用 `acid-test-` prefix，清理時 glob 刪除 |
| 本地模型推理過慢導致 timeout | 中 | 低 | 10 分鐘總 timeout + phase 級別 timeout |
| 測試修改了正式 behaviors.jsonl | 低 | 高 | 使用獨立的測試檔案路徑，不動正式資料 |
