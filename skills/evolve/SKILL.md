---
name: evolve
description: "[Phase 6] 手動觸發 Instinct 知識進化。目前尚未實作。"
disable-model-invocation: true
---

# Instinct 進化

⚠️ Instinct 系統將在 Phase 6 實作。

進化機制設計：
- 初始信心 0.3 → +0.05/確認 → -0.10/矛盾 → -0.02/週衰減
- >= 0.7 自動應用
- >= 5 instincts 同 tag → 進化為 Skill
- >= 8 instincts + 多步驟 → 進化為 Agent
