# Commit 好壞範例對比

## feat 類型

| 好例 | 壞例 |
|------|------|
| `feat(specs): 支援多 feature 並行追蹤，解決切換需先完成當前的限制` | `feat: update feature` |
| `feat(loop): 加入閒置超時自動暫停，防止 session 長時間空轉消耗資源` | `feat: add timeout` |
| `feat(dashboard): SSE 雙連線架構，支援全域監控 + 個別 session 視圖` | `feat: dashboard update` |

---

## fix 類型

| 好例 | 壞例 |
|------|------|
| `fix(state): featureName auto-sync 防止 undefined 寫入 workflow.json` | `fix: bug fix` |
| `fix(hooks): 修正 updatedInput 為 REPLACE 語意，保留 subagent_type 欄位` | `fix: hook issue` |
| `fix(timeline): 防止 SubagentStop 重複觸發造成 stage:complete 寫入兩次` | `fix: timeline bug` |

---

## chore 類型

| 好例 | 壞例 |
|------|------|
| `chore: bump-version 正規路徑，用 manage-component.js 取代 node -e 繞過 guard` | `chore: update version` |
| `chore: docs 歸檔清理，v0.x 設計文件移至 archive/，保持 docs/ 整潔` | `chore: cleanup` |
| `chore: 移除確認未使用的 grader.js [刪除未使用]` | `chore: remove file` |

---

## refactor 類型

| 好例 | 壞例 |
|------|------|
| `refactor(pre-task): skill context 注入邏輯集中到 hook-utils.js，可獨立測試` | `refactor: clean up` |
| `refactor(registry): 統一 agent/stage/event 映射到 Single Source of Truth` | `refactor: improve code` |

---

## test 類型

| 好例 | 壞例 |
|------|------|
| `test(knowledge-engine): 補充 buildSkillContext 邊界情境（null/undefined/非陣列）` | `test: add tests` |
| `test(guard): 新增 guard-coverage meta-guard，確保 6 守衛模組都有對應測試` | `test: more coverage` |

---

## 常見錯誤分析

### 錯誤 1：只說 what，不說 why

```
❌ feat(api): add getUser endpoint
✅ feat(api): 新增 getUser endpoint 支援前端 profile 頁面即時載入需求
```

### 錯誤 2：type 用錯

```
❌ fix: add validation（這是新增功能，不是修復）
✅ feat: 加入輸入驗證防止非法資料進入資料庫

❌ feat: change variable name（這是重構）
✅ refactor: 重命名 result → parseResult 使語意更清晰
```

### 錯誤 3：scope 太廣

```
❌ fix(app): 修復多個問題
✅ fix(state): 修正 updateWorkflowState 在並發寫入時的競態條件
```

### 錯誤 4：一個 commit 多件事

```
❌ feat: 新增功能 A + 修復 bug B + 重構 C
✅ 拆成三個 commit：
   feat: 新增功能 A
   fix: 修復 bug B
   refactor: 重構 C
```

---

## 快速格式檢查

```
格式：type(scope): 說明 why 而非 what

✅ 通過檢查：
   □ type 是有效的（feat/fix/chore/refactor/test/docs/style/perf）
   □ 說明解釋了「為什麼」或「解決了什麼問題」
   □ 不超過 72 個字元（第一行）
   □ 如有 breaking change，body 中標注 BREAKING CHANGE:

❌ 常見問題：
   □ 只說改了什麼（不說為什麼）
   □ 用詞模糊（update/change/misc）
   □ 一個 commit 混合多種 type
```
