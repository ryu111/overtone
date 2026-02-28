## 功能名稱

`onboard-skill`

## 需求背景（Why）

- **問題**：新專案缺乏 CLAUDE.md 時，Claude Code 不了解專案結構、技術棧、常用命令，導致回答品質下降。手動撰寫 CLAUDE.md 耗時且容易遺漏。
- **目標**：提供 `/ot:onboard` Skill，自動掃描專案結構並生成 CLAUDE.md 骨架，降低 onboarding 門檻。
- **優先級**：屬於開發者體驗（DX）改善，可獨立於主 workflow 實作。

## 使用者故事

```
身為 Claude Code 使用者
我想要在新專案中使用 /ot:onboard
以便快速生成 CLAUDE.md 骨架，讓 Claude Code 更了解我的專案
```

```
身為 Claude Code 使用者
我想要在已有 CLAUDE.md 的專案中使用 /ot:onboard
以便補充缺失的區塊（技術棧、目錄結構、常用命令等）
```

## 範圍邊界

### 在範圍內（In Scope）

- SKILL.md 定義：多步驟掃描流程（偵測 CLAUDE.md → 掃描 manifest + 目錄 → 解析技術棧 + 命令 → 組裝骨架 → 輸出到對話）
- 6 種 manifest 偵測：package.json / pyproject.toml / Cargo.toml / go.mod / pom.xml / *.csproj
- 目錄結構掃描：頂層目錄和關鍵子目錄
- 常用命令偵測：從 manifest scripts 欄位或語言慣例推導
- CLAUDE.md 骨架模板：references/claudemd-skeleton.md
- 已有 CLAUDE.md 偵測：merge/補充模式
- 文件同步：status.md、plugin.json version

### 不在範圍內（Out of Scope）

- 不自動寫入 CLAUDE.md（Skill 產出到對話，使用者自行決定寫入）
- 不新增 agent（Main Agent 直接執行）
- 不修改 registry.js 或 hooks
- 不偵測 framework 層級（React/Vue/Django 等），只偵測語言級別技術棧
- 不新增 JS 測試（純 Markdown Skill，無可測程式碼）

## 子任務清單

1. **建立 references/claudemd-skeleton.md**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/onboard/references/claudemd-skeleton.md`
   - 說明：泛化的 CLAUDE.md 骨架模板，包含專案定位、技術棧、目錄結構、常用命令、開發規範、關鍵文件等區塊

2. **建立 SKILL.md**（可與 1 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/onboard/SKILL.md`
   - 說明：5 步掃描流程定義（偵測已有 CLAUDE.md → 並行掃描 manifest + 目錄 → 解析技術棧 + 命令 → 組裝骨架 → 輸出到對話）

3. **文件同步**（依賴 1、2 完成）
   - 負責 agent：developer
   - 相關檔案：`docs/status.md`、`plugins/overtone/.claude-plugin/plugin.json`
   - 說明：更新 status.md 新增 onboard skill 記錄、plugin.json version bump

## 開放問題

- `disable-model-invocation` 設為 true 還是 false？（建議 false -- 組裝骨架需要 AI 語意判斷）
- 骨架模板是用 placeholder 語法（如 `{techStack}`）還是用自然語言描述讓 AI 填充？（建議後者 -- 更靈活）
- 是否需要偵測 monorepo（根目錄有多個 manifest 或 workspace 設定）？（建議 V1 不處理，留到未來增強）
