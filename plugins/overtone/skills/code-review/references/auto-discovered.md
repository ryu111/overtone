---
## 2026-03-05 | doc-updater:DOCS Context
Failure Tracker 精確度改善功能（commit 023aa83）的文件同步。DEV 階段開發完成、CODE REVIEW 階段已 reject（設計誤解），進入 RETRO 階段後需要同步文件。
Keywords: failure, tracker, commit, code, review, reject, retro
---
## 2026-03-05 | developer:DEV Findings
- 目前僅有 3 個歧義詞（refactor、solid、design pattern），均跨 `code-review` 和 `craft` 兩個 domain
- `_buildAmbiguousKeywords()` 函式從 `skill-router.js` 直接移植，邏輯完全一致，模組級快取避免重複計算
- `minTotalHits`（預設 2）採「非歧義詞命中數」作為門檻，歧義詞只貢獻 score 不貢獻 hits
- 現有 16 個測試全部通過，新增 6 個測試驗證歧義詞場景，共 22 個
Keywords: refactor, solid, design, pattern, code, review, craft, domain, skill, router
---
## 2026-03-06 | retrospective:RETRO Findings
**回顧摘要**：

- 六維度分數門檻機制設計清晰：雙觸發邏輯（條件 A = 信心門檻，條件 B = 維度低分）各自獨立，任一觸發即輸出 ISSUES，邏輯正確。
- quick workflow 排除明確：第 47 行、第 60 行、第 103 行三處一致強調 quick 的六維度評估為選用且門檻不觸發 ISSUES，無矛盾。
- 誤判防護完整：第 101-104 行新增兩條防護針對已知邊界情況（PASS 語意更新、2/5 舉證說明），覆蓋了常見誤判場景。
- 停止條件第 165-166 行與雙觸發邏輯一致，standard/full/secure 的條件括號說明明確。
- code-reviewer 標注的 3 個 Minor 均不阻擋：(1) ISSUES 模板 Context 行（第 144 行）仍用舊描述「信心 ≥70%」，未同步雙觸發；(2) frontmatter description（第 3 行）未提及門檻；(3) 信心門檻章節（第 31 行）「只」字與雙觸發表面矛盾。此三點均為文件措辭的輕微不一致，不影響 agent 行為決策。
- 跨階段觀察：DEV 與 REVIEW 的判斷一致，修改範圍集中於單一 agent 檔案，無跨模組架構影響，無遺漏的相依元件需更新。
Keywords: issues, quick, workflow, pass, standard, full, secure, code, reviewer, minor
---
## 2026-03-06 | retrospective:RETRO Findings
**回顧摘要**：

本次迭代目標為三個中風險 handler 補強測試覆蓋至 15%+。DEV 共新增 103 個測試，code-reviewer 全程 APPROVE 且無 Critical/Major issue，品質目標達成。

**確認的品質點**：

1. 三個測試檔案均採用「純函數單元測試 + 整合測試」雙層結構，符合 Humble Object 模式的設計初衷。純函數測試快速、確定性高；整合測試覆蓋真實 I/O 路徑，形成良好互補。

2. session-stop-handler 的測試設計對業務邊界的覆蓋尤其完整：手動退出（stopped）、max iterations（100）、連續錯誤、PM stage 不阻擋、loop 繼續、workflow 完成（含/不含失敗 stage）六種主要路徑都有對應測試，業務語意清晰。

3. pre-compact-handler 的 20 個 Scenario 編號統一，測試意圖一目瞭然。尤其 pendingAction fix-reject / fix-fail 兩種 type 的覆蓋（Scenario 14-16）是以往測試中較少見的細節，顯示對業務邏輯的深入理解。

4. session-end-handler 的 `resolveSessionResult` 測試（Feature 5-6 + Feature 6 補充）正確處理 `workflowType` 空字串、`completedStages` 為 null、單元素等邊界條件，覆蓋完整度優於常見實踐。

5. 資源清理機制一致：三個測試檔案均設置 `afterAll` / `afterEach` 清理臨時 session 目錄，無垃圾遺留風險。

6. `_isRelatedQueueItem` 的正規化邏輯（大小寫不敏感 + 底線/空白/連字號等效）有對應邊界測試，與 handler 實作邏輯完全對照，測試設計緊扣實作細節。

**原始碼對照發現**：

session-stop-handler.js 中存在多段動態 `require`（`specs`、`tts-strategy`、`execution-queue`、`specs-archive-scanner`），這些路徑未被任何測試覆蓋。這是合理的設計取捨（副作用路徑難以單元測試，且已被 try/catch 隔離），並非本次目標範圍，信心未達 70% 的問題門檻。

session-end-handler.js 的主流程包含六個獨立的 try/catch 區塊（global-instinct 畢業、instinct 衰減、intent_journal 配對、觀察效果反饋、baseline-tracker、session-digest），測試檔僅驗證整體回傳格式和 loop.json 狀態。這些副作用路徑的測試空白是既有技術債，本次迭代選擇集中測試 `resolveSessionResult` 純函數和 `handleSessionEnd` 基礎行為，策略上合理。
Keywords: handler, code, reviewer, approve, critical, major, issue, humble, object, session
---
## 2026-03-06 | retrospective:RETRO Context
ISSUES — 發現 2 個值得優化的問題（信心 ≥70%）。

7 次迭代整體成果顯著：測試從 4417 增至 4613（+196），handler 測試密度從 5.2% 升至 12.8%，agent memory/BDD 覆蓋率大幅提升。本次（第 7 次）4 個 handler 測試檔案 148 tests 全數通過，code-reviewer 給出 APPROVE。

然而，全套測試跑完後發現 2 個既有測試失敗，且這 2 個失敗測試在本次迭代引入的改變後未被更新，屬於跨階段一致性問題，在本次 DEV + REVIEW 階段未被察覺。

---
Keywords: issues, handler, agent, memory, tests, code, reviewer, approve, review
---
## 2026-03-07 | code-reviewer:REVIEW Findings
[n] 格式：`code-reviewer.md` frontmatter 後多了一個空行（第 20-21 行連續兩個空行）。不影響功能。
Keywords: code, reviewer, frontmatter
---
## 2026-03-07 | architect:ARCH Findings
**技術方案**：
- 純文字/Markdown 修改，5 個檔案，無程式碼變動
- 新增欄位「Exit Criteria」置於 Open Questions 之前（符合現有語意流）
- DEV/REVIEW 各 5 項（最高風險 stage），ARCH/PLAN 各 3 項（精簡）
- Main Agent 對未勾選項目規則：📋 MUST 以 AskUserQuestion 詢問使用者是否繼續或退回（與 Open Questions 處理邏輯對齊）

**關鍵技術決策**：
- Exit Criteria 強制程度：AI 自我聲明（非 hook 強制）
- checklist 措詞：「已確認 X」開頭（確定性動詞），不用語意模糊的「是否」
- code-reviewer.md 兩種格式（APPROVE/REJECT）都加 Review Checklist，確保格式一致且審查覆蓋面可追溯

**API 介面**：無（純 Markdown 格式定義）

**資料模型**：無新增資料模型

**檔案結構**：
- 修改：`plugins/overtone/skills/workflow-core/references/handoff-protocol.md` — 新增 Exit Criteria 欄位定義 + Main Agent 規則
- 修改：`plugins/overtone/agents/developer.md` — Test Scope 後加入 5 項 DEV Exit Criteria
- 修改：`plugins/overtone/agents/code-reviewer.md` — 兩種輸出格式加入 5 項 Review Checklist + 強化 DO 區塊
- 修改：`plugins/overtone/agents/architect.md` — Open Questions 前加入 3 項 ARCH Exit Criteria
- 修改：`plugins/overtone/agents/planner.md` — Open Questions 前加入 3 項 PLAN Exit Criteria

**Dev Phases**：

    ### Phase 1: handoff-protocol 欄位定義 (sequential)
    - [ ] 更新 handoff-protocol.md：新增 Exit Criteria 欄位規範 + Main Agent 未勾選項目處理規則 | files: plugins/overtone/skills/workflow-core/references/handoff-protocol.md

    ### Phase 2: 四個 agent 加入 Exit Criteria (parallel)
    - [ ] 更新 developer.md：DEV Exit Criteria 5 項 | files: plugins/overtone/agents/developer.md
    - [ ] 更新 code-reviewer.md：Review Checklist 5 項 + DO 強化 | files: plugins/overtone/agents/code-reviewer.md
    - [ ] 更新 architect.md：ARCH Exit Criteria 3 項 | files: plugins/overtone/agents/architect.md
    - [ ] 更新 planner.md：PLAN Exit Criteria 3 項 | files: plugins/overtone/agents/planner.md

**Edge Cases to Handle**：
- agent .md 受 pre-edit guard 保護，developer 必須用 `manage-component.js update agent <name>` 路徑修改，直接 Edit 會被 hook 阻擋 — 語意陷阱（看起來是普通 md 編輯，實際上受保護）
- handoff-protocol.md 是 `skills/workflow-core/references/` 下的檔案，pre-edit guard 保護的是 `skills/*/SKILL.md`（不含 references 子目錄），所以可直接 Edit — 需 developer 先確認保護範圍再決定路徑 — 語意陷阱
- code-reviewer.md 有兩個輸出格式區塊（APPROVE/REJECT），兩者都要加入 Review Checklist；若只加其中一個，格式不一致會造成 Main Agent 無法統一處理 — 資料邊界
- Exit Criteria 的「ARCH 版本」是 architect.md 本身的自我需求（也就是本次修改的目標之一），developer 修改 architect.md 時需確保加入的 checklist 與 design.md 中定義的 ARCH 3 項完全一致 — 狀態組合
Keywords: markdown, exit, criteria, open, questions, review, stage, arch, plan, main

---
## 2026-03-07 | tester:TEST:2 Findings
靜態驗證結果：27 passed, 0 failed

全量測試套件：4683 pass, 0 fail（20.5s，12 workers）— 無 regression

關鍵驗證項目確認：

1. **Exit Criteria 位置**：全部 5 個修改檔案中，Exit Criteria（或 Review Checklist）均在 Open Questions 之前 ✅
2. **checklist 格式**：所有 `- [ ]` 格式正確 ✅
3. **確定性動詞**：所有 checklist 項目以「已確認」「已執行」「已標注」「已定義」「已對照」「已做出」開頭 ✅
4. **code-reviewer.md 兩種格式**：PASS 和 REJECT 兩種輸出格式都有 Review Checklist，且 checklist 項目一致 ✅
Keywords: passed, failed, pass, fail, workers, regression, exit, criteria, review, checklist

---
## 2026-03-07 | developer:DEV Findings
1. **code-reviewer.md 兩處 `### Review Checklist` 改為 `### Exit Criteria`** — 透過 `manage-component.js` 的 `updateAgent` API 更新，符合 pre-edit-guard 的保護規則。同步後與 handoff-protocol.md、developer.md、architect.md、planner.md 命名一致。

2. **developer.md 結尾換行符修復** — 末尾原本缺少 `\n`，透過相同 API 修復（末尾現為 `0a`）。

3. **技術細節**：`updateAgent()` 是同步函數，不是 Promise — 不能用 `.then()`，直接接收返回值。
Keywords: code, reviewer, review, checklist, exit, criteria, manage, component, updateagent, edit

---
## 2026-03-07 | developer:DEV Context
修復 code-reviewer.md 的命名不一致問題，並修復 developer.md 的結尾換行符。這是 code-reviewer REJECT 回饋中的 [M] 等級問題修復。
Keywords: code, reviewer, developer, reject

