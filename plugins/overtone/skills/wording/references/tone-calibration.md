# 語氣校準指南

> 來源：Overtone 專案實踐 + 技術寫作慣例

## 一、四場景語氣矩陣

| 場景 | 正式度 | 用詞密度 | 語氣特徵 | 範例 |
|------|--------|----------|----------|------|
| **技術文件**（docs/、SKILL.md） | 高 | 精簡 | 客觀陳述、無人稱 | 「此模組負責佇列管理」 |
| **Commit message** | 中高 | 極簡 | 動詞開頭、結果導向 | `feat(queue): 新增 failCurrent 標記失敗項目` |
| **Agent prompt**（agents/*.md） | 中 | 適中 | 指令式、明確邊界 | 「你是 code reviewer，負責審查程式碼品質」 |
| **使用者對話**（回覆） | 中低 | 適中 | 自然、有互動感 | 「我先跑一次測試確認沒有 regression」 |

---

## 二、各場景詳細標準

### 技術文件

```
特徵：
  - 無人稱（不用「我」「你」「我們」）
  - 被動語態優先（「狀態被更新」而非「我更新狀態」）
  - 術語精確，不用口語縮寫
  - 一句一概念，不堆砌

正確範例：
  「SessionStart hook 在 session 啟動時觸發，負責初始化 workflow state。」
  「佇列項目的狀態依 pending → in_progress → completed 順序轉移。」

錯誤範例：
  ❌ 「我們的 SessionStart hook 會幫你把 workflow state 搞定。」
  ❌ 「基本上這個東西就是在 session 開始的時候跑一下。」
```

### Commit message

```
格式：type(scope): 動詞 + 描述

type 選擇：
  feat     — 新功能
  fix      — 修復 bug
  refactor — 重構（不改行為）
  chore    — 雜務（版本、文件同步）
  test     — 測試
  docs     — 文件

正確範例：
  feat(health-check): 新增 checkTestGrowth 偵測測試增長率
  fix(on-stop): 修正 parallelDone 截斷導致 stage 狀態卡住
  refactor(state): 統一 updateStateAtomic 兩路徑的防禦邏輯
  chore: bump version to 0.28.42

錯誤範例：
  ❌ 「更新了一些東西」（不具體）
  ❌ 「feat: 加了 checkTestGrowth」（缺少 scope）
  ❌ 「完成 health-check 功能優化」（非動詞開頭、缺 type）
```

### Agent prompt

```
結構：角色定義 → 職責 → 邊界（DO/DON'T） → 停止條件

語氣特徵：
  - 第二人稱（「你是 ...」「你的職責是 ...」）
  - 指令式語句（「執行 ...」「確認 ...」「輸出 ...」）
  - 搭配措詞層級標記（見 wording-guide.md）

正確範例：
  「你是 developer agent，負責根據 Handoff 實作功能。」
  「📋 MUST 在實作完成後執行 bun test 確認無 regression。」
  「⛔ NEVER 刪除已有的測試檔案。」

錯誤範例：
  ❌ 「請幫忙寫一下程式碼。」（不是指令式）
  ❌ 「你可能需要注意一下測試。」（太模糊）
```

### 使用者對話

```
語氣特徵：
  - 第一人稱（「我」）
  - 自然語氣，不過度正式
  - 主動告知下一步行動
  - 技術術語保持英文原文

正確範例：
  「我先跑 bun test 確認現有測試都通過，然後再開始實作。」
  「發現 state.js 的 sanitize() 沒有處理孤兒 agent 的情境，我來修正。」

錯誤範例：
  ❌ 「本次操作將執行測試驗證以確保系統穩定性。」（過度正式）
  ❌ 「OK 我搞定了 👍」（過度口語 + emoji）
```

---

## 三、語氣選擇決策樹

```
❓ 你正在寫什麼？
   │
   ├─ docs/ 或 SKILL.md reference
   │  → 高正式度：客觀陳述、無人稱、術語精確
   │
   ├─ git commit message
   │  → 中高正式度：type(scope): 動詞開頭、極簡
   │
   ├─ agents/*.md prompt
   │  → 中正式度：第二人稱、指令式、搭配措詞標記
   │
   └─ 回覆使用者
      → 中低正式度：第一人稱、自然語氣、主動說明
```

---

## 四、用詞密度標準

| 場景 | 每句字數 | 一段幾句 | 資訊密度 |
|------|----------|----------|----------|
| 技術文件 | 15-30 字 | 2-4 句 | 高（每句都有資訊量） |
| Commit message | 10-25 字 | 1 句（title）+ 可選 body | 極高 |
| Agent prompt | 10-25 字 | 1-2 句 | 高（指令明確） |
| 使用者對話 | 15-40 字 | 2-5 句 | 中（可加解釋） |

---

## 五、常見措詞錯誤修正對照表

| 錯誤 | 修正 | 原因 |
|------|------|------|
| 「進行一個修改」 | 「修改」 | 贅詞（「進行一個」無意義） |
| 「基本上就是 ...」 | 直接陳述 | 口語填充詞 |
| 「然後的話 ...」 | 「接著 ...」或刪除 | 口語填充詞 |
| 「做一個處理」 | 「處理」 | 「做一個」贅詞 |
| 「其實 ...」 | 直接陳述 | 口語填充詞，削弱語氣 |
| 「大概率」 | 「通常」或「多數情況」 | 口語用法 |
| 「感覺像是 ...」 | 「推測原因是 ...」 | 過度不確定 |
| 「幫你 ...」 | 「我來 ...」 | agent 不是在「幫忙」，是在「執行」 |
| 「沒問題」 | 「確認完成」 | 不夠具體 |
| 「搞定了」 | 「已完成」 | 過度口語 |
| 「東西」 | 使用具體名詞 | 模糊指代 |
| 「這個部分」 | 指明具體模組/函式名 | 模糊指代 |

---

## 六、場景語氣轉換範例

同一事件在四種場景的表達：

**事件**：修正了 state.js 中 parallelDone 截斷的 bug

| 場景 | 表達 |
|------|------|
| 技術文件 | 「`updateStateAtomic` 新增 parallelDone 截斷防禦，modifier callback 使用 `?? current` 確保值不被意外清除。」 |
| Commit | `fix(state): 修正 parallelDone 截斷 — modifier 加入 ?? current 防禦` |
| Agent prompt | 「📋 MUST 確認 parallelDone 修改時使用 `?? current` 防禦，避免截斷。」 |
| 使用者對話 | 「我發現 parallelDone 在某些路徑會被截斷成 undefined，已經加了 `?? current` 防禦。跑過測試確認沒有 regression。」 |
