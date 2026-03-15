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

---

## R2 — 場景四：自我修復（2026-03-17）

### 搜尋主題

Self-healing software systems、autonomous bug repair agents、observability-driven auto-remediation、error pattern clustering

### 發現摘要

#### 1. 生物啟發的自我修復架構

**核心概念**：仿照人體免疫系統 — 偵測異常 → 診斷根因 → 執行修復 → 學習改善。

**四層架構**：
- **Anomaly Detection**：偏離預期行為的偵測
- **Automated Diagnosis**：推理或模式識別判定根因
- **Self-Repair**：執行程式碼修復或設定變更
- **Learning**：透過 feedback loop 改善未來回應

**與 Nova 的關聯**：
- Nova 場景四已有前 3 層（hook error 偵測 → maintainer 診斷 → heartbeat 修復）
- 第 4 層（Learning）= Learner 記錄反模式，但**缺少從修復結果回饋到偵測規則的閉環**
- 業界數據：40% IT 主管報告導入後停機時間減少，62% 在 18 個月內看到 ROI

**整合評估**：✅ 高價值
- 加入「修復後驗證 → 更新偵測規則」的回饋迴路（maintainer 修復成功 → 自動加入 hook error 白名單/修正閾值）

#### 2. RepairAgent — 自主 LLM 修復 Agent（ISSTA 2024）

**核心概念**：LLM 作為自主 agent，自由交錯執行三種動作：
1. **蒐集 bug 資訊**（讀日誌、trace）
2. **蒐集修復素材**（搜尋相關程式碼）
3. **驗證修復**（跑測試）

**關鍵設計**：不預設固定流程，agent 根據回饋自己決定下一步。在 Defects4J 上修復 164 個 bug，含 39 個前人未修的。

**與 Nova 的關聯**：
- Nova 的 heartbeat → spawn session 目前用固定 prompt（buildPrompt），session 內 Main Agent 自己決定修復策略
- RepairAgent 的「自由交錯」模式和 Nova 的深度路由（Main Agent 判斷 D-level）哲學一致
- **關鍵差異**：RepairAgent 有明確的 tool set（蒐集/素材/驗證），Nova 的 spawn session 沒有限制 tool set

**整合評估**：💡 中等價值
- 可以在 buildPrompt 中為修復任務加入 RepairAgent 的三步驟提示（「先讀 error log → 搜尋相關程式碼 → 修復後跑 bun test」）
- 不需要改架構，只需改 prompt

#### 3. 錯誤模式聚類（Error Pattern Clustering）

**核心概念**：AIOps 系統將大量錯誤事件聚類為「situations」，降噪後再分析。

**業界做法**：
- **BMC Helix AIOps**：ML 智慧事件聚類 + 噪音降低
- **Mezmo MCP Server**：去重、聚類、豐富化 telemetry → 再送 LLM 分析（避免用原始資料灌 LLM）
- **ScienceLogic Skylar**：ML 觀察 log 事件模式和異常

**與 Nova 的關聯**：
- Nova 的 `hook-errors.jsonl` 目前只做簡單統計（`summary[e.event]++`）
- **缺少聚類**：相同根因的不同錯誤訊息被當作不同事件
- Mezmo 的「先聚類再分析」模式直接適用 — 在送給本地模型前先做 error dedup

**整合評估**：✅ 高價值
- 在 maintainer.js Phase 3c 前加入 error clustering（同 event+phase 的合併、相似 message 的聚類）
- 避免為同一根因建立多個 Notion 任務

#### 4. 修復任務的深度提示強化

**來自 RepairAgent + SWE-bench 排行榜的啟發**：

排行榜上的系統（W&B Programmer、Blackbox AI、CodeStory）共同特徵：
1. 動態與本地環境互動（不只讀 error，還主動搜尋相關程式碼）
2. 迭代驗證修復結果（修 → 跑測試 → 不過 → 再修）
3. 結構化的修復流程（而非自由形式 prompt）

**整合評估**：✅ 可立即行動
- 強化 `buildPrompt` 的修復任務模板：加入 RepairAgent 的三步驟 + 迭代驗證指示

### 可行動項目

| 優先序 | 項目 | 影響範圍 | 預估工作量 |
|:------:|------|---------|:---------:|
| 1 | Error clustering — 相同根因合併，避免重複建 Notion 任務 | maintainer.js Phase 3c | ~30 行 |
| 2 | 修復任務 prompt 強化 — 加入三步驟 + 迭代驗證 | session-spawner.js buildPrompt | ~15 行 |
| 3 | 修復後回饋迴路 — 成功修復 → 更新偵測閾值 | maintainer.js | ~40 行 |
| 4 | Telemetry 預處理 — error dedup 後再送本地模型分析 | maintainer.js Phase 2 | ~25 行 |

### 參考來源

- [Self-Healing Software Systems: Lessons from Nature, Powered by AI](https://arxiv.org/abs/2504.20093)
- [RepairAgent: Autonomous LLM-Based Agent for Program Repair](https://arxiv.org/abs/2403.17134)
- [LLM-based Agents for Automated Bug Fixing: How Far Are We?](https://arxiv.org/abs/2411.10213)
- [Awesome LLM for Automated Program Repair](https://github.com/iSEngLab/AwesomeLLM4APR)
- [Lumigo Copilot AI: Automate RCA and Remediation](https://lumigo.io/blog/lumigo-copilot-ai-launches-to-automate-root-cause-analysis-and-remediation/)
- [Mezmo AI SRE for Root Cause Analysis](https://www.mezmo.com/blog/launching-an-agentic-sre-for-root-cause-analysis)
- [ScienceLogic Automated Root Cause Analysis](https://sciencelogic.com/articles/automated-root-cause-analysis)

---

## R3 — 場景一：無人值守任務執行（2026-03-17）

### 搜尋主題

Autonomous agent daemon patterns、claude -p headless mode、Notion webhooks vs polling、task queue orchestration

### 發現摘要

#### 1. Mission Control — 開源 Claude Code 任務管理

**核心概念**：背景 daemon 自動 poll tasks.json → spawn `claude -p` session → 併發控制 → 即時 dashboard。

**與 Nova 高度相似的架構**：
- Daemon polling loop（≈ Nova heartbeat.js）
- Task 狀態管理（pending → running → done）（≈ Nova Notion 待做→進行中→已完成）
- `claude -p` spawn with timeout（≈ Nova session-spawner.js）
- 併發限制（Nova 目前無此機制）

**Nova 缺少但 Mission Control 有的**：
1. **Session Resilience** — timeout 或 max turns 後自動 re-spawn 延續 session，進度保留在 subtasks 中
2. **Cost Tracking** — 每個 session 的 token 用量（input/output/cache read/cache creation）
3. **併發控制** — 限制同時跑的 agent 數量，防止機器過載
4. **Dashboard** — 即時監控所有 agent 狀態

**整合評估**：✅ 高價值（3 個可行動項目）
- Session Resilience 最重要 — heartbeat spawn 的 session timeout 後目前直接標失敗，應改為 re-spawn 延續
- Cost Tracking 可從 `claude -p --output-format stream-json` 的 token 資訊提取
- 併發控制簡單但必要 — 防止 heartbeat 同時 spawn 多個 session

#### 2. Notion Webhooks（2025 新功能）

**核心概念**：Notion 現在原生支援 Webhooks — database 變更時主動推送 HTTP POST，不需要 polling。

**對 Nova 的影響**：
- Nova heartbeat.js 目前用 **60 秒 polling**（每分鐘 query Notion API）
- Webhook 可以改為 **事件驅動** — 有新任務時 Notion 主動通知 nova-server
- 延遲從 0-60 秒降到 < 1 秒

**架構變更**：
```
目前：heartbeat.js（每 60s poll） → Notion API → 有任務 → spawn
Webhook：Notion → POST /webhook → nova-server → spawn
```

**整合評估**：⚠️ 中等價值
- 需要 nova-server 加 `/webhook` endpoint
- 需要 Notion 設定 webhook URL（需公網可達，或用 ngrok/cloudflare tunnel）
- Polling 對目前使用場景已足夠（60s 延遲可接受）
- **建議**：保留 polling 作為 fallback，webhook 作為可選加速

#### 3. Agent Task Queue（Block 公司）

**核心概念**：本地任務佇列，防止多個 agent 同時執行昂貴操作。

**機制**：
- 集中式鎖 — 同一時間只有一個 agent 可以執行
- 排隊等待 — 後來的任務自動排隊
- 防止 thrashing — 多 agent 並行時 CPU/memory 不會爆

**與 Nova 的關聯**：
- Nova 的 heartbeat + maintainer + learner + judge 理論上可能同時執行
- 目前用 lockfile 防重複啟動，但沒有**排隊**機制
- 如果未來加入多任務並行（heartbeat 同時處理 2+ 任務），需要 task queue

**整合評估**：💡 低優先
- 目前 heartbeat 是單任務序列執行，不需要 queue
- R4 跨領域多任務時再考慮

#### 4. Claude Code Headless Mode 最佳實踐（2025-2026）

**業界統計**：60%+ 企業團隊用 headless mode 做至少一個 CI/CD 工作流。

**最佳搭配**：
- `--allowedTools` — 預先允許特定工具，避免權限提示阻塞
- `--output-format stream-json` — 結構化輸出，包含 token 用量和結果
- hooks — 在 session 中注入行為規則

**與 Nova 的關聯**：
- Nova 的 `spawnSession` 已用 `stream-json` ✅
- **缺少** `--allowedTools` — heartbeat spawn 的 session 沒有預先放行工具，可能被權限提示卡住
- **缺少** `--dangerously-skip-permissions` 的替代方案 — 需要精細的 allowedTools 清單

**整合評估**：✅ 高價值
- 在 spawnSession 加 `--allowedTools` 參數（Read, Edit, Write, Bash, Glob, Grep）— 約 5 行改動
- 避免無人值守 session 被權限提示卡住

### 可行動項目

| 優先序 | 項目 | 影響範圍 | 預估工作量 |
|:------:|------|---------|:---------:|
| 1 | spawnSession 加 --allowedTools（防止權限卡住） | session-spawner.js | ~5 行 |
| 2 | Session Resilience — timeout 後 re-spawn 延續 | heartbeat.js | ~40 行 |
| 3 | Cost Tracking — 從 stream-json 提取 token 用量 | heartbeat.js | ~20 行 |
| 4 | 併發控制 — 限制同時 spawn 的 session 數量 | heartbeat.js | ~15 行 |
| 5 | Notion Webhook endpoint（可選加速） | server.js | ~30 行 |

### 參考來源

- [Mission Control (MeisnerDan)](https://github.com/MeisnerDan/mission-control)
- [Mission Control HN Discussion](https://news.ycombinator.com/item?id=47165602)
- [Swarm: Claude Code Dashboard](https://github.com/bschleifer/swarm)
- [Agent Task Queue (Block)](https://github.com/block/agent-task-queue)
- [Claude Code Headless Mode Docs](https://code.claude.com/docs/en/headless)
- [Notion Webhooks API](https://developers.notion.com/reference/webhooks)
- [Notion Webhooks Guide (2025)](https://softwareengineeringstandard.com/2025/08/31/notion-webhooks/)
- [Notion API Version 2025-09-03](https://developers.notion.com/docs/upgrade-guide-2025-09-03)
