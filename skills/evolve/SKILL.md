---
name: evolve
description: 分析 Instinct 觀察記錄，摘要知識積累狀態，建議或執行進化（Instinct → Skill/Agent）。
disable-model-invocation: false
---

# /ot:evolve — Instinct 知識進化

## 職責

分析 `observations.jsonl`，評估哪些 instinct 已達進化門檻，
引導 Main Agent 決定是否將累積的知識固化為 Skill 或 Agent。

## 何時使用

- 工作流完成後，想了解系統學到了什麼
- 懷疑有重複失敗的 pattern 值得關注
- 主動清理低信心觀察（週衰減）
- 決定是否將某類知識進化為 Skill

## 執行步驟

**步驟 1：取得當前 Session ID**
```bash
# Session ID 通常在工作流開始時初始化
# 可從 workflow.json 或環境中取得
```

**步驟 2：查看 Instinct 摘要**
```bash
node scripts/lib/instinct.js summarize {SESSION_ID}
```

輸出格式：
```json
{
  "total": 12,
  "applicable": 3,
  "byType": {
    "error_resolutions": 8,
    "tool_preferences": 4
  },
  "evolutionCandidates": {
    "skills": [
      { "tag": "npm-bun", "count": 6, "avgConfidence": 0.75 }
    ],
    "agents": []
  }
}
```

**步驟 3：執行衰減清理（可選）**
```bash
node scripts/lib/instinct.js decay {SESSION_ID}
```
> 對超過 7 天未更新的觀察施加 -0.02 衰減，並自動刪除信心 < 0.2 的觀察。

**步驟 4：查看可自動應用的 instinct**
```bash
node scripts/lib/instinct.js applicable {SESSION_ID}
```
> 列出信心 >= 0.7 的所有 instinct，這些已達到自動應用門檻。

**步驟 5：建議進化（若有候選）**

若 `evolutionCandidates.skills` 不為空，代表某個 tag 已累積足夠的高信心觀察，
可考慮將其知識固化為新的 Skill。

進化動作需**人工確認**，不自動執行：
1. 詳細閱讀該 tag 的所有觀察（`node scripts/lib/instinct.js query {SESSION_ID}`）
2. 判斷觀察描述的模式是否值得固化
3. 若是，手動在 `skills/` 目錄建立或更新對應的 SKILL.md

## 信心分數說明

| 值 | 意義 |
|:--:|------|
| 0.3 | 初始觀察（剛記錄） |
| 0.35-0.65 | 累積中（重複確認提升） |
| >= 0.7 | 可自動應用 |
| < 0.2 | 自動刪除（過時或被矛盾） |

信心變化：
- `+0.05` 每次確認（相同 pattern 再次出現）
- `-0.10` 遭遇矛盾觀察
- `-0.02` 每週衰減（未使用的知識會遺忘）

## 進化門檻

| 目標 | 條件 |
|------|------|
| Skill | 同 tag >= 5 個 instinct 且平均信心 >= 0.7 |
| Agent | 同 tag >= 8 個 instinct（含多步驟 pattern） |

## 限制

- ⛔ 不自動修改 `skills/` 或 `agents/` 目錄（需人工確認）
- 進化決策由 Main Agent 判斷，不強制執行
- V1 只收集 `error_resolutions` 和 `tool_preferences` 兩種 pattern
