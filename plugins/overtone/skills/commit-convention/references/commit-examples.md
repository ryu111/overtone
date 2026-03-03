# Overtone Commit 實際範例

## feat（新功能）

### 好例

```
feat(specs): 支援多 feature 並行追蹤

在 specs 系統加入 paused 狀態，讓使用者可以暫停目前 feature
切換到另一個 feature，之後再恢復。解決了「切換 feature 需要
先完成當前」的限制。
```

```
feat(knowledge-engine): 自主知識引擎 — skill context 注入 + gap detection

建立三層知識系統：
- buildSkillContext：從 agent frontmatter 載入對應 SKILL.md
- detectKnowledgeGaps：靜態關鍵詞表觸發知識缺口警告
- searchKnowledge：三源搜尋（skill refs + instinct + codebase）

讓 agent 在執行前即具備 domain 知識，減少知識型錯誤。
```

### 壞例

```
feat: update code          ← 沒說做了什麼
feat: 新增功能              ← 完全沒資訊
feat(api): add endpoint    ← 沒說 why，只說 what
```

---

## fix（Bug 修復）

### 好例

```
fix(loop): 修正 SubagentStop 重複觸發問題

當 Loop 在同一個 session 內連續觸發時，SubagentStop 事件會被
觸發兩次，導致 timeline 記錄重複。根因是 state.isRunning flag
在第一次完成後未清除。改為在 stop 時明確重置 flag。
```

```
fix(specs): featureName auto-sync 防止 undefined 寫入

getActiveFeature() 在無活躍 feature 時回傳 null，但 SubagentStop
hook 直接將結果寫入 state 而未做 null check，導致
workflow.json 寫入 "featureName": undefined。
加入 null guard 後只在確實有 feature 時才更新。
```

### 壞例

```
fix: bug fix               ← 什麼 bug？
fix: 修復 crash            ← 何時 crash？為什麼？
fix: handle null           ← 在哪裡？為什麼 null 是問題？
```

---

## chore（維護工作）

### 好例

```
chore: docs 歸檔清理 + testing-guide 更新（v1.1）

- 將過時的 v0.x 設計文件移至 docs/archive/
- 更新 testing-guide 反映最新的 test-index.js 整合
- 移除 docs/ 中不再準確的 TODO 項目
```

```
chore: bump-version 正規路徑（v0.28.17）

之前用 node -e 繞過 guard 更新版本，改為使用正規的
bun manage-component.js bump-version 指令，確保版本更新
經過 validation 且保持 Single Source of Truth。
```

### 壞例

```
chore: misc changes        ← 什麼改動？
chore: cleanup             ← 清理了什麼？
chore: update              ← 更新了什麼？
```

---

## refactor（重構）

### 好例

```
refactor(pre-task): 統一 skill context 注入邏輯

原本 buildSkillContext 散落在 hook 多處，維護困難。
將所有 skill 注入邏輯集中到 hook-utils.js，讓 PreToolUse
hook 只負責組裝 prompt，知識注入邏輯可獨立測試。

不影響外部行為，測試全部通過。
```

### 壞例

```
refactor: clean up code    ← 清理了什麼？
refactor: improve structure ← 如何改善？
refactor: reorganize       ← 重組了什麼？為什麼？
```

---

## test（測試）

### 好例

```
test(knowledge-engine): 補充 buildSkillContext 邊界測試

原本缺少 agent .md 不存在、skills 欄位非陣列等邊界情境，
導致測試覆蓋不完整。補充 8 個 scenario 確保 graceful degradation
（不存在的情況返回 null 而非拋出）。
```

### 壞例

```
test: add tests            ← 加了什麼測試？
test: improve coverage     ← 覆蓋了什麼？
```

---

## 刪除未使用的程式碼

```
chore: 移除未使用的 grader.js [刪除未使用]

grader.js 的邏輯已整合到 registry.js，原始檔案無任何 require 依賴。
確認全域搜尋無引用後刪除，並更新相關測試移除 mock。

[刪除未使用] 標記便於 git log 追蹤清理記錄。
```

---

## Commit 拆分判斷

```
一個 commit 一件事。若有以下情況要拆分：

需要拆分：
  - 同時有功能新增 + bug 修復
  - 同時有重構 + 新功能
  - 多個不相關的 bug 修復

不需要拆分：
  - 新功能 + 對應測試（同一件事）
  - Bug 修復 + 更新 changelog（附帶）
  - 重構 + 修復因重構引入的問題（連帶）
```
