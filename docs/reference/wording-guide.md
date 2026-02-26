# 措詞正確性指南

> 對應規則來源：`~/.claude/CLAUDE.md`「指令強度用詞」章節

本文件說明 Overtone agent prompt、Skill 文件和 CLAUDE.md 規則中，
emoji 符號與強度關鍵字的正確搭配方式。
錯誤的搭配（如 `💡 MUST`、`📋 consider`）會造成指令強度混淆，
導致 agent 誤判規則的約束力。

---

## 一、強度層級對照表

| 層級 | 符號 | 允許關鍵字 | 場景 | 典型範例 |
|:----:|:----:|------------|------|----------|
| ⛔ 硬阻擋 | `⛔` | `NEVER`、`MUST NOT`、`不可`、`禁止` | 安全紅線（搭配 Hook 程式碼強制） | `⛔ NEVER hardcode API keys` |
| 📋 強規則 | `📋` | `MUST`、`ALWAYS`、`必須` | 核心流程、不可違反的規則 | `📋 MUST 先執行測試再 merge` |
| 💡 軟引導 | `💡` | `should`、`prefer`、`建議`、`優先` | 最佳實踐、有彈性空間 | `💡 should 使用 TypeScript strict mode` |
| 🔧 建議 | `🔧` | `consider`、`may`、`could`、`可考慮` | 可選優化、情境依賴 | `🔧 consider 提取共用 utility` |

---

## 二、決策樹

選擇 emoji 層級前，依序回答以下問題：

```
❓ 這個行為，有 Hook 程式碼強制執行嗎？
   → 是 → ⛔ NEVER / MUST NOT
   → 否 ↓

❓ 違反後會造成安全或資料損失風險？
   → 是 → ⛔ NEVER / MUST NOT
   → 否 ↓

❓ 這是流程的必要步驟，沒有彈性空間？
   → 是 → 📋 MUST / ALWAYS
   → 否 ↓

❓ 這是最佳實踐，但可根據情境調整？
   → 是 → 💡 should / prefer
   → 否 → 🔧 consider / may
```

**判斷小技巧**：

- 如果 agent 在某些情境下 **可以不做**，就不是 `MUST`（改用 `should`）
- 如果違反會造成 **功能損壞或安全問題**，就不是 `should`（改用 `MUST` 或 `⛔`）
- 如果你猶豫在 `📋` 和 `💡` 之間，問自己：「若 agent 跳過這步，會怎樣？」
  - 程式碼壞掉 / 流程出錯 → `📋 MUST`
  - 只是稍微不夠好 → `💡 should`

---

## 三、正確搭配範例

### ⛔ 硬阻擋（安全紅線）

場景：硬編碼 secrets 是絕對禁止事項，有 Hook 強制攔截。

```
⛔ NEVER hardcode API keys、passwords 或 secrets
⛔ MUST NOT 在程式碼中直接寫入憑證
⛔ 不可修改任何程式碼（你是唯讀的）
```

### 📋 強規則（核心流程）

場景：這些是工作流的必要步驟，跳過會導致流程不完整。

```
📋 MUST 先讀取 Handoff 檔案再開始實作
📋 ALWAYS 在 Handoff 最後輸出交接文件
📋 完成後 MUST 執行 bun test 確認無 regression
```

### 💡 軟引導（最佳實踐）

場景：有彈性空間，在標準情境下應遵循，但特殊情境可調整。

```
💡 should 優先使用專案已有的 utilities
💡 prefer 使用 TypeScript strict mode
💡 建議在複雜決策前先查詢相關 Handoff 歷史
```

### 🔧 建議（可選優化）

場景：在有餘裕時可以做，但不影響核心功能。

```
🔧 consider 提取重複邏輯為共用 utility
🔧 may 增加額外的 debug log
🔧 可考慮優化效能熱點
```

---

## 四、常見錯誤（反模式）

以下列出在 Overtone 文件中常見的錯誤搭配，及正確的修正方式。

### 反模式 1：💡 搭配強制關鍵字

```
❌ 💡 MUST 先執行測試
✅ 📋 MUST 先執行測試（這是必要流程步驟）
   或
✅ 💡 should 先執行測試（若確實有彈性空間）
```

**原因**：`💡` 表示「可調整的最佳實踐」，搭配 `MUST` 傳達了矛盾訊號。
agent 會困惑：這究竟是「強制的」還是「建議的」？

### 反模式 2：📋 搭配建議關鍵字

```
❌ 📋 consider 使用更好的命名
✅ 🔧 consider 使用更好的命名（這是可選優化）
   或
✅ 📋 MUST 使用語義化命名（若這是強制規範）
```

**原因**：`📋` 表示「強規則」，搭配 `consider` 語氣過弱，無法傳達規則的強制性。

### 反模式 3：⛔ 搭配軟語氣關鍵字

```
❌ ⛔ should 避免 hardcoding secrets
✅ 💡 should 避免 hardcoding secrets（若這只是建議）
   或
✅ ⛔ NEVER hardcode secrets（若這是安全紅線）
```

**原因**：`⛔` 是最高強度符號，搭配 `should` 大幅削弱了其嚴肅性，
可能導致 agent 認為這只是建議而忽略。

### 反模式 4：⛔ 搭配非禁止性陳述

```
❌ ⛔ 不可過度設計
✅ 📋 MUST NOT 過度設計（若確實是強制規則）
   或
✅ 避免過度設計（移除標記，改用純陳述）
```

**原因**：`⛔` 應對應安全紅線等級，「不可過度設計」屬於軟性原則，
不應使用最高強度標記。

### 反模式 5：💡 搭配安全限制

```
❌ 💡 只能讀取，不可寫入任何檔案
✅ ⛔ 不可寫入任何檔案（若為安全紅線）
```

**原因**：「只能讀取」是安全邊界，不是「建議」。`💡` 的語氣過弱，
可能讓 agent 認為「在某些情況下」可以寫入。

### 反模式 6：📋 搭配可選動詞

```
❌ 📋 可考慮優化效能
✅ 🔧 consider 優化效能（這明確是可選的）
```

**原因**：「可考慮」本身就表示可選，與 `📋`（強規則）的語意衝突。

### 反模式 7：💡 搭配 ALWAYS

```
❌ 💡 ALWAYS 在函式開頭寫 JSDoc
✅ 📋 ALWAYS 在公開 API 加 JSDoc（若為強制）
   或
✅ 💡 should 為公開函式撰寫 JSDoc（若有彈性）
```

**原因**：`ALWAYS` 表示「無一例外」，與 `💡`（軟引導、可調整）矛盾。

---

## 五、PostToolUse Hook 自動偵測規則

`PostToolUse` hook 在每次 Edit/Write 工具操作 `.md` 檔案後自動執行偵測。
Hook 掃描完整檔案內容（上限 1000 行），偵測三種 emoji-關鍵詞不匹配的 pattern。

**偵測範圍**：僅限 `.md` 檔案。`.js`、`.ts`、`.json` 等非 Markdown 檔案不觸發偵測。

**排除規則**：Markdown 表格行（以 `|` 開頭）不觸發警告，避免說明文件中的對照表產生誤報。

### Pattern 1：💡 搭配強制關鍵字

```
regex: /💡\s*(MUST|ALWAYS|NEVER|MUST\s*NOT)\b/
```

觸發條件：在 `.md` 檔案的同一行中，`💡` 之後緊接 `MUST`、`ALWAYS`、`NEVER` 或 `MUST NOT`。

範例觸發行：
- `💡 MUST validate all inputs before processing`
- `💡 ALWAYS run tests before committing`
- `💡 NEVER skip error handling`

### Pattern 2：📋 搭配建議關鍵字

```
regex: /📋\s*(consider|may\s|could\s)/i
```

觸發條件：在 `.md` 檔案的同一行中，`📋` 之後緊接 `consider`、`may` 或 `could`（不區分大小寫）。

範例觸發行：
- `📋 consider adding more tests`
- `📋 may use caching for performance`
- `📋 could be improved by refactoring`

### Pattern 3：⛔ 搭配軟語氣關鍵字

```
regex: /⛔\s*(should|consider|may\s|prefer|could\s)/i
```

觸發條件：在 `.md` 檔案的同一行中，`⛔` 之後緊接 `should`、`consider`、`may`、`prefer` 或 `could`（不區分大小寫）。

範例觸發行：
- `⛔ should avoid committing secrets`
- `⛔ prefer typed parameters over any`
- `⛔ may skip validation in some cases`

---

## 六、場景-措詞對應範例庫

以下列出 Overtone 中常見場景的標準措詞範例，可直接作為撰寫 agent prompt 的參考。

### Agent 邊界（DON'T 區塊）

```
⛔ 不可修改任何程式碼（你是唯讀的）
⛔ NEVER 刪除或修改已有的測試（除非 Handoff 明確要求）
⛔ MUST NOT 硬編碼 secrets、API keys、密碼
```

### Agent 職責（DO 區塊）

```
📋 MUST 閱讀完整的 Handoff 檔案再開始寫碼
📋 ALWAYS 在回覆最後輸出 Handoff 交接文件
📋 確保程式碼可編譯（npm run build 通過）
```

### 最佳實踐（DO 區塊）

```
💡 優先使用專案已有的 utilities 和 abstractions
💡 should 遵循專案現有的 coding style
💡 建議在不確定時先詢問，不猜測
```

### 可選優化

```
🔧 consider 為複雜邏輯新增行內注釋
🔧 may 使用 debug mode 輸出更詳細的 log
🔧 可考慮提取重複出現的 config 為常數
```

### 信心過濾規則

```
💡 信心 ≥80% 才回報問題（避免誤判）
💡 prefer 回報具體問題，而非泛泛建議
🔧 consider 說明問題的根因，而非只描述現象
```

### 停止條件

```
📋 MUST 在所有指定需求實作完成後才停止
📋 確認程式碼可編譯且基本測試通過
💡 should 在停止前確認 Handoff 已完整輸出
```
