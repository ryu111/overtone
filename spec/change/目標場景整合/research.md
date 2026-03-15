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

---

## R4 — 場景五：一句話永久生效（2026-03-17）

### 搜尋主題

Change impact analysis、configuration drift detection、multi-file codemod、rule propagation patterns

### 發現摘要

#### 1. RIVA — LLM Agent 設定漂移偵測（2026 論文）

**核心概念**：雙 agent 架構偵測 Infrastructure-as-Code 的設定漂移：
- **Verifier Agent**：檢查設定是否符合預期
- **Tool Generation Agent**：自動生成檢查工具
- 兩者透過**迭代交叉驗證**協作

**與 Nova 的關聯**：
- Nova 的場景五是「規則變更 → 影響分析 → 多檔案更新」
- RIVA 的**交叉驗證**概念可用於驗證更新後的一致性：更新完所有檔案後，用第二個 agent 確認「這些檔案現在都反映了新規則」
- 目前 Nova 的 impact-analyzer.js 只做**偵測**（grep 找引用），缺少**驗證**（更新後確認一致性）

**整合評估**：⚠️ 中等價值
- 加入 post-update 驗證步驟（更新後再跑一次 impact analysis，確認所有引用已同步）
- 不需要雙 agent，單次 re-scan 即可

#### 2. 呼叫圖（Call Graph）級影響分析

**核心概念**：不只搜尋文字引用，而是分析程式碼的呼叫圖和資料流，判斷哪些檔案**語意上**受影響。

**業界做法**：
- PR-level change impact analysis 結合 MSR（Mining Software Repositories）+ call graph
- 計算每個 PR 的 risk score（引用數 × 變更頻率 × 模組重要性）
- Field tracking diagrams 追蹤資料元素如何在程式間傳播

**與 Nova 的關聯**：
- Nova 的 impact-analyzer.js 用 grep（純文字搜尋），精確但有大量誤報（640 個結果太多）
- Call graph 分析需要 AST parser — 對 JS 可用 Babel 或 TypeScript compiler API
- **成本太高**：Nova 的 rules/skills 是 Markdown 和 JS 混合，AST 只能處理 JS 部分

**整合評估**：💡 低優先
- 目前 grep-based 足夠（Main Agent 看報告後人工判斷哪些要改）
- R4 階段如果跨領域檔案數量大增，再考慮 call graph

#### 3. Codemod / Moderne — 編譯器感知的批量修改

**核心概念**：
- **Codemod**：用「code graph」（比 AST 更高層的語意圖）描述程式碼結構，agent 在 graph 上操作
- **Moderne**：跨多 repo 的大規模 framework migration，用確定性自動化 + agent 輔助

**關鍵模式**：
- 先建 graph → 在 graph 上定義 transform → 批量 apply → 驗證
- 比逐檔 find-replace 更安全（理解語法結構，不會改到字串裡的同名文字）

**與 Nova 的關聯**：
- Nova 的場景五目前是「grep 找到 → 人工決定 → 逐檔改」
- Codemod 的「graph → transform → apply」模式可以簡化為：
  1. impact-analyzer 找到候選檔案（已有）
  2. 對每個候選用 LLM 判斷「這個引用需要改嗎」
  3. 需要改的用 LLM 生成具體修改
  4. 批量 apply + 跑測試驗證

**整合評估**：✅ 高價值（但是 R4 級別工作量）
- 步驟 2-3 需要 LLM（本地或 Claude API），不適合在品質強化 loop 中做
- 適合作為 R4 的 impact-analyzer v2

#### 4. 設定漂移的預防 vs 偵測

**業界共識**：
- **偵測型**（event-driven）：變更發生後掃描影響 — Nova 目前的做法
- **預防型**（constraint-based）：變更前驗證是否違反約束 — 更好但更難
- **版本化一切**：prompts、rules、configs 都有版本號，漂移 = 版本不一致

**與 Nova 的關聯**：
- Nova 的 rules/ 沒有版本號 — 改了一條 rule，其他引用它的地方不知道
- 簡單的預防措施：在 rules/ 加 `version` frontmatter，引用方寫 `rule@v2`，版本不一致時 maintainer 警告
- 這比 grep 搜尋更精確（只追蹤有版本標記的引用，而非所有文字匹配）

**整合評估**：⚠️ 中等價值
- 版本化 rules 是好方向但改動量大（所有 rules + 所有引用都要改）
- 目前 rules 數量少（14 個），手動管理可行
- R4 規模擴大後值得考慮

### 可行動項目

| 優先序 | 項目 | 影響範圍 | 預估工作量 |
|:------:|------|---------|:---------:|
| 1 | Post-update 驗證 — 更新後 re-scan 確認一致性 | impact-analyzer.js | ~20 行 |
| 2 | LLM 輔助判斷 — 候選檔案中哪些真的需要改 | impact-analyzer.js | R4 |
| 3 | Rule 版本化 — frontmatter version + 引用追蹤 | rules/*.md | R4 |
| 4 | Code graph 分析（JS AST） | 新模組 | R4 |

### 參考來源

- [RIVA: LLM Agents for Configuration Drift Detection](https://arxiv.org/abs/2603.02345)
- [Change Impact Analysis via Call Graphs (Springer)](https://link.springer.com/article/10.1007/s10664-024-10600-2)
- [Change Impact Analysis (Wikipedia)](https://en.wikipedia.org/wiki/Change_impact_analysis)
- [Codemod Platform](https://codemod.com/)
- [Moderne: Agent Tools for Code Migration](https://www.moderne.ai)
- [Zencoder: Repo Grokking for Multi-file Refactoring](https://zencoder.ai/blog/code-refactoring-tools)
- [Augment Code: AI for Large Codebases](https://www.augmentcode.com/tools/ai-coding-assistants-for-large-codebases-a-complete-guide)

---

## R5 — 場景三：新領域從零到穩定（2026-03-17）

### 搜尋主題

Cross-domain transfer learning、experience replay for agents、skill library evolution、end-to-end domain validation

### 發現摘要

#### 1. AgentRR（Record & Replay）— 2025 論文

**核心概念**：將經典的「錄製-重播」機制引入 AI agent：
1. **Record**：記錄 agent 與環境互動的 trace（工具呼叫、決策過程）
2. **Summarize**：將 trace 萃取為結構化「經驗」（workflow + constraints）
3. **Replay**：後續類似任務中，用這些經驗引導 agent 行為

**與 Nova 的關聯**：
- Nova 的 Learner 已做第 1 步（`extractSessionBehavior` 記錄 tool sequence）
- **缺少第 2 步**：trace 只萃取為「pattern 字串」（如 `Read→Grep→Edit`），不包含 workflow 邏輯和 constraints
- **缺少第 3 步**：經驗不會被注入後續 session 的 prompt（只有 briefing 提到行為，不提供重播指引）

**整合評估**：✅ 高價值
- 在 `extractSessionBehavior` 中增加 workflow 萃取（哪些工具按什麼順序、成功/失敗路徑）
- 在 `buildPrompt` 或 `context-injector` 中注入相關經驗作為 few-shot 範例
- 預估工作量：~80 行（跨 learner.js + context-injector.js）

#### 2. SkillRL — 遞迴 Skill 進化（2026 論文）

**核心概念**：Skill library 作為**動態元件**而非靜態知識庫。每個 validation epoch 後：
- 分析失敗模式 → 生成新 skill 或修正現有 skill
- Skill library 和 agent policy **共同進化**

**關鍵機制**：
- **Experience-based distillation**：將多樣化經驗蒸餾為結構化 skill
- **Failure-driven evolution**：失敗驅動進化（不只學成功的）
- **Recursive refinement**：skill 進化是遞迴的（改過的 skill 再用、再評、再改）

**與 Nova 的關聯**：
- Nova 的 Skill Lifecycle 已有「forge → judge → improve → deploy」，但只在**部署前**改善
- SkillRL 的理念是**部署後持續改善** — 觀察 skill 在實際使用中的表現，失敗時自動觸發改善
- 目前 Nova 的 Learner 追蹤行為但不追蹤「哪個 skill 被用了、效果如何」

**整合評估**：⚠️ 中等價值（R4 級別）
- 需要 skill 使用追蹤（哪個 agent 用了哪個 skill、結果如何）
- 需要 failure-driven 觸發（skill 被用但任務失敗 → 標記 skill 需改善）
- 架構上可行但工作量大

#### 3. Experience Inheritance（經驗繼承）

**核心概念**：agent 間的經驗顯式傳遞 — 決策 trace、skill、workflow 產物從一個 agent 傳給另一個。

**效果**：提升 sample efficiency、收斂速度、跨任務表現。

**與 Nova 的關聯**：
- Nova 的 heartbeat spawn 的 session 之間**沒有經驗傳遞** — 每個 session 從零開始
- `session-summaries.jsonl` 只是文字摘要，不是結構化的決策 trace
- **關鍵缺口**：spawn 的 session A 發現了修復模式 X，session B 遇到類似問題時不知道 X 的存在

**整合評估**：✅ 高價值
- 在 session 結束時萃取結構化經驗（不只摘要），寫入 `experiences.jsonl`
- buildPrompt 中注入相關經驗（按任務類型匹配）
- 這正是場景三「經驗遷移」的完整實作

#### 4. Agent Skills 架構趨勢（SoK 2026）

**業界共識**：
- Skills = 模組化的指令/程式碼/資源包，agent 按需載入
- 從 Anthropic Claude 2025 年底發起，現已全產業採用
- 關鍵轉變：從「所有知識都在模型 weights 裡」→「動態能力擴展不需重訓」

**與 Nova 的關聯**：
- Nova 的 Skill 架構完全符合業界趨勢（SKILL.md + references/）
- Nova 比業界**更進一步**的是自動 lifecycle（Learner → Forge → Judge → Deploy）
- 業界缺少但 Nova 有的：品質閘門（Judge B 級門檻）、自動改善迴圈

**整合評估**：💡 確認方向正確，無需行動

### 可行動項目

| 優先序 | 項目 | 影響範圍 | 預估工作量 |
|:------:|------|---------|:---------:|
| 1 | 結構化經驗萃取（AgentRR step 2） | learner.js | ~40 行 |
| 2 | 經驗注入 buildPrompt（AgentRR step 3） | session-spawner.js / context-injector.js | ~30 行 |
| 3 | Session 間經驗傳遞（experiences.jsonl） | heartbeat.js + context-injector.js | ~50 行 |
| 4 | Skill 使用追蹤 + failure-driven 進化（SkillRL） | learner.js + lifecycle | R4 |

### 參考來源

- [AgentRR: Record & Replay for LLM Agents](https://arxiv.org/abs/2505.17716)
- [SkillRL: Evolving Agents via Recursive Skill-Augmented RL](https://arxiv.org/html/2602.08234v1)
- [SoK: Agentic Skills — Beyond Tool Use](https://arxiv.org/html/2602.20867v1)
- [Agent Skills: Architecture, Acquisition, Security](https://arxiv.org/html/2602.12430v3)
- [Experience Inheritance in Multi-Agent Systems](https://www.emergentmind.com/topics/experience-inheritance-across-agents)
- [NGENT: Next-Gen AI Agents for AGI](https://arxiv.org/html/2504.21433v1)
- [Cross-Domain Knowledge Transfer in Large Models](https://www.intechopen.com/online-first/1209560)
- [Contextual Experience Replay for Continual Learning (ICLR 2025)](https://yitaoliu17.com/assets/pdf/ICLR_2025_CER.pdf)
