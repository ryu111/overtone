# Agent API 完整參考

> Overtone agent 設定規範 + manage-component.js 操作指引

---

## 1. Frontmatter 欄位

```yaml
---
name: my-agent                    # 必填：唯一識別名
description: 一句話說明用途        # 必填：顯示在 pre-task hook 提示中
model: sonnet                     # 必填：opus / sonnet / haiku
permissionMode: bypassPermissions # 標準：所有 Overtone agent 使用此設定
color: yellow                     # 可選：顏色標籤（blue/cyan/green/yellow/red/purple/white）
maxTurns: 50                      # 可選：最大對話輪數（預設無限制）
memory: local                     # 可選：跨 session 記憶（local / off）
disallowedTools:                  # 可選：禁用工具清單
  - Task
skills:                           # 可選：knowledge domain skills（注入 pre-task context）
  - testing
  - commit-convention
---
```

---

## 2. skills 欄位工作原理

**三階段注入流程**：

1. PreToolUse(Task) hook 觸發 → 讀取 agent.md frontmatter 的 `skills` 陣列
2. `buildSkillContext(agentFile, pluginRoot)` 讀取每個 skill 的 SKILL.md 正文
3. 將摘要注入 `updatedInput.prompt`（Task subagent 的系統 prompt）

**截斷限制**：
- `maxCharsPerSkill = 800`（單個 skill 正文上限）
- `maxTotalChars = 2400`（所有 skill 摘要總長度上限）

超過限制時靜默截斷，不回傳 null（依舊回傳部分內容）。

---

## 3. manage-component.js 指令

**建立 agent**（同時更新 registry-data.json + plugin.json）：
```bash
bun scripts/manage-component.js create agent '{
  "name": "my-agent",
  "description": "說明",
  "model": "sonnet",
  "color": "blue",
  "stage": "MY_STAGE",
  "emoji": "🎯",
  "label": "My Agent",
  "maxTurns": 50,
  "body": "# 系統 prompt 內容..."
}'
```

**更新 agent**（skills 是 replace 不是 append）：
```bash
# 更新 model
bun scripts/manage-component.js update agent developer '{"model":"opus"}'

# 更新 skills（必須帶入完整陣列，會完全替換原有 skills）
bun scripts/manage-component.js update agent developer '{
  "skills": ["autonomous-control","commit-convention","wording","os-control","craft","claude-dev"]
}'
```

**⛔ 禁止直接編輯 `agents/*.md`** — pre-edit guard 會阻擋。

---

## 4. Overtone 系統 Prompt 四模式

所有 Overtone agent 的系統 prompt 採用四模式結構：

### 模式 1：信心過濾
明確定義「何時出手、何時不出手」，避免誤判。
```
當收到 [X] 時執行 [Y]
當輸入不含 [Z] 時直接跳過
```

### 模式 2：邊界清單（DO / DON'T）
```markdown
## DO（📋 MUST）
- 📋 閱讀完整 Handoff 再開始
- 💡 優先使用現有 utilities

## DON'T（⛔ NEVER）
- ⛔ 不可硬編碼 secrets
- ⛔ 不可修改測試
```

### 模式 3：誤判防護
針對常見誤判場景，加入明確說明。
```
REVIEW 輸出含 "REJECT" 文字 ≠ 一定是 reject 結果
SubagentStop 的 verdict 是 stage-specific（DEV 永遠 pass）
```

### 模式 4：停止條件
明確定義何時停止、何時繼續。
```
✅ 所有需求已實作 → 輸出 HANDOFF，停止
❌ 3 次修復失敗 → 在 Handoff 說明困難，交由人工判斷
```

---

## 5. Model 選擇策略

| Model | 適用場景 | 範例 agent |
|-------|----------|-----------|
| `opus` | 決策型：需要複雜推理、架構判斷 | planner、product-manager |
| `sonnet` | 執行型：實作、分析、中等複雜度 | developer、architect、tester |
| `haiku` | 輕量型：簡單記錄、格式轉換 | （目前 Overtone 較少使用）|

---

## 6. Overtone 特有設定

### bypassPermissions 標準
所有 Overtone agent 必須使用 `permissionMode: bypassPermissions`，讓 agent 可以自由執行 bash、讀寫檔案、呼叫工具。

### registry.js 是 Single Source of Truth
agent/stage/workflow/event 映射從 `scripts/lib/registry.js` import，不在 agent.md 中硬編碼。

### 元件閉環原則
新增 Skill 時：
1. 建立 SKILL.md（manage-component.js create skill）
2. 更新消費此 skill 的 agent frontmatter（manage-component.js update agent）
3. knowledge-gap-detector.js 加入對應 domain keywords
