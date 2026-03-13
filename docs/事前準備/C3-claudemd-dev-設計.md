# C3 — `claudemd-dev` Skill 設計

> 狀態：🔍 待確認

## 定位

**CLAUDE.md 全生命週期管理** = onboard（建立）+ 審計（檢查）+ 優化（改進）

整合 `onboard` skill 的骨架生成 + 新增審計和優化能力。

---

## 功能矩陣

| 功能 | 原 onboard | 新增 | 觸發方式 |
|------|-----------|------|---------|
| 掃描專案產生骨架 | ✅ | | `/claudemd-dev init` |
| 技術棧偵測 | ✅ | | 同上 |
| 長度審計（<200 行警告） | | ✅ | `/claudemd-dev audit` |
| 反模式偵測 | | ✅ | 同上 |
| 跨層級重複檢查 | | ✅ | 同上 |
| 矛盾規則偵測 | | ✅ | 同上 |
| `@import` 策略建議 | | ✅ | `/claudemd-dev optimize` |
| `rules/` 拆分建議 | | ✅ | 同上 |
| 最佳寫法 reference | | ✅ | 按需載入 |

---

## SKILL.md 草案 🔍 待確認

```markdown
---
name: claudemd-dev
description: >
  CLAUDE.md 全生命週期管理 — 建立骨架、審計品質、優化結構。
  觸發：使用者提到「建立 CLAUDE.md」「檢查 CLAUDE.md」「優化規則」
  或專案初始化時。
argument-hint: init | audit | optimize
---

# claudemd-dev

CLAUDE.md 全生命週期管理工具。

## 三種模式

### `init` — 建立骨架
掃描專案結構和技術棧，產生 CLAUDE.md 骨架。

### `audit` — 品質審計
檢查現有 CLAUDE.md 的健康度：
- 長度（>200 行警告、>300 行錯誤）
- 反模式偵測（見 reference）
- 跨層級重複（global vs project）
- 矛盾規則

### `optimize` — 結構優化
根據最佳實踐建議改進：
- @import 拆分策略
- rules/ 條件載入建議
- 精簡冗餘規則

## 核心原則

- 📋 MUST：只寫 Claude 猜不到的規則
- 📋 MUST：規則必須具體可驗證
- ⛔ NEVER：不寫 linter 能管的格式規則
- ⛔ NEVER：不嵌入完整文件內容
- 💡 should：用強調標記（MUST/NEVER/IMPORTANT）
- 💡 should：保持 60-200 行

## References

- @references/best-practices.md — 最佳寫法完整指南
- @references/anti-patterns.md — 反模式偵測清單
- @references/claudemd-skeleton.md — 骨架模板（from onboard）
- @references/stack-detection.md — 技術棧偵測（from onboard）
- @references/rules-guide.md — .claude/rules/ 使用指南
```

---

## References 規劃

### best-practices.md（新建）

整合 02-CLAUDE-md-最佳寫法.md 的核心內容：
- 長度控制表
- 該寫 vs 不該寫表
- 架構模式（漸進式揭露）
- 強調標記用法

### anti-patterns.md（新建）

可程式化偵測的反模式清單：
1. 行數 > 200 → warning
2. 行數 > 300 → error
3. 含 `be a senior` / `write clean code` → 通用人格指令
4. 含完整程式碼區塊 > 20 行 → 嵌入過多
5. 同一規則在 global 和 project 出現 → 重複
6. 兩條規則用語矛盾 → 需人工確認

### claudemd-skeleton.md（from onboard）

直接搬移 onboard 的模板。

### stack-detection.md（from onboard）

直接搬移 onboard 的偵測策略。

### rules-guide.md（新建）

.claude/rules/ 的完整使用指南：
- frontmatter 格式
- paths glob 語法
- 載入時機
- 已知限制
- 拆分策略建議

---

## 與現有 Skill 的關係

| Skill | 關係 |
|-------|------|
| `onboard` | **被整合**：init + skeleton + stack-detection 搬入 |
| `wording` | **引用**：audit 時參考四級標記系統 |
| `claude-dev` | **互補**：claude-dev 管 Skill 開發，claudemd-dev 管 CLAUDE.md |
| `craft` | **無關**：各自獨立 |

---

## 建立步驟 ⏳ Pending

1. 用 `claude-api:skill-creator` 產生骨架
2. 搬入 onboard 的 references
3. 新建 best-practices.md、anti-patterns.md、rules-guide.md
4. 用 `skill-judge` 評分驗證
5. 測試三種模式（init/audit/optimize）
6. 刪除或 .bak 舊的 onboard skill

---

## 開放問題 🔍 待確認

- [ ] `onboard` 是否還有其他專案在用？直接刪還是保留 .bak？
- [ ] audit 模式要不要自動觸發（hook）？還是純手動 `/claudemd-dev audit`？
- [ ] 是否需要一個 `diff` 模式，比較修改前後的 CLAUDE.md？
