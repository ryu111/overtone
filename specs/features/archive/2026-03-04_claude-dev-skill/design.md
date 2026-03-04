---
feature: claude-dev-skill
workflow: standard
status: in-progress
created: 2026-03-04
---

# claude-dev-skill Design

## 技術摘要（What & Why）

- **方案**：新增第 15 個 knowledge domain skill — `claude-dev`，包含 hooks API 和 agent API 兩個 reference 文件
- **理由**：developer 和 architect agent 在開發 Claude Code plugin 時需要查詢 hooks.json 格式、hook output 欄位、agent frontmatter 規則等知識，目前這些分散在 plugin-dev 第三方 SKILL.md 中（800 chars 截斷後不完整），且包含 Overtone 特有限制未記載
- **取捨**：skill 正文截斷在 800 chars，完整知識放 references（無限制）；接受此設計因為這與所有 knowledge domain 一致

## API 介面設計

### SKILL.md 正文結構（< 800 chars）

```
# Claude Dev 知識域

> 來源：Claude Code 官方 hooks + agent API

## 消費者

| Agent | 用途 |
|-------|------|
| developer | 開發 plugin 時查詢 hooks API、hook output 格式、exit codes |
| architect | 設計 plugin 架構時查詢 agent frontmatter 欄位、skills 工作原理 |

## 決策樹：何時查閱哪個參考？

- hooks.json 格式 / hook events / input output / exit codes → hooks-api.md
- agent frontmatter / skills 欄位 / bypassPermissions / manage-component → agent-api.md

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/claude-dev/references/hooks-api.md` | Hooks API：事件總覽、hooks.json 格式、input/output、exit codes、Overtone 特有限制 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/claude-dev/references/agent-api.md` | Agent API：frontmatter 欄位、skills 機制、manage-component.js 指令、系統 prompt 設計 |
```

估算字元數：約 660 chars（安全範圍內，不會被截斷）

### hooks-api.md 結構

| 章節 | 內容 |
|------|------|
| 1. Hook 事件總覽 | 9 個事件清單 + 用途 |
| 2. hooks.json 格式 | 三層嵌套格式（Overtone 必要）vs settings.json 格式 |
| 3. Hook Input Format | 共用欄位 + 事件專用欄位 |
| 4. Hook Output Format | PreToolUse / Stop / SubagentStop / 通用各別說明 |
| 5. Exit Codes | 0 / 2 / 其他的意義 |
| 6. Overtone 特有限制 | updatedInput REPLACE 規則、SubagentStop 無 systemMessage |
| 7. 實用範例 | stdin 讀取 + jq + JSON 輸出 pattern |

### agent-api.md 結構

| 章節 | 內容 |
|------|------|
| 1. Frontmatter 欄位 | 所有欄位說明（name/model/color/skills/etc） |
| 2. skills 欄位工作原理 | buildSkillContext 截斷規則（800 chars / 2400 total） |
| 3. manage-component.js 指令 | create + update 格式，skills 是 replace |
| 4. Overtone 系統 prompt 四模式 | 信心過濾 + 邊界清單 + 誤判防護 + 停止條件 |
| 5. Overtone 特有設定 | bypassPermissions 標準、pre-edit guard 保護 |

### knowledge-gap-detector.js DOMAIN_KEYWORDS 新增

```javascript
'claude-dev': [
  'hooks.json', 'hook event', 'pretooluse', 'posttooluse',
  'subagent stop', 'sessionstart', 'permissiondecision',
  'updatedinput', 'hook script', 'agent frontmatter', 'agent.md',
  'bypasspermissions', 'plugin hook', 'claude code plugin',
  'hook-development', 'agent-development',
],
```

約 16 個關鍵詞，minScore=0.2 → 需命中約 3 個（合理門檻）

## 資料模型

無新的 state 資料模型。所有內容為靜態 Markdown 知識文件。

## 檔案結構

```
新增的檔案：
  plugins/overtone/skills/claude-dev/SKILL.md           ← 新增：knowledge domain 索引（< 800 chars 正文）
  plugins/overtone/skills/claude-dev/references/hooks-api.md  ← 新增：hooks API 完整參考
  plugins/overtone/skills/claude-dev/references/agent-api.md  ← 新增：agent API 完整參考

修改的檔案：
  plugins/overtone/agents/developer.md    ← 修改：frontmatter skills 加入 claude-dev
  plugins/overtone/agents/architect.md    ← 修改：frontmatter skills 加入 claude-dev
  plugins/overtone/scripts/lib/knowledge-gap-detector.js ← 修改：DOMAIN_KEYWORDS 加入 claude-dev domain
```

## 關鍵技術決策

### 決策 1：SKILL.md 建立方式

- **選項 A**（選擇）：用 `manage-component.js create skill` — 符合元件閉環規則，自動更新 plugin.json
- **選項 B**（未選）：直接 Write — pre-edit guard 不保護新建，但不符合元件管理慣例

### 決策 2：references 建立方式

- **選項 A**（選擇）：直接 Write references 目錄下的 .md 檔案 — pre-edit guard 不保護 references/，可直接寫
- **選項 B**（未選）：用 manage-component.js — 不支援 references 目錄，只支援 SKILL.md

### 決策 3：agent frontmatter 更新方式

- **選項 A**（選擇）：`manage-component.js update agent` 帶入完整 skills 陣列（replace 語意）
- **選項 B**（未選）：直接編輯 agents/*.md — pre-edit guard 阻擋

### 決策 4：需要 SKILL.md 的 frontmatter 設定

```yaml
name: claude-dev
description: Claude Code Plugin 開發知識。hooks.json 格式、hook events、agent frontmatter 欄位。供 developer 和 architect 在開發 plugin 時查詢。
disable-model-invocation: true
user-invocable: false
```

## 實作注意事項

- agent frontmatter 的 `skills` 是 replace 不是 append：update 時必須帶入所有現有 skills 加上 claude-dev
  - developer 現有：`["autonomous-control","commit-convention","wording","os-control","craft"]`
  - architect 現有：`["autonomous-control","architecture","os-control","wording","craft"]`
- SKILL.md 正文不得超過 800 chars（buildSkillContext 截斷），建議控制在 700 chars 以內留緩衝
- hooks-api.md 要包含 Overtone 特有限制（三層嵌套格式、SubagentStop 無 systemMessage、updatedInput REPLACE）
- knowledge-gap-detector 新增 domain 後，domain 數量從 11 → 12，相關測試可能需更新
