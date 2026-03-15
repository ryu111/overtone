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

---

## R6 — 場景一深入：Session Resilience（2026-03-17）

### 搜尋主題

Session timeout recovery、claude --continue/--resume、agent checkpoint patterns、long-running task management

### 發現摘要

#### 1. Claude Code `--continue` / `--resume` — 原生支援

**核心發現**：Claude Code 已內建 session 延續功能！

- `claude --continue`：自動找到同目錄最近的 session 並延續
- `claude --resume <session-id>`：指定 session ID 延續
- 延續時 agent 保有完整上下文（已讀檔案、已做分析、已做決策）

**與 Nova 的關聯**：
- Nova 的 heartbeat 目前 spawn `claude -p`，timeout 後直接標失敗
- **應改為**：timeout 後用 `claude --continue` 或 `claude --resume <sid>` re-spawn 延續
- 需要從 stream-json 輸出中捕獲 session ID，存入 state file

**整合方案**：
```
第一次 spawn：claude -p --output-format stream-json → 記錄 session_id
如果 timeout 或 max turns：
  claude --resume <session_id> -p "繼續上次的任務" --output-format stream-json
  最多重試 3 次
全部失敗 → 標記任務失敗，建 Notion 修復任務
```

**整合評估**：✅ 最高價值
- 使用 Claude Code 原生功能，不需要自己做 checkpoint
- 預估 ~30 行改動（heartbeat.js executeTask）

#### 2. Agent State Checkpointing（業界模式）

**核心概念**：Checkpoint = graph state snapshot，包含：
- config + metadata
- state channel values（變數狀態）
- next nodes（下一步要執行什麼）
- task information（目標、已完成步驟、剩餘步驟）

**業界做法**：
- **LangGraph + DynamoDB**：每個 super-step 自動 checkpoint
- **Microsoft Agent Framework**：`save_checkpoint()` / `load_checkpoint()` API
- **Get-Shit-Done**：tracking file 跨 session 持久化，啟動時自動檢查未完成任務

**與 Nova 的關聯**：
- 由於 Claude Code 已有 `--resume`，Nova **不需要自己實作 checkpointing**
- 但 `--resume` 只保留 Claude 的內部上下文，不保留 Nova 的外部狀態（如「這是 Notion 任務 X」）
- Nova 需要的是**任務級別**的追蹤，不是 session 級別的 checkpoint

**整合評估**：💡 不需要自建
- Claude `--resume` 處理 session 層面
- Nova 的 heartbeat state file 處理任務層面（`activeTask`、`consecutiveFailures`）
- 兩層搭配已足夠

#### 3. KeepGoing MCP Server — 防止 Session 過早結束

**核心概念**：MCP server 注入「繼續工作」指令，防止 Claude Code 在任務未完成時停下。

**機制**：agent 的 system prompt 或 MCP 回應中注入「你還沒完成，繼續」的信號。

**與 Nova 的關聯**：
- Nova 的 heartbeat session 用 `-p`（單次 prompt），不需要持續互動
- 但如果任務複雜需要多輪，可以考慮在 buildPrompt 中加入「必須完成所有步驟才能退出」的強指令
- 目前 buildPrompt 已有類似指令（「如遇阻塞，記錄後退出」）

**整合評估**：💡 已有類似機制

#### 4. 背景 Agent + Async Workflows

**2025-2026 新功能**：Claude Code 支援 async agent execution — spawn sub-agent 後可以 background 執行。

**與 Nova 的關聯**：
- Nova 的 heartbeat 用外部 daemon spawn `claude -p`，本質上就是 async
- 新的 async 功能更適合**在 session 內**的並行（D4 多 executor），不是 heartbeat 的場景

**整合評估**：💡 R4 時考慮（D4 並行 executor 可用 async agents）

### 可行動項目

| 優先序 | 項目 | 影響範圍 | 預估工作量 |
|:------:|------|---------|:---------:|
| 1 | Session Resilience — timeout 後用 --resume re-spawn | heartbeat.js executeTask | ~30 行 |
| 2 | 捕獲 session_id 從 stream-json 輸出 | session-spawner.js parseStreamJson | ~10 行 |
| 3 | buildPrompt 強化「必須完成」指令 | session-spawner.js | ~5 行 |

### 參考來源

- [Claude Code: How It Works (Sessions)](https://code.claude.com/docs/en/how-claude-code-works)
- [Claude API: Work with Sessions](https://platform.claude.com/docs/en/agent-sdk/sessions)
- [Session Persistence in Claude Code](https://github.com/ruvnet/ruflo/wiki/session-persistence)
- [Claude Code Async Workflows](https://claudefa.st/blog/guide/agents/async-workflows)
- [Auto-Resume Agentic Tasks Discussion](https://github.com/AndyMik90/Auto-Claude/discussions/1851)
- [Agent State Checkpointing Guide](https://fast.io/resources/ai-agent-state-checkpointing/)
- [Durable AI Agents with LangGraph + DynamoDB](https://aws.amazon.com/blogs/database/build-durable-ai-agents-with-langgraph-and-amazon-dynamodb/)
- [Agent Tracking and Resume (DeepWiki)](https://deepwiki.com/glittercowboy/get-shit-done/5.8-agent-tracking-and-resume)
- [KeepGoing MCP Server](https://glama.ai/mcp/servers/keepgoing-dev/mcp-server)
- [AI Agent Context Management Breakthroughs](https://bytebridge.medium.com/ai-agents-context-management-breakthroughs-and-long-running-task-execution-d5cee32aeaa4)

---

## R7 — 跨場景綜合：業界框架對標（2026-03-17）

### 搜尋主題

Agent orchestration frameworks 2026、Claude Code hooks best practices、daemon + issue tracker integration

### 發現摘要

#### 1. OpenAI Symphony — 最接近 Nova 的開源框架（2026-03-05 發布）

**核心概念**：daemon 輪詢 issue tracker → spawn agent → 自主完成 → 提 PR。

**架構對比**：

| 維度 | Symphony | Nova |
|------|----------|------|
| Runtime | Elixir/BEAM | Bun/JS |
| 任務來源 | Linear（polling） | Notion（polling） |
| Agent | OpenAI models | Claude Code (`-p`) |
| 狀態管理 | PostgreSQL | JSONL files |
| 隔離 | 每任務獨立 workspace | 每 session 獨立 env |
| 完成驗證 | CI + tests + PR review | `bun test` + commit |
| 設定 | WORKFLOW.md（in-repo） | CLAUDE.md + rules/ |
| 併發 | BEAM supervision trees（數百個並行） | 單任務序列 |

**Nova 優於 Symphony 的**：
- **自我進化**：Learner → Skill Lifecycle → Judge（Symphony 無）
- **品質閘門**：分場景閾值、Judge 評分（Symphony 只靠 CI）
- **本地模型**：零 token 背景維護（Symphony 全用 OpenAI API）
- **行為學習**：跨 session 行為偵測、信心追蹤（Symphony 無）

**Symphony 優於 Nova 的**：
- **併發**：BEAM 天然支援數百個獨立 run，Nova 單任務序列
- **Proof of Work**：結構化的完成證據（CI status + test results + PR review + walkthrough）
- **WORKFLOW.md**：agent 行為設定版本化隨 branch，Nova 的 CLAUDE.md 是全域的
- **確定性 workspace**：每個 issue 有獨立目錄，防止並行衝突

**可借鑑項目**：

| # | 項目 | 影響場景 | 難度 |
|:-:|------|:-------:|:----:|
| 1 | **Proof of Work 結構化** — session 完成時輸出 {tests_passed, files_changed, commit_hash} | 場景一 | ~20 行 |
| 2 | **Per-task workspace** — heartbeat spawn 時 `--cwd` 指定任務專屬目錄 | 場景一 | ~15 行 |
| 3 | **WORKFLOW.md 分支化** — 不同 branch 可以有不同 agent 行為 | 場景三 | R4 |

#### 2. Claude Code 5-Layer QA System（社區最佳實踐）

**來源**：一位開發者在 68 次 Claude Code 失敗後建立的 5 層品質保障系統。

**5 層結構**：
1. **PreToolUse hooks** — 阻擋危險操作（≈ Nova Guards）
2. **PostToolUse hooks** — 自動修正（≈ Nova flow-observer）
3. **Stop hooks** — 完成前自動審查（≈ 無，Nova 缺這層）
4. **Notification hooks** — 需要人類注意時通知（≈ Nova notification.js）
5. **SessionEnd hooks** — 背景維護（≈ Nova maintainer/learner/judge）

**Nova 缺少的**：**Stop hook 自動審查** — session 結束前 spawn 一個 reviewer subagent 檢查變更。

**整合評估**：⚠️ 中等價值
- 在 Stop hook 加入「spawn reviewer 檢查本次 session 的 git diff」
- 但可能影響 session 結束時間（reviewer 需要 30-60 秒）

#### 3. Hook 優先序和多層配置

**2026 社區共識**：managed policies → global → project → plugin/skill hooks，按順序執行。

**與 Nova 的關聯**：
- Nova 的 hook 模組（guards, flow-observer, context-injector, notification, metrics）都在 server.js 統一 dispatch
- 目前沒有優先序概念 — 所有模組平等處理
- 如果未來加入 Stop hook reviewer，需要確保它在 maintainer/learner/judge 之前或之後執行

**整合評估**：💡 低優先（架構參考）

### 關鍵洞察

**Nova 的獨特定位**：在 2026 年的 agent 框架生態中，Nova 是少數同時具備以下三個特徵的系統：
1. **自我進化**（SICA/SkillRL 級別的 Skill Lifecycle）
2. **零成本維護**（本地模型背景 agent）
3. **行為學習**（Learner 信心追蹤 + 跨領域遷移）

Symphony 規模更大（併發、PostgreSQL、BEAM），但缺乏進化能力。Mission Control 更輕量但也缺乏學習能力。**Nova 的護城河是「學習 + 進化」**，不是「執行 + 調度」。

### 參考來源

- [OpenAI Symphony](https://github.com/openai/symphony)
- [Symphony SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md)
- [Symphony: From Issue to PR](https://www.heyuan110.com/posts/ai/2026-03-05-openai-symphony-autonomous-coding/)
- [Symphony HN Discussion](https://news.ycombinator.com/item?id=47252045)
- [5-Layer QA System (Issue #29795)](https://github.com/anthropics/claude-code/issues/29795)
- [Claude Code Hooks Guide 2026](https://www.pixelmojo.io/blogs/claude-code-hooks-production-quality-ci-cd-patterns)
- [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices)
- [Ruflo: Agent Orchestration for Claude](https://github.com/ruvnet/ruflo)

---

## R8 — 場景二深入：Skill 品質自動改善（2026-03-17）

### 搜尋主題

Prompt automatic optimization、DSPy/TextGrad、Self-Refine iterative refinement、self-critique pattern

### 發現摘要

#### 1. Self-Refine 三步迴圈（NeurIPS 2023，2025 驗證）

**核心概念**：generate → feedback → refine，重複直到滿意。

**效果**：
- 程式碼生成：CODEX 初始結果提升 13%（absolute）
- HumanEval：GPT-4 從 80% → 91%（+Reflexion pattern）

**與 Nova 的關聯**：
- Nova 的 `improveSkill()` 已是 Self-Refine 模式！（forge → judge feedback → improve → re-judge）
- 但 Nova 的 feedback 品質受限：只用 `generateImprovements()` 生成文字建議，不夠結構化
- Self-Refine 的最佳實踐：**feedback 應該是具體的、可操作的修改指令**，而非「建議改善可讀性」

**整合評估**：✅ 高價值（改善 feedback 品質）
- 修改 `generateImprovements` 的 prompt：要求模型回傳 `{line, issue, fix}` 結構化 JSON，而非自由文字
- 預估 ~15 行 prompt 改動

#### 2. DSPy — 宣告式 Prompt 編程

**核心概念**：不寫 prompt 字串，而是宣告模組（`Signature`），讓框架自動優化 prompt。

**關鍵特性**：
- **MIPROv2 optimizer**：生成指令 + few-shot 範例，用 Bayesian Optimization 搜尋最佳組合
- **Compile-time optimization**：部署前自動優化，不是 runtime

**與 Nova 的關聯**：
- Nova 的 `buildForgePrompt()` 和 `generateImprovements()` prompt 都是手寫字串
- DSPy 的理念啟發：prompt 應該是**可自動優化的**，不是一次寫死
- 但 DSPy 需要 Python + 訓練資料集，Nova 是 JS + 本地模型，直接整合成本太高

**整合評估**：💡 理念借鑑，不直接整合
- 可借鑑「few-shot 範例自動蒐集」：用歷史成功的 forge 結果作為下次 forge 的 few-shot
- 不需要 DSPy 框架，自己實作 few-shot 蒐集即可

#### 3. TextGrad — 文字梯度優化

**核心概念**：把 LLM 輸出視為「可微分」的，用 LLM 生成的 feedback 作為「梯度」來更新 prompt。

**效果**：2025 年 Nature 論文，驗證了文字梯度在實際任務中的有效性。

**與 Nova 的關聯**：
- Nova 的 judge → improve 迴圈本質上就是 TextGrad（評分差 → feedback → 修改）
- 差異：TextGrad 用數學框架系統化，Nova 用簡單的 if-else + LLM 呼叫
- **可借鑑**：TextGrad 的「梯度方向」概念 = 告訴模型「往哪個方向改」，而不只是「哪裡不好」

**整合評估**：⚠️ 中等價值
- 在 `generateImprovements` 的 prompt 中加入「方向指引」：不只說「分數低」，還說「需要加強 X 維度，因為 Y 維度已經夠好」

#### 4. Reflection Pattern — 自我審查

**2026 業界共識**：agent 在標記任務完成前，先自我審查一輪。

**與 Nova 的關聯**：
- Nova 的 Skill Lifecycle 已有 judge → improve 迴圈 ✅
- **缺少**：forge 生成後的**即時自我檢查**（在送 judge 前先讓模型自己看一遍）
- Reflection 的效果：加一步自我檢查可以避免明顯錯誤到達 judge，減少 improve 輪數

**整合評估**：⚠️ 中等價值
- 在 `forgeSkill` 完成後、送 judge 前，加一步 LLM self-review
- 可能減少 improve 輪數從 3 → 1-2

### 可行動項目

| 優先序 | 項目 | 影響範圍 | 預估工作量 |
|:------:|------|---------|:---------:|
| 1 | 結構化 feedback — `generateImprovements` 回傳 `{line, issue, fix}` JSON | judge.js | ~15 行 prompt |
| 2 | Few-shot 自動蒐集 — 歷史成功 forge 作為下次 few-shot | skill-forge.js | ~30 行 |
| 3 | 方向性梯度 — feedback 包含「加強哪個維度」指引 | judge.js | ~10 行 prompt |
| 4 | Forge 後 self-review（Reflection pattern） | lifecycle-orchestrator.js | ~20 行 |

### 參考來源

- [Self-Refine: Iterative Refinement with Self-Feedback (NeurIPS)](https://openreview.net/pdf?id=S37hOerQLB)
- [DSPy: Programming—not Prompting—LMs](https://github.com/stanfordnlp/dspy)
- [TextGrad: Automatic Differentiation via Text (Nature 2025)](https://medium.com/aiguys/textgrad-controlling-llm-behavior-via-text-2a82e2073d10)
- [metaTextGrad: Optimizing Language Model Optimizers](https://arxiv.org/html/2505.18524)
- [DSPy MIPROv2 Optimizer](https://dspy.ai/learn/optimization/optimizers/)
- [Reflection Pattern Guide](https://fast.io/resources/reflection-pattern-self-correcting-agents/)
- [Self-Refine Tutorial (LearnPrompting)](https://learnprompting.org/docs/advanced/self_criticism/self_refine)
- [Meta-Prompting Protocol](https://arxiv.org/html/2512.15053)

---

## R9 — 場景四深入：預測性自我修復（2026-03-17）

### 搜尋主題

Predictive anomaly detection、AIOps proactive remediation、error trend forecasting、preemptive repair

### 發現摘要

#### 1. AIOps 三階段模型：偵測 → 預測 → 預防

**業界共識**（Splunk、PagerDuty、LogicMonitor）：

| 階段 | 能力 | Nova 現狀 |
|:----:|------|:--------:|
| 偵測（Reactive） | 發生問題後偵測 | ✅ hook-errors.jsonl |
| 預測（Predictive） | 趨勢分析預測即將發生的問題 | ❌ |
| 預防（Proactive） | 問題發生前自動修復 | ❌ |

**關鍵技術**：
- 基線偏差偵測：學習正常行為基線，偏離時預警
- 時序預測：LSTM 或簡單的移動平均線預測未來趨勢
- 早期預警：問題升級前數小時到數天發出信號

**與 Nova 的關聯**：
- Nova 目前只做**階段 1**（偵測）：hookErrors ≥ 5 → 建 Notion 任務
- **缺少階段 2**：不追蹤錯誤率趨勢（如「過去 3 天 error rate 從 2/hr 升到 8/hr」）
- **缺少階段 3**：不能在問題惡化前預防（如「JSONL 增長率 → 預測何時讀取會劣化」）

**整合評估**：✅ 高價值（輕量版可行）
- 不需要 LSTM — 簡單的移動平均 + 趨勢斜率就足夠
- 在 maintainer Phase 1 collect 時計算 error rate 趨勢
- 趨勢上升且未達閾值時，在簡報中預警（而非等到 ≥ 5 才建任務）

#### 2. 輕量趨勢分析設計

**適合 Nova 的方案**（不用 ML 框架）：

```
// 過去 7 天的 hook error 日計數
const dailyCounts = [2, 3, 2, 5, 7, 4, 8]

// 簡單線性回歸斜率
const slope = linearSlope(dailyCounts)  // > 0 = 趨勢上升

// 預警邏輯
if (slope > 0.5 && latest < 5) {
  // 趨勢上升但未達建任務閾值 → 簡報預警
  briefing.push("⚠️ hook error 趨勢上升，預計 2 天內達到建任務閾值")
}
```

**資料來源**：
- hook-errors.jsonl 已有 timestamp，可以聚合為日計數
- scores.jsonl 已有歷史評分，可以偵測品質下降趨勢
- behaviors.jsonl 已有信心分數歷史

**整合評估**：✅ 可立即行動
- 在 maintainer.js collect 階段加入趨勢計算（~30 行）
- 在 generateBriefing 中加入趨勢預警（~15 行）

#### 3. 「修復後回饋」閉環

**AIOps 的完整迴路**：偵測 → 修復 → 驗證修復有效 → 更新偵測規則。

**Nova 缺少的環節**：
- 場景四目前：偵測 error → 建任務 → heartbeat 修復 → ✅ 完成
- 缺少：修復後**驗證 error rate 是否下降** + **更新偵測閾值**

**整合評估**：⚠️ 中等價值
- 在 completeTask 後追蹤 24h 的 error rate，確認修復有效
- 如果修復後 error rate 未下降 → 重新建立更高優先級的任務

### 可行動項目

| 優先序 | 項目 | 影響範圍 | 預估工作量 |
|:------:|------|---------|:---------:|
| 1 | 輕量趨勢分析 — 日計數 + 線性斜率 + 預警 | maintainer.js | ~45 行 |
| 2 | 品質趨勢預警 — scores.jsonl 連續 3 次下降 → 預警 | maintainer.js generateBriefing | ~15 行 |
| 3 | 修復效果追蹤 — 建任務 24h 後檢查 error rate 變化 | maintainer.js Phase 3c | ~30 行 |

### 參考來源

- [Splunk: AIOps Explained](https://www.splunk.com/en_us/blog/learn/aiops.html)
- [PagerDuty: ML for Incident Prediction](https://www.pagerduty.com/resources/aiops/learn/using-machine-learning-incident-prediction/)
- [LogicMonitor: Agentic AIOps Use Cases](https://www.logicmonitor.com/blog/agentic-aiops-use-cases)
- [Selector: AIOps 4 Components](https://www.selector.ai/learning-center/aiops-in-2025-4-components-and-4-key-capabilities/)
- [Quinnox: AIOps Predictive Analytics](https://www.quinnox.com/blogs/aiops-leverages-predictive-analytics-to-accelerate-incident-management-and-prevent-downtime/)
- [AI Anomaly Detection Guide](https://www.techmagic.co/blog/ai-anomaly-detection)
