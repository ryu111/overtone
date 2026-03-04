# Skill API 參考

> 適用對象：開發 Overtone knowledge domain 或通用 skill 的開發者

---

## 1. Skill 結構概覽

每個 skill 是一個獨立目錄，位於 `${CLAUDE_PLUGIN_ROOT}/skills/{skill-name}/`：

```
skill-name/
├── SKILL.md              （必填）frontmatter + 正文
├── references/           （建議）按需載入的參考文件
│   ├── guide.md
│   └── api-reference.md
├── examples/             （可選）可直接複製使用的範例
│   └── example.js
└── scripts/              （可選）可執行的工具腳本
    └── validate.sh
```

**目錄規則：**
- `SKILL.md` 是唯一必填檔案
- `references/` 不受 pre-edit-guard 保護 → 可直接用 Write 工具建立/編輯
- `SKILL.md` 受 pre-edit-guard 保護 → 必須透過 `manage-component.js` 修改
- 只建立實際需要的子目錄，不必全部建立

---

## 2. SKILL.md Frontmatter 欄位

```yaml
---
name: skill-name                        # 必填，唯一識別符
description: "..."                      # 必填，觸發條件（skill matching 用）
version: 0.1.0                          # 可選，語意版本
disable-model-invocation: true          # Knowledge domain 專用：true = 不觸發 model invocation
user-invocable: false                   # 是否可被使用者用 /skill-name 觸發（預設 false）
allowed-tools: ["Read", "Bash"]         # 限制 skill 可用工具（可選）
model: claude-opus-4-6                  # 指定使用的 model（可選，預設繼承 session model）
argument-hint: "feature-name"           # 使用者觸發時的參數提示（可選）
---
```

### 欄位說明

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `name` | string | 是 | Skill 唯一名稱，對應目錄名稱 |
| `description` | string | 是 | 決定 skill 何時觸發，用第三人稱 + 具體觸發詞組 |
| `version` | string | 否 | 語意版本（遵循 semver） |
| `disable-model-invocation` | boolean | 否 | `true` 時 skill 僅作為知識注入，不主動呼叫 model |
| `user-invocable` | boolean | 否 | `true` 時使用者可輸入 `/skill-name` 觸發 |
| `allowed-tools` | array | 否 | 限制 skill 執行期間可用的工具清單 |
| `model` | string | 否 | 覆寫 model（如 `claude-opus-4-6`） |
| `argument-hint` | string | 否 | 使用者觸發時顯示的參數提示文字 |

### Description 撰寫規範

description 決定 skill 何時被選中。必須使用**第三人稱**並包含**具體觸發詞組**：

```yaml
# 正確 — 第三人稱 + 具體觸發詞組
description: "This skill should be used when the user asks to 'create a skill', 'add a skill to plugin', 'write a new skill'."

# 錯誤 — 模糊且非第三人稱
description: "Use this skill when working with skills."
```

---

## 3. Progressive Disclosure 三層架構

Skill 採用三層漸進式載入，平衡資訊豐富度與 context window 消耗：

```
L0 — Metadata（frontmatter）
     Always in context (~100 words)
     用途：skill matching / 觸發判斷

L1 — SKILL.md 正文
     Skill 觸發時載入（目標 1500-2000 words，上限 <5k）
     用途：核心流程 + 決策樹 + 資源索引

L2 — references/ + examples/ + scripts/
     按需讀取（unlimited size）
     用途：詳細 API 文件、範例、工具腳本
```

### buildSkillContext 截斷規則

`buildSkillContext(agentName, pluginRoot, options)` 在 PreToolUse hook 中執行，將 skill 知識注入 agent 的 `updatedInput`：

- **maxCharsPerSkill**：每個 skill 最多擷取 **800 chars**（預設值）
- **maxTotalChars**：所有 skill 合計上限 **2400 chars**（預設值）
- 截斷格式：`body.slice(0, maxCharsPerSkill) + '...（已截斷）'`
- 達到總上限後停止載入後續 skill
- 注入格式：`[Skill 知識摘要]\n\n--- {skillName} ---\n{body}`

**設計含義**：SKILL.md 正文的前 800 個字元最為關鍵 — 應將核心決策樹和最重要的索引放在最前面。

### SKILL.md 正文設計原則

放入 SKILL.md（每次 skill 觸發時都會載入）：
- 核心概念簡介（2-3 句話）
- 消費者表格（哪些 agent 使用、用途）
- 決策樹（遇到什麼問題查什麼 reference）
- 資源索引（references/ 的完整清單）
- 最常見的使用場景

移到 references/（按需讀取）：
- 詳細 API 說明
- 完整的範例和 code snippets
- 邊界情況和疑難排解
- Migration guide

---

## 4. 消費者關係

### Agent 如何消費 Skill

1. **Agent frontmatter 宣告 skills 陣列**：

```yaml
---
name: developer
model: claude-sonnet-4-6
skills:
  - craft
  - commit-convention
  - testing
---
```

2. **PreToolUse hook 執行 buildSkillContext**，從 agent .md 讀取 skills 陣列，載入對應 SKILL.md 正文（截斷至 800 chars），組合後注入 Task subagent 的 `updatedInput.prompt`。

3. **knowledge-gap-detector** 掃描 prompt 關鍵詞，偵測 agent 尚未具備的 knowledge domain，在 PreToolUse hook 中插入 gap 警告訊息。

### Skill 注入流程

```
PreToolUse(Task)
  │
  ├─ buildSkillContext(agentName, pluginRoot)
  │    ├─ 讀取 agents/{agentName}.md frontmatter.skills
  │    ├─ 對每個 skill 讀取 SKILL.md，去掉 frontmatter 保留正文
  │    ├─ 截取前 800 chars，總上限 2400 chars
  │    └─ 回傳 "[Skill 知識摘要]\n\n--- skill-name ---\n{body}"
  │
  └─ updatedInput = { ...toolInput, prompt: skillContext + originalPrompt }
```

注意：`updatedInput` 是 **REPLACE**，不是 MERGE — 必須保留所有原始欄位。

---

## 5. Overtone Knowledge Domain 慣例

Overtone 有 14+1 個 knowledge domain，每個都遵循相同的結構慣例。

### 命名慣例

| 名稱 | 說明 |
|------|------|
| `testing` | 測試策略和測試框架 |
| `workflow-core` | Overtone 工作流核心機制 |
| `security-kb` | 安全知識庫（OWASP Top 10） |
| `database` | 資料庫設計和查詢 |
| `dead-code` | 死碼偵測和清理 |
| `commit-convention` | Conventional commit 規範 |
| `code-review` | 程式碼審查標準 |
| `wording` | 措詞正確性和 UI 文案 |
| `debugging` | 診斷和除錯策略 |
| `architecture` | 架構設計模式 |
| `build-system` | 建置系統配置 |
| `os-control` | OS 操控能力 |
| `autonomous-control` | 自主控制和佇列管理 |
| `craft` | Clean Code + SOLID + 重構手法 |
| `claude-dev` | Claude Code plugin 開發知識 |

### Knowledge Domain SKILL.md 固定結構

```markdown
---
name: domain-name
description: 一句話說明，含關鍵詞但不需要 user-invocable trigger phrases
disable-model-invocation: true
user-invocable: false
---

# Domain 知識域（副標題）

> 來源：知識來源（書籍、官方文件、規格等）

## 消費者

| Agent | 用途 |
|-------|------|
| developer | ... |
| code-reviewer | ... |

## 決策樹：何時查閱哪個參考？（可選）

```
問題類型
  ├── 情況 A → reference-a.md
  └── 情況 B → reference-b.md
```

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/{name}/references/guide.md` | ... |
```

### 關鍵 Frontmatter 設定

Knowledge domain 必須設定：

```yaml
disable-model-invocation: true   # 不觸發 model invocation，僅作知識注入
user-invocable: false            # 使用者不能直接 /domain-name 觸發
```

### 路徑前綴慣例

References 路徑使用 `${CLAUDE_PLUGIN_ROOT}` 前綴（不硬編碼絕對路徑）：

```markdown
💡 `${CLAUDE_PLUGIN_ROOT}/skills/craft/references/clean-code-rules.md`
```

---

## 6. manage-component.js 用法

### 建立 Skill

```bash
bun scripts/manage-component.js create skill '{
  "name": "my-skill",
  "description": "This skill should be used when...",
  "disable-model-invocation": true,
  "user-invocable": false,
  "body": "# My Skill\n\n## 消費者\n\n..."
}'
```

這會：
1. 在 `${CLAUDE_PLUGIN_ROOT}/skills/my-skill/` 建立目錄
2. 寫入 SKILL.md（frontmatter + body）
3. 更新 plugin.json 版本

### 更新 SKILL.md

```bash
# 更新 description
bun scripts/manage-component.js update skill my-skill '{"description":"新描述"}'

# 更新 body（正文）
bun scripts/manage-component.js update skill my-skill '{"body":"# 新內容..."}'
```

注意：SKILL.md 受 pre-edit-guard 保護 — 直接用 Write/Edit 工具會被阻擋，必須透過 manage-component.js。

### 直接建立 References

References 目錄**不受** pre-edit-guard 保護，可直接操作：

```bash
# 建立 references 目錄（如果不存在）
mkdir -p plugins/overtone/skills/my-skill/references/

# 直接用 Write 工具建立 .md 檔案
# Write 工具路徑：${CLAUDE_PLUGIN_ROOT}/skills/my-skill/references/guide.md
```

### 版本管理

```bash
# 手動 patch 版本 +1
bun scripts/manage-component.js bump-version

# 指定版本
bun scripts/manage-component.js bump-version 1.0.0
```

---

## 7. 常見錯誤和注意事項

### SKILL.md 正文前 800 chars 最重要

buildSkillContext 只擷取正文前 800 chars 注入 agent context。關鍵資訊（決策樹、消費者表、資源索引）應放在正文最前面。

### 避免在 SKILL.md 重複 references 的內容

資訊應該只在一個地方存在。SKILL.md 放**指向**和**摘要**，details 放 references/。

### 多個 Skill 的總量限制

一個 agent 的所有 skills 合計不超過 2400 chars 進入 context。如果 agent 有 3 個以上的 skills，每個 skill 的前 800 chars 必須足夠精煉，能傳達核心價值。

### disable-model-invocation 的含義

Knowledge domain 設定 `disable-model-invocation: true` 表示 Claude Code 不會因為匹配到這個 skill 而啟動一個新的 model invocation。Skill 的內容純粹作為知識注入到現有的 agent context 中。
