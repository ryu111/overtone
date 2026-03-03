# Proposal

## 功能名稱

`level2-integration-phase2`

## 需求背景（Why）

- **問題**：Level 2 的學習引擎（grader、score-engine、failure-tracker、global-instinct）已完整建設，但 Level 1 的 agent 幾乎不消費學習數據。Phase 1 已完成最小閉環（gradedStages 擴大、failure 根因記錄、全域觀察注入 subagent），但 agent 個體仍無法在跨 session 之間積累個人經驗。
- **目標**：讓 agent 個體能跨 session 學習和進步。具體包含：(1) 更多 agent 具備跨 session 記憶能力、(2) agent 被委派時知道自己的歷史弱點、(3) grader 評分在 standard/full/secure workflow 中成為強制流程而非可選建議。
- **優先級**：Phase 1 已驗證閉環可行，Phase 2 是自然的深化步驟，能使學習迴路真正閉合。

## 使用者故事

```
身為 Main Agent
我想要被委派的 developer/tester/debugger/planner/architect 擁有跨 session 記憶
以便這些 agent 能積累個人經驗、辨識自己的弱點並主動改善
```

```
身為 Main Agent
我想要委派 agent 時，agent 能看到自己在這個 stage 的歷史表現（維度分數 + 最低維度）
以便 agent 知道自己需要特別補強哪個方向
```

```
身為 Main Agent
我想要在 standard/full/secure workflow 中，gradedStages agent 完成後系統強制要求委派 grader
以便品質評分真正成為 workflow 的一部分而非可遺漏的建議
```

## 範圍邊界

### 在範圍內（In Scope）

- 為 developer、tester、debugger、planner、architect 加入 `memory: local`（修改 agent .md frontmatter）
- 在 `pre-task.js` score context 中，將「stage-level 歷史表現」加入 agent 名稱標註，使 agent 理解這是針對自己的表現數據
- 在 `stop-message-builder.js` 中，根據 workflowType 決定 grader 用詞：standard/full/secure → `📋 MUST 委派 grader`；single/quick → 維持「建議委派 grader」
- 在 `registry-data.json` agentMemory 中新增 5 個 agent 的記憶設定（供 validate-agents.js 等工具校驗）

### 不在範圍內（Out of Scope）

- 評分資料結構改為 agent-level（目前 scores.jsonl 是 stage-level，不做架構變更）
- agent 記憶檔案的初始化內容（空白記憶是正常初始狀態）
- grader 強制委派的 hook 層面硬阻擋（只做 Main Agent 行為引導，不做 PreToolUse 阻擋）
- 移除舊有 score context 邏輯（只是加入 agent 名稱標註，不破壞現有行為）

## 子任務清單

依照執行順序：

1. **為 5 個 agent 加入 `memory: local`**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/agents/developer.md`、`plugins/overtone/agents/tester.md`、`plugins/overtone/agents/debugger.md`、`plugins/overtone/agents/planner.md`、`plugins/overtone/agents/architect.md`
   - 說明：使用 `bun scripts/manage-component.js update agent {name} '{"memory":"local"}'` 更新每個 agent 的 frontmatter，並在 agent .md 內文補充「跨 Session 記憶」說明段落（參考 code-reviewer.md 格式）

2. **更新 registry-data.json agentMemory 欄位**（可與 1 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/registry-data.json`
   - 說明：在 `agentMemory` 物件中新增 developer、tester、debugger、planner、architect 5 個條目（值為 "local"）。注意：registry-data.json 受 PreToolUse(Write/Edit) guard 保護，需使用 `manage-component.js` 或其他允許的方式修改

3. **pre-task.js score context 加入 agent 標註**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/tool/pre-task.js`
   - 說明：在 score context 組裝邏輯中，將標題 `[品質歷史 — ${targetStage}（${summary.sessionCount} 筆）]` 改為 `[品質歷史 — ${agentName}@${targetStage}（${summary.sessionCount} 筆）]`，讓 agent 清楚知道這是針對自己 agent 名稱在此 stage 的歷史表現

4. **stop-message-builder.js grader 強制化**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/stop-message-builder.js`
   - 說明：在 grader 評分建議那一行，根據 `workflowType` 判斷：若為 `standard`、`full`、`secure`（或其 product 變體 `product`、`product-full`），改為 `📋 MUST 委派 grader 評分：...`；其他 workflow（single、quick 等）維持 `建議委派 grader 評分：...`

任務 1、2 可並行（操作不同檔案）；任務 3、4 可並行（操作不同檔案）；1、2 完成後才進行 3、4（需要確認 manage-component.js 修改方式）。

實際上 1、2、3、4 操作的檔案完全不同，無邏輯依賴，可全部並行。

## 開放問題

- registry-data.json 受 Write/Edit guard 保護，需確認 manage-component.js 是否支援直接更新 agentMemory 欄位，或是否有其他允許的路徑（architect 決定）
- score context 目前是 stage-level 均值，標題改為 `agent@stage` 後語意上更精確，但資料本身仍是 stage-level（所有同 stage agent 共享），是否需要在說明文字中加入「此為 stage 整體平均，非個人歷史」的備注（architect 決定）
- grader 強制化的 workflow 清單：是否包含 `product`（`PM → PLAN → ARCH → ... → DOCS`）和 `product-full`？兩者含 PLAN/ARCH/DEV 等 gradedStages，邏輯上應納入（建議納入，architect 確認）
