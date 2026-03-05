# Debugging — 自動歸檔知識
---
## 2026-03-03 | developer:DEV Context
實作 level2-integration-phase2 — Agent 個體學習升級，包含三個子任務全部完成：

1. **子任務 1（Agent Memory）**：5 個執行型 agent（developer/tester/debugger/planner/architect）透過 `manage-component.js` 加入 `memory: local`，registry-data.json agentMemory 同步更新
2. **子任務 2（Score Context 個人化）**：pre-task.js 的 score context 標題格式從 `[品質歷史 — DEV（N 筆）]` 改為 `[品質歷史 — developer@DEV（N 筆）]`，使用現有的 `targetAgent` 變數
3. **子任務 3（Grader 強制化）**：stop-message-builder.js 依 workflowType 切換用詞，`MUST_GRADE_WORKFLOWS = ['standard', 'full', 'secure', 'product', 'product-full']`，符合規格的使用 `📋 MUST 委派 grader 評分`，其他保持 `🎯 建議委派 grader 評分`
Keywords: integration, agent, memory, developer, tester, debugger, planner, architect, manage, component
---
## 2026-03-03 | tester:TEST Findings
測試結果摘要 — **3047 passed, 0 failed**

BDD Scenario 覆蓋確認：

**Feature 1: Agent Memory（5 scenarios）— 全部 PASS**
- Scenario 1-1~1-4：developer/tester/debugger/planner/architect 五個 agent 的 `memory: local` frontmatter 已設定，registry-data.json 同步正確，body 包含「跨 Session 記憶」段落且格式與 code-reviewer.md 一致
- Scenario 1-5：platform-alignment-agents.test.js Feature S10 (109 tests) 全部通過

**Feature 2: Score Context 個人化（5 scenarios）— 全部 PASS**
- pre-task.js 第 328 行實作 `[品質歷史 — ${targetAgent}@${targetStage}（${summary.sessionCount} 筆）]`
- feedback-loop 整合測試（6 tests）全部通過，驗證標題格式、分數內容、空分數跳過、靜默降級

**Feature 3: Grader 強制化（10 scenarios）— 全部 PASS**
- stop-message-builder.test.js Feature 6（26 tests 中的 10 個 grader scenarios）全部通過
- standard/full/secure/product/product-full → MUST 強制用詞
- quick/single/null → 建議用詞（向後相容）
- DOCS stage / FAIL verdict → 不產生 grader 訊息

**Feature 4: 整合驗證（3 scenarios）— 全部 PASS**
- 全套 3047 pass，無任何回歸
Keywords: passed, failed, scenario, feature, agent, memory, scenarios, pass, developer, tester
---
## 2026-03-05 | tester:TEST Findings
定義了以下 Feature 和 Scenario：

1. **validate-agents.js 品質檢查全通過** — 執行後 0 個 prompt 品質警告，exit 0
2. **類型 A agent 誤判防護章節位置** — 6 個 agent（architect/debugger/developer/planner/retrospective/tester）的章節存在且位於 DON'T 後、輸入前
3. **類型 B agent 信心過濾 + 誤判防護** — build-error-resolver/designer/doc-updater/e2e-runner 同時具備兩個章節且順序正確
4. **類型 C agent 特殊信心門檻** — qa（≥80%）、refactor-cleaner（≥90%）、claude-developer（閉環確認）的不同門檻驗證
5. **security-reviewer 只加信心過濾** — 有信心過濾（含分級）但不需要誤判防護
6. **grader 精簡版三模式** — 包含三評分維度的信心過濾 + 誤判防護 + DON'T 邊界強化
7. **frontmatter 不變性** — 14 個 agent 的 name/model/permissionMode/color/maxTurns 等欄位不受修改影響
8. **原有 DO/DON'T 內容保留** — 類型 A 六個 agent 的既有邊界清單不被覆蓋
9. **結構驗證 0 errors** — validate-agents.js 的基礎驗證（非品質檢查）仍全通過
10. **章節順序規範** — DO → DON'T → 信心過濾 → 誤判防護 → 輸入 → 輸出 → 停止條件
11. **全量測試回歸** — bun test 後所有既有測試仍通過
Keywords: feature, scenario, validate, agents, prompt, exit, agent, architect, debugger, developer
---
## 2026-03-05 | code-reviewer:REVIEW Findings
**審查面向**：
- 章節順序（DO → DON'T → 信心過濾 → 誤判防護 → 輸入 → 輸出 → 停止條件）
- 內容品質（角色定制度、非通用模板）
- Frontmatter 完整性
- validate-agents.js 驗證
- BDD spec 逐 scenario 對照

**結果**：

[m] 格式偏差：BDD spec Scenario 2 要求「描述誤判情況的**表格**（至少 3 行）」，但類型 A 的 6 個 agent（architect、debugger、developer、planner、retrospective、tester）以及其他 agent 的誤判防護都使用 bullet list 而非 markdown table。設計規格（design.md）也明確指定了 `| 情況 | 正確處理 |` 的表格格式。功能上 bullet list 完全等效，validate-agents.js 也已通過，但與 BDD spec 字面描述不一致。作者自行決定是否調整。

[n] EOF 換行：7 個檔案（build-error-resolver、claude-developer、designer、e2e-runner、qa、refactor-cleaner、security-reviewer）修改後丟失尾部換行符（原本有 0x0a）。這是 manage-component.js 的寫入行為，不影響 agent prompt 功能。

[n] security-reviewer frontmatter 欄位順序：`memory: local` 從 `color:` 後移到 `disallowedTools:` 後。YAML 語意完全相同，不影響功能。

**正面發現**：
- 多個 agent 的 escaped backticks（`\`\`\``）被修正為正常 backticks，屬於正面修復
- grader 的 DON'T 格式從單行改為標準 `## DON'T（⛔ NEVER）` 結構，提升一致性
- 所有 15 個 agent 的內容都針對角色定制，無通用模板嫌疑
Keywords: frontmatter, validate, agents, spec, scenario, agent, architect, debugger, developer, planner
