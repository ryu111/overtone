# Overtone 元件開發規範

> 本文件為 Overtone plugin 開發的專有規範，涵蓋元件閉環、保護機制、版本管理等核心慣例。

---

## 1. 元件閉環檢查

新增或修改 Skill、Agent、Hook 時，必須確認三者的依賴關係完整：

### 依賴鏈

```
Skill → Agent → Hook（注入）
```

| 元件 | 依賴檢查點 |
|------|-----------|
| **新增 Skill** | 確認有 Agent 在 frontmatter 的 `skills` 欄位消費此 Skill |
| **新增 Agent** | 確認 pre-task.js `buildSkillContext` 會注入 Agent 所需的 skills；確認 registry-data.json 有對應記錄 |
| **新增 Hook** | 確認 hooks.json 使用官方三層嵌套格式（見下方格式規則） |
| **危險操作** | 確認有對應的 Guard 保護（pre-edit-guard、pre-bash-guard 等） |

### hooks.json 格式規則

**正確格式（三層嵌套）**：
```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "可選",
        "hooks": [
          { "type": "command", "command": "..." }
        ]
      }
    ]
  }
}
```

**錯誤格式（扁平陣列，部分 hook 無法觸發）**：
```json
{
  "hooks": [
    { "event": "EventName", "type": "command", "command": "..." }
  ]
}
```

Guard test 自動驗證 hooks.json 格式，勿繞過。

---

## 2. manage-component.js 完整用法

受保護的元件檔案唯一合法修改路徑是透過 `manage-component.js`。

```bash
# 建立 agent
bun ~/.claude/scripts/manage-component.js create agent '{
  "name": "my-agent",
  "description": "角色描述",
  "model": "sonnet",
  "color": "blue",
  "stage": "MY_STAGE",
  "emoji": "🤖",
  "label": "My Agent",
  "maxTurns": 50,
  "body": "# Instructions\n\n..."
}'

# 建立 hook
bun ~/.claude/scripts/manage-component.js create hook '{
  "event": "CustomEvent",
  "command": "~/.claude/hooks/scripts/custom.js"
}'

# 建立 skill
bun ~/.claude/scripts/manage-component.js create skill '{
  "name": "my-skill",
  "description": "知識域描述",
  "user-invocable": false,
  "body": "# My Skill\n\n..."
}'

# 更新 agent（只需傳要改的欄位）
bun ~/.claude/scripts/manage-component.js update agent developer '{"model":"opus"}'

# 更新 hook
bun ~/.claude/scripts/manage-component.js update hook SessionStart '{"command":"new-path.js"}'

# 更新 skill
bun ~/.claude/scripts/manage-component.js update skill my-skill '{"description":"新描述"}'

# 更新版本號（patch +1）
bun ~/.claude/scripts/manage-component.js bump-version

# 指定版本號
bun ~/.claude/scripts/manage-component.js bump-version 1.2.0

# 查看完整說明
bun ~/.claude/scripts/manage-component.js --help
```

### skills 欄位是 replace 語意

`update agent` 的 `skills` 欄位為**完整替換**，不是 merge。必須傳入完整的 skills 陣列：

```bash
# 錯誤：原有 ["testing"] 會被清空，最終只剩 ["workflow-core"]
bun ... update agent developer '{"skills": ["workflow-core"]}'

# 正確：傳入完整陣列
bun ... update agent developer '{"skills": ["testing", "workflow-core"]}'
```

查詢 Agent 現有 skills，先讀 agent 檔案：
```bash
head -20 ~/.claude/agents/developer.md
```

### command 不受保護

`commands/*.md` 可直接使用 Write/Edit 工具修改，不需透過 manage-component.js。

---

## 3. pre-edit-guard 保護規則

`pre-edit-guard.js` 在每次 Write/Edit 工具使用時觸發，阻擋對受保護檔案的直接修改。

### 受保護的檔案（相對於 plugin root）

| 模式 | 說明 | 合法修改方式 |
|------|------|-------------|
| `agents/<name>.md` | Agent 定義 | `manage-component.js create/update agent` |
| `hooks/hooks.json` | Hook 設定 | `manage-component.js create/update hook` |
| `skills/<name>/SKILL.md` | Skill 定義 | `manage-component.js create/update skill` |
| `scripts/lib/registry-data.json` | Registry 資料 | `createAgent/updateAgent`（自動同步） |
| `.claude-plugin/plugin.json` | Plugin manifest | `createAgent`（自動同步） |

### 不受保護的檔案

以下檔案可直接 Write/Edit：

- `commands/*.md` — Command 定義
- `skills/*/references/*.md` — Skill reference 文件
- `hooks/scripts/*.js` — Hook 腳本
- `scripts/*.js` — 工具腳本
- `scripts/lib/*.js`（非 registry-data.json）— 共用庫
- Plugin root 外的所有檔案

### 特殊規則：MEMORY.md 行數守衛

`~/.claude/projects/*/memory/MEMORY.md` 超過 200 行時 Write/Edit 會被阻擋，需先刪除低價值內容。

---

## 4. registry.js 是 Single Source of Truth

所有 agent/stage/workflow/event 映射必須從 registry 導入，不可在程式碼中硬編碼。

```javascript
const {
  AGENTS,          // agent name → agent 資訊
  STAGES,          // stage key → stage 資訊
  WORKFLOWS,       // workflow name → stage 清單
  TIMELINE_EVENTS, // event type → event 資訊
  effortLevels,    // effort level 映射
} = require(`${process.env.CLAUDE_PLUGIN_ROOT ?? (require('os').homedir() + '/.claude')}/scripts/lib/registry`);
```

### 反模式（禁止）

```javascript
// 硬編碼 agent name → 若 registry 變更，此處漏改
const agentName = 'developer';

// 硬編碼 stage → 應從 STAGES 導入
if (stage === 'DEV') { ... }
```

---

## 5. Handoff 格式

Agent 間交接使用固定格式，確保 context 完整傳遞：

```markdown
## HANDOFF: {from-agent} → {to-agent}

### Context
[實作了什麼功能 / 修復了什麼問題]

### Findings
[關鍵決策與發現]

### Files Modified
[變更的檔案清單，每個標明新增/修改/刪除]

### Open Questions
[需要 next agent 特別注意的項目]
```

Handoff 只存在於 Main Agent 的 context window，不寫入磁碟。

> 完整欄位填寫規範 + Chaining 規則 + Agent → Agent 傳遞表格：
> `~/.claude/skills/workflow-core/references/handoff-protocol.md`

---

## 6. Agent Prompt 四模式

撰寫 Agent 定義時，body 必須包含以下四個模式：

### 模式 1：信心過濾

只在信心高時輸出，低信心時明確說明不確定：

```markdown
> 確定性 → 程式碼；語意模糊 → AI；AI 也不確定 → 詢問人類
```

### 模式 2：邊界清單（DO/DON'T）

明確列出哪些必須做、哪些絕對不做：

```markdown
## DO（📋 MUST）
- 📋 ...

## DON'T（⛔ NEVER）
- ⛔ ...
```

### 模式 3：誤判防護

針對已知的誤判場景加入防護說明：

```markdown
> 注意：XXX 的輸出含「REJECT」文字不代表被拒絕，是描述性上下文
```

### 模式 4：停止條件

明確的任務完成和失敗退出條件：

```markdown
## 停止條件
- ✅ 所有需求已實作且測試通過
- ❌ 3 次修復嘗試仍無法通過 → 說明困難點，交由人工判斷
```

---

## 7. 命名慣例

| 元件 | 命名規則 | 範例 |
|------|---------|------|
| **Agent** | 角色名稱（小寫，kebab-case） | `developer`, `code-reviewer`, `test-writer` |
| **Skill** | 知識域名稱（小寫，kebab-case） | `claude-dev`, `testing`, `workflow-core` |
| **Command** | workflow-name 或 stage-shortcut | `standard`, `quick`, `dev`, `review` |
| **Hook 腳本** | event-name.js（事件名稱對應） | `session-start.js`, `pre-compact.js`, `on-stop.js` |
| **Hook 腳本（Tool 類）** | 功能描述，放在 `scripts/tool/` 子目錄 | `pre-edit-guard.js`, `pre-bash-guard.js` |

### Stage key 慣例

Stage key 使用大寫縮寫，可帶 instance suffix：

- 基本格式：`DEV`, `TEST`, `REVIEW`
- 含 instance：`REVIEW:inst_xxx`, `TEST:2`
- 提取 base key：`stageKey.split(':')[0]`

---

## 8. 版本管理

每次 commit 涉及 plugin 功能變更時，必須更新 `plugin.json` 版本號。

```bash
# patch +1（最常見，修復或小功能）
bun ~/.claude/scripts/manage-component.js bump-version

# 指定版本（重大變更）
bun ~/.claude/scripts/manage-component.js bump-version 1.0.0
```

### 什麼時候更新版本

| 變更類型 | 是否更新 |
|---------|---------|
| 新增 Agent / Skill / Hook | 是 |
| 修改 Agent / Skill / Hook 行為 | 是 |
| 修改 Command 內容 | 是 |
| 修改測試檔案 | 否 |
| 修改 docs/ 文件 | 否 |
| 修改 scripts/ 工具腳本 | 視影響範圍 |

版本號格式：`major.minor.patch`（semver）。目前主要使用 patch 遞增。
