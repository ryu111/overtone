# 05 — `.claude/rules/` 系統研究

> 狀態：🔍 待確認

## 機制說明 ✅ 已確認

### 基本用法

```markdown
# ~/.claude/rules/hook-development.md
---
paths:
  - "hooks/**/*.js"
  - "scripts/lib/*-handler.js"
---

## Hook 開發規則

- updatedInput 是 REPLACE 不是 MERGE
- 所有 catch 必須至少 hookError
- hookSpecificOutput.additionalContext 才注入 model context
```

### 載入邏輯

| 條件 | 行為 |
|------|------|
| 無 `paths` frontmatter | 啟動時全域載入（等同寫在 CLAUDE.md） |
| 有 `paths` frontmatter | **僅當 Claude 讀取匹配檔案時才載入** |
| User-level（`~/.claude/rules/`） | 先載入 |
| Project-level（`.claude/rules/`） | 後載入，優先順序更高 |

### Frontmatter 格式

```yaml
---
paths:
  - "src/api/**/*.ts"        # glob 模式
  - "src/**/*.{ts,tsx}"      # brace expansion
  - "tests/**/*.test.ts"
---
```

⚠️ **已知 Bug**：user-level rules 的 paths frontmatter 可能被忽略（[#21858](https://github.com/anthropics/claude-code/issues/21858)）

### 支援特性

- ✅ Symlinks（跨專案共用規則集）
- ✅ 循環 symlink 偵測
- ✅ 遞迴子目錄（`rules/frontend/react.md`）
- ❌ 不支援 @import（rules 檔案內不能用）

---

## 拆分策略 🔍 待確認

### 從 CLAUDE.md 拆出的候選規則

目前全域 CLAUDE.md 76 行。以下規則**只在特定場景需要**，適合拆到 rules/：

| 規則 | 目前在 | 建議拆到 | paths |
|------|--------|---------|-------|
| updatedInput 是 REPLACE | CLAUDE.md | rules/hook-dev.md | `hooks/**/*.js`, `scripts/lib/*-handler.js` |
| 元件閉環檢查 | CLAUDE.md | rules/component-dev.md | `skills/*/SKILL.md`, `agents/*.md` |
| Hook output 雙通道 | MEMORY.md | rules/hook-dev.md | 同上 |
| BDD GIVEN/WHEN/THEN | CLAUDE.md | rules/testing.md | `tests/**/*.test.js`, `specs/**/*.md` |

### 全新規則候選

| 規則 | 用途 | paths |
|------|------|-------|
| rules/security.md | 安全敏感操作規則 | `scripts/lib/session-spawn.js`, `hooks/**` |
| rules/claude-md.md | CLAUDE.md 修改規則 | `CLAUDE.md`, `.claude/CLAUDE.md` |
| rules/registry.md | registry 修改規則 | `scripts/lib/registry*.js` |

---

## 與 CLAUDE.md 的配合策略 🔍 待確認

### 方案 A：CLAUDE.md 精簡 + rules/ 承接

```
CLAUDE.md（~50 行，只留每次都要的）
├── rules/hook-dev.md（paths: hooks/**）
├── rules/testing.md（paths: tests/**）
├── rules/component-dev.md（paths: skills/**/*, agents/*）
└── rules/security.md（paths: session-spawn.js, hooks/**）
```

**優點**：CLAUDE.md 極度精簡，context 效率最高
**缺點**：規則分散，不易總覽

### 方案 B：CLAUDE.md 保持現狀 + rules/ 補充新規則

```
CLAUDE.md（~76 行，維持現有）
├── rules/claude-md.md（CLAUDE.md 自身修改規則）
└── rules/registry.md（registry 修改規則）
```

**優點**：最小變動，核心規則集中
**缺點**：沒用到 rules/ 的 context 節省優勢

### 方案 C：混合（推薦） 🔍 待確認

```
CLAUDE.md（~60 行，移出 hook 專屬規則）
├── rules/hook-dev.md（hook 開發專屬）
├── rules/registry.md（registry 修改專屬）
└── 其餘保留在 CLAUDE.md
```

**優點**：平衡精簡與可讀性，高頻規則保留在 CLAUDE.md
**缺點**：需要判斷什麼夠「專屬」

---

## 待驗證

- [ ] user-level paths bug 是否已修復？
- [ ] rules/ 內的規則是否能搭配 @import？
- [ ] rules/ 的 paths 是相對於什麼目錄？（專案根 or rules 檔案位置）
- [ ] 實際測試：建一個 rule 看載入行為
