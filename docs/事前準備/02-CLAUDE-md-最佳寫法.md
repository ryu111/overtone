# 02 — CLAUDE.md 最佳寫法

> 狀態：✅ 已確認

## 核心原則（官方 + 社群共識）

### 1. 長度控制 ✅ 已確認

| 來源 | 建議行數 |
|------|----------|
| Anthropic 官方 | < 200 行/檔案 |
| HumanLayer | < 300 行（自家 ~60 行） |
| Gian Gallegos | 50-100 行 |
| abhishekray07 | < 80 行 |
| shanraisshan | < 200 行/檔案 |

**結論**：**60-200 行安全區間**，越短越好。>200 行 Claude 開始忽略。

### 2. 該寫 vs 不該寫 ✅ 已確認

| ✅ 該寫 | ❌ 不該寫 |
|---------|----------|
| Claude 猜不到的 Bash 指令 | Claude 讀程式碼就能推斷的 |
| 與預設不同的 code style | 標準語言慣例（PEP8 等） |
| 測試指令和偏好 runner | 詳細 API 文件（改用連結） |
| Repo 慣例（branch/PR 規範） | 頻繁變動的資訊 |
| 專案特有架構決策 | 冗長說明或教學 |
| 開發環境奇特設定 | 逐檔描述 codebase |
| 常見陷阱和非直覺行為 | 不言自明的做法（「寫乾淨程式碼」） |
| Linter 管不到的語意規則 | Linter 能管的格式規則 |

### 3. 具體可驗證 ✅ 已確認

| ❌ 差 | ✅ 好 |
|-------|-------|
| Format code properly | Use 2-space indentation |
| Test your changes | Run `npm test` before committing |
| Write good commit messages | Commit message 用繁體中文，50 字以內 |
| Be careful with errors | 所有 `catch {}` 必須至少 console.error |

### 4. 強調標記有效 ✅ 已確認

官方確認 `IMPORTANT`、`MUST`、`CRITICAL`、`NEVER` 等標記提高遵守率。

我們的四級系統（wording skill）：
- `⛔` NEVER — 安全紅線（Hook 強制）
- `📋` MUST — 流程必要步驟
- `💡` should — 最佳實踐（可調整）
- `🔧` consider — 可選優化

---

## 架構模式

### 模式 1：漸進式揭露（推薦） ✅ 已確認

```
CLAUDE.md（精簡入口，< 80 行）
├── @docs/architecture.md        # 按需深入
├── .claude/rules/testing.md     # 條件載入（paths glob）
├── .claude/rules/hooks.md       # 條件載入
└── .claude/skills/xxx/SKILL.md  # 手動觸發
```

**核心**：根檔案只放每次都需要的指令，其餘按需載入。

### 模式 2：rules/ 條件拆分 🔍 待確認

把特定場景規則從 CLAUDE.md 拆到 `rules/`：

```yaml
# .claude/rules/hook-development.md
---
paths:
  - "hooks/**/*.js"
  - "scripts/lib/*-handler.js"
---
Hook 開發規則...
```

→ 只有讀到 hook 相關檔案時才載入，節省 context。

### 模式 3：@import 分流 ✅ 已確認

- 語法：`@path/to/file.md`
- 相對於包含 import 的檔案（非工作目錄）
- 遞迴上限：5 層
- 支援 `@~/path`（家目錄）
- 首次遇到外部 import 會要求批准

### 模式 4：迭代改進 ✅ 已確認

Claude 犯錯 → 更新 CLAUDE.md 防重複。「Update CLAUDE.md so you don't make that mistake again」。

---

## 常見反模式 ✅ 已確認

1. **過度膨脹**（>200 行）— 重要規則被噪音淹沒
2. **Linter 的事給 LLM** — 格式化用 eslint/prettier + hooks
3. **跨層級重複** — global 和 project 寫一樣的規則
4. **矛盾規則** — Claude 隨機選一個
5. **嵌入完整文件** — 用 `@` 把大量內容塞進 context
6. **通用人格指令** — 「be a senior engineer」無效
7. **不維護** — CLAUDE.md 會腐化，需定期 prune
8. **模型指令上限** — 前沿 LLM 約 150-200 條指令可靠遵循，系統提示已佔 ~50 條

---

## 與其他工具規則文件比較 ✅ 已確認

| 特性 | CLAUDE.md | .cursorrules | copilot-instructions.md | AGENTS.md |
|------|-----------|-------------|------------------------|-----------|
| 層級 | 4 層（組織→子目錄） | 專案級 | 專案級 | 專案級 |
| Import | @path 遞迴 5 層 | ❌ | ❌ | ❌ |
| 條件載入 | rules/ paths glob | YAML alwaysApply | glob | ❌ |
| Auto Memory | ✅ | ❌ | ❌ | ❌ |
| 跨工具 | Claude Code only | Cursor only | Copilot only | 通用 |

**Claude Code 獨特優勢**：四層層級 + @import + rules/ 條件載入 + auto memory。

---

## 我們目前 CLAUDE.md 的評估

### 全域 CLAUDE.md（76 行）✅ 良好

- 長度在安全區間 ✅
- 規則具體可驗證 ✅
- 有強調標記（⛔📋） ✅
- 沒用 rules/ 條件拆分 🔍 可改進
- 沒用 @import 🔍 可改進（v0.30 規則增加時）

### 專案 CLAUDE.md（57 行）✅ 良好

- 長度精簡 ✅
- 引用全域避免重複 ✅
- Hook 驗收有具體指令 ✅

---

## 行動項

- [ ] 研究 rules/ 實際使用效果 → 見 [05-rules-系統研究](./05-rules-系統研究.md)
- [ ] 設計 claudemd-dev skill 的審計邏輯 → 見 [06-claudemd-dev-Skill-設計](./06-claudemd-dev-Skill-設計.md)
