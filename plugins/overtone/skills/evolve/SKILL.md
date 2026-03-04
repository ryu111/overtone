---
name: evolve
description: 分析 Instinct 觀察記錄，摘要知識積累狀態，建議或執行進化（Instinct → Skill/Agent）。
disable-model-invocation: false
---

# Evolve 知識域

> Instinct 觀察記錄的分析與進化管理

## 消費者

此 Skill 為 utility，由 /ot:evolve command 觸發，不綁定特定 agent。

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/evolve/references/confidence-scoring.md` | 信心分數計算方法：觀察頻率 + 一致性 + 跨 session 驗證 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/evolve/references/evolution-patterns.md` | 進化模式：Instinct→Skill→Agent 進化決策樹 + 時機判斷 |