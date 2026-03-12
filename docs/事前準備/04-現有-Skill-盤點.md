# 04 — 現有 Skill 盤點

> 狀態：✅ 已確認

## Overtone 自建 Skills（28 個）

### 核心系統（4 個）

| Skill | 用途 | v0.30 保留？ |
|-------|------|------------|
| `thinking` | 結構化推理 | ✅ |
| `instinct` | 跨專案內化知識 | ✅ |
| `skill-judge` | Skill 品質評判 | ✅ |
| `workflow-core` | 工作流執行規則 | 🔍 需改造 |

### 知識領域（15 個）

| Skill | 用途 | v0.30 保留？ |
|-------|------|------------|
| `architecture` | 架構設計 | 🔍 |
| `autonomous-control` | 自主控制 | 🔍 |
| `build-system` | 構建系統 | 🔍 |
| `code-review` | 程式審查 | ✅ |
| `craft` | 工藝精進 | ✅ |
| `database` | 資料庫 | 🔍 |
| `debugging` | 除錯 | ✅ |
| `dead-code` | 死碼清理 | 🔍 |
| `evolve` | 自我進化 | ✅ |
| `issue` | 問題診斷 | ✅ |
| `os-control` | OS 控制 | 🔍 |
| `pr` | PR 管理 | ✅ |
| `security-kb` | 安全知識庫 | ✅ |
| `specs` | 規格寫作 | ✅ |
| `verify` | 驗證確保 | 🔍 |

### 業務與工具（9 個）

| Skill | 用途 | v0.30 保留？ |
|-------|------|------------|
| `pm` | 產品管理 | ✅ |
| `testing` | 測試策略 | ✅ |
| `auto` | 自動化選擇器 | 🔍 需改造 |
| `claude-dev` | Plugin/Skill 開發 | ✅ |
| `commit-convention` | Commit 規範 | ✅ |
| `wording` | 用詞風格 | ✅ |
| `onboard` | CLAUDE.md 骨架生成 | 🔍 併入 claudemd-dev |
| `game-dev` | 遊戲開發 | ⏳ |
| `game-publish` | 遊戲發布 | ⏳ |

---

## 與 claudemd-dev 相關的現有 Skill

### onboard — 將被整合

**路徑**：`~/.claude/skills/onboard/`
**功能**：掃描專案結構 → 產生 CLAUDE.md 骨架
**References**：
- `claudemd-skeleton.md` — 組裝模板
- `stack-detection.md` — 框架識別策略

### wording — 寫法規範（保持獨立）

**路徑**：`~/.claude/skills/wording/`
**功能**：四級指令強度標記（⛔📋💡🔧）
**References**：
- `wording-guide.md` — 反模式清單 + Hook regex
- `tone-calibration.md` — 語氣選擇決策樹
- `zh-tw-conventions.md` — 中英混排規則

### claude-dev — Skill 創作（保持獨立）

**路徑**：`~/.claude/skills/claude-dev/`
**功能**：Skill 創作五步流程
**References**：
- `skill-authoring-guide.md` — 核心公式 + NEVER 品質標準

### craft — 工藝原則（保持獨立）

**路徑**：`~/.claude/skills/craft/`
**References**：
- `overtone-principles.md` — 完全閉環、自動修復
- `code-level-patterns.md` — 程式碼模式決策樹

---

## 官方/Plugin 提供的相關 Skill

### claude-api:skill-creator ✅ 已確認可用

**來源**：`anthropic-agent-skills` marketplace
**功能**：建立新 skill、修改現有 skill、跑 eval 測試、benchmark 品質
**用途**：用來啟動 claudemd-dev 的骨架建立

### plugin-dev:skill-development ✅ 已確認可用

**來源**：`claude-code-plugins` marketplace
**功能**：Skill 結構指南、progressive disclosure、最佳實踐
**用途**：參考 skill 結構規範

### plugin-dev:skill-reviewer ✅ 已確認可用

**來源**：`claude-code-plugins` marketplace
**功能**：Skill 品質審查
**用途**：建完後用來審查

---

## 行動項

- [ ] 確認 28 個 skill 中哪些 v0.30 需要改造 → 見 [07-v030-架構決策](./07-v030-架構決策.md)
- [ ] onboard 的 references 要搬到 claudemd-dev → 見 [06-claudemd-dev-Skill-設計](./06-claudemd-dev-Skill-設計.md)
