# Skill-Command 職責分離

## 問題

目前 `auto`、`dev`、`quick`、`standard` 等被做成 `user-invocable` skill，同時又有同名 command。
Claude Code 規則是 skill 同名優先於 command，導致 command 永遠不會被直接觸發，只被 skill 間接引用。

### 症狀

- 功能重疊：skill 和 command 都描述同一個 workflow 的 stage 順序
- 維護兩份：改了 command 的 stage，skill 描述可能沒同步
- Debug 困難：使用者打 `/dev`，實際走 skill 還是 command 取決於隱性優先規則
- 職責混淆：skill 本應是「知識」，卻變成了「入口」

### 根因

skill 和 command 的職責邊界未定義清楚。

## 目標狀態

| 元件 | 職責 | 可被呼叫？ |
|------|------|-----------|
| Command | 操作介面（使用者/agent 觸發入口） | ✅ `/xxx` |
| Skill | 純知識（agent 執行時的參考框架） | ❌ 僅透過 agent `skills[]` 注入 |
| Agent | 執行者（接受委派） | ✅ 被 Main Agent 委派 |

- Command ↔ Agent：大致一對一
- Skill → Agent：多對多

## 影響範圍

- 所有 `user-invocable: true` 的入口型 skill → 拆分：知識留 skill，入口邏輯合併進 command
- ✅ `on-submit-handler.js`：已改為指向 command（v0.28.90+ 由 on-submit 和 pre-edit-guard 注入）
- agent frontmatter 中的 `skills[]`：確認只引用知識型 skill
- 測試：hook-routing.test.js 等需同步更新

## 狀態

- **優先級**：中（目前能運作但職責混亂，隨元件增加會更難維護）
- **前置依賴**：無
