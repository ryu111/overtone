# 目標場景研究記錄

> 每輪搜尋一個場景的相關技術，評估整合價值。

---

## R1 — 場景二：能力自動生長（2026-03-17）

### 搜尋主題

Self-evolving AI agents、automatic skill/tool creation、quality gate patterns、confidence thresholds

### 發現摘要

#### 1. SICA（Self-Improving Coding Agent）— ICLR 2025

**核心概念**：Agent 直接編輯自己的原始碼來改善自己。消除 meta-agent 和 target-agent 的區分。

**機制**：
- 維護一個 **archive**（歷史 agent 版本 + benchmark 結果）
- 每輪取 archive 中最佳版本作為 meta-agent
- Meta-agent 審查 archive，提出改善 → 修改自己的程式碼（prompts、heuristics、架構）
- 重新評估，保留改善的版本

**效果**：SWE-Bench 上 17-53% 效能提升，有時同時降低成本和時間。

**與 Nova 的關聯**：
- Nova 的 Skill Lifecycle 已有類似架構（Learner 觀察 → Forge 生成 → Judge 評估 → Deploy）
- SICA 的 **archive pattern** 值得借鑑 — 我們的 `lifecycle.jsonl` 類似 archive，但缺少「取最佳版本作為基礎」的機制
- **自我編輯**概念對應 `improveSkill()` — 但 SICA 更激進（改自己的程式碼，不只改 Skill）

**整合評估**：⚠️ 中等價值
- archive 排名機制可加入 lifecycle-orchestrator（forge 前先查是否有歷史更優版本）
- 自我程式碼編輯太激進，Nova 目前用 Skill/Rule 作為進化單位更安全

#### 2. EvoAgentX — 自動進化 Agentic Workflows

**核心概念**：5 層架構（基礎元件 → Agent → Workflow → 進化 → 評估），自動生成和優化多 agent 工作流。

**進化演算法**：
- **EvoPrompt**：feedback-driven prompt 進化
- **TextGrad**：用文字梯度優化 prompt
- **AFlow**：workflow 拓撲自動搜尋
- **SEW**：重排 workflow 節點、修改依賴、探索替代執行策略

**效果**：推理和程式碼生成 benchmark 提升 10%，GAIA 多 agent 任務提升 20%。

**與 Nova 的關聯**：
- Nova 的深度路由（D0-D4）是靜態拓撲 — EvoAgentX 的 SEW 可以動態調整
- EvoPrompt 對應 `improveSkill()` 但更系統化（用梯度而非單次 LLM 建議）
- 5 層架構和 Nova 的 Layer 1-5 有對應關係

**整合評估**：💡 低優先但有啟發
- SEW 的「重排節點」概念可以在 R4 時用於動態 MCP 組合
- EvoPrompt 的 feedback loop 可以強化 judge.js 的改善建議品質

#### 3. 品質閘門 Pattern（業界共識）

**核心概念**：Confidence threshold 作為自動處理 vs 人工審查的決策邊界。

**業界做法**：
- **分層閾值**：客戶面 agent 需 90%+ task completion，內部分類 agent 可接受 75%
- **Adaptive Confidence Gating**：95% threshold，減少 35% API overhead
- **Human-in-the-loop**：低於閾值時暫停等待人工確認

**與 Nova 的關聯**：
- Nova 的 Judge 用 100 分制 + A/B/C/D/F 等級，B 級（80 分）作為部署閾值
- 業界建議**分場景閾值** — hook 模組可能需要更高閾值（90 分 / A 級），因為影響所有 session
- **Adaptive gating** 概念：初次部署用高閾值，穩定後可降低（建立信任）

**整合評估**：✅ 高價值
- 分場景閾值可以立即加入 lifecycle-orchestrator
- 例：`hook` 類型 Skill 需 A 級（90 分），`knowledge` 類型需 B 級（80 分）

#### 4. Self-Challenging Agent Pattern

**核心概念**：LLM 同時扮演 challenger（出題）和 executor（解題），成功的解法成為訓練資料。

**與 Nova 的關聯**：
- Acid Test 是手動設計的端到端測試
- Self-Challenging 可以讓 Nova **自動生成** Acid Test 場景
- 結合 Judge 的評分：自動出題 → 自動解 → 自動評分 → 失敗的成為學習素材

**整合評估**：💡 R4 階段考慮
- 目前 Acid Test 是固定 6 phase，自動生成測試場景是下一步

### 可行動項目

| 優先序 | 項目 | 影響範圍 | 預估工作量 |
|:------:|------|---------|:---------:|
| 1 | 分場景品質閾值（hook=A, knowledge=B） | lifecycle-orchestrator.js | ~20 行 |
| 2 | Archive 排名機制（forge 前查歷史最佳版本） | lifecycle-orchestrator.js | ~30 行 |
| 3 | EvoPrompt feedback loop 強化 improveSkill | skill-forge.js | ~50 行 |
| 4 | Self-Challenging 自動 Acid Test 生成 | acid-test.js | R4 |

### 參考來源

- [SICA: A Self-Improving Coding Agent (ICLR 2025)](https://arxiv.org/abs/2504.15228)
- [SICA GitHub](https://github.com/MaximeRobeyns/self_improving_coding_agent)
- [EvoAgentX Framework](https://github.com/EvoAgentX/EvoAgentX)
- [EvoAgentX Paper](https://arxiv.org/html/2507.03616)
- [Awesome Self-Evolving Agents Survey](https://github.com/EvoAgentX/Awesome-Self-Evolving-Agents)
- [Comprehensive Survey: Self-Evolving AI Agents](https://arxiv.org/abs/2508.07407)
- [Quality Guardrails for AI Deployment (Galileo)](https://galileo.ai/blog/ai-deployment-quality-guardrails)
- [Adaptive Confidence Gating in Multi-Agent Collaboration](https://arxiv.org/html/2601.21469)
- [Why Your AI Agent Needs a Quality Gate](https://dev.to/yurukusa/why-your-ai-agent-needs-a-quality-gate-not-just-tests-42eo)
- [Yohei Nakajima: Better Ways to Build Self-Improving AI Agents](https://yoheinakajima.com/better-ways-to-build-self-improving-ai-agents/)
