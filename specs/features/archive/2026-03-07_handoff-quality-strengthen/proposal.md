# Proposal: handoff-quality-strengthen

## 功能名稱

`handoff-quality-strengthen`

## 需求背景（Why）

- **問題**：agent 交接時常遺漏副作用同步。典型案例：health-check 新增一項偵測（數量 22→23），但 6 個測試檔案中 hardcoded 的數值沒有同步更新。現有的 impact-guard-sync 功能（DEV PASS 後注入影響範圍提醒）屬於「事後提醒」，無法在交接當下強制 agent 確認關鍵項目。
- **目標**：在每個 stage 的 Handoff 輸出格式中加入 stage-specific 的「完成驗收條件」區塊，讓 agent 在輸出 Handoff 前必須逐條確認，Main Agent 也能以此作為接受或退回 Handoff 的依據。
- **優先級**：DEV 和 REVIEW 是最常發生遺漏的兩個 stage（一個改了程式碼、一個審查時可能也沒注意副作用），優先強化這兩個。

## 使用者故事

```
身為 Main Agent
我想要每個 agent 的 Handoff 包含一個明確的「驗收清單」
以便我能夠確認 agent 的工作真的完整，而非只是輸出了文字描述
```

```
身為 Developer agent
我想要有一個結構化的 exit checklist 提醒我在交接前確認哪些副作用
以便不遺漏同步 hardcoded 數值、測試、引用等關鍵步驟
```

```
身為 Code Reviewer agent
我想要有一個結構化的 review checklist 確認我檢查了哪些面向
以便確保審查的完整性，不因為審查範圍太廣而遺漏副作用同步問題
```

## 範圍邊界

### 在範圍內（In Scope）

- 修改 `handoff-protocol.md`：新增「Exit Criteria」區塊定義，說明各 stage 的 checklist 格式和用途
- 修改 `developer.md`：在輸出格式中加入 `Exit Criteria` 區塊（3-5 項 stage-specific checklist）
- 修改 `code-reviewer.md`：在輸出格式中加入 `Review Checklist` 區塊（3-5 項 stage-specific checklist）
- 修改 `architect.md`：在輸出格式中加入 `Exit Criteria` 區塊（2-3 項 stage-specific checklist）
- 修改 `planner.md`：在輸出格式中加入 `Exit Criteria` 區塊（2-3 項 stage-specific checklist）
- 撰寫對應的 BDD 行為規格（architect → tester 用）

### 不在範圍內（Out of Scope）

- 程式碼層級的自動驗證（如 hook 自動掃描 Handoff 中是否含 Exit Criteria 區塊）— 這是「確定性可驗證」的部分，但引入新的 hook 邏輯超出本次範圍
- tester、debugger、doc-updater 等其他 agent 的 Handoff 格式修改 — 這些 agent 的遺漏風險較低，留到後續迭代
- 修改 stop-message-builder.js 或 agent-stop-handler.js — 本次只修改 agent prompt，不改 hook 邏輯

## 子任務清單

依照執行順序列出：

1. **更新 handoff-protocol.md — 定義 Exit Criteria 欄位規範**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/workflow-core/references/handoff-protocol.md`
   - 說明：新增第五個欄位 `Exit Criteria`（置於 Open Questions 之前），定義格式為 checklist（`- [x] 已確認 xxx` / `- [ ] 未確認 xxx`），說明各 stage 應有哪些項目類別（副作用同步、測試覆蓋、hardcoded 數值確認、引用同步等），並提供各 agent type 的範例

2. **更新 developer.md — 加入 DEV Exit Criteria**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/agents/developer.md`
   - 說明：在輸出格式的 `Test Scope` 區塊之後、`Open Questions` 之前加入 `Exit Criteria` 區塊，包含 3-5 項 DEV stage 專屬 checklist（包括：所有修改的 hardcoded 數值是否已同步、新增/修改計數類常數是否已更新測試斷言、`bun scripts/impact.js` 是否已執行確認影響範圍、修改的 API/介面是否有對應文件需要更新）

3. **更新 code-reviewer.md — 加入 REVIEW Checklist**（可與 2 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/agents/code-reviewer.md`
   - 說明：在 DO 區塊中強化 hardcoded 數值審查的指引（現有已有一條但不夠具體），在輸出格式的 `Open Questions` 之前加入 `Review Checklist` 區塊，包含 3-5 項 REVIEW stage 專屬 checklist（包括：是否執行了 impact.js 查詢依賴、是否確認修改涉及的計數/數值已同步更新所有引用、是否對照 BDD spec 逐條驗證）

4. **更新 architect.md — 加入 ARCH Exit Criteria**（可與 2、3 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/agents/architect.md`
   - 說明：在輸出格式的 `Open Questions` 之前加入 `Exit Criteria` 區塊，包含 2-3 項 ARCH stage 專屬 checklist（包括：所有受影響的現有元件是否已列在 Edge Cases、是否已查詢相關 patterns 確認設計符合現有慣例）

5. **更新 planner.md — 加入 PLAN Exit Criteria**（可與 2、3、4 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/agents/planner.md`
   - 說明：在輸出格式的 `Open Questions` 之前加入 `Exit Criteria` 區塊，包含 2-3 項 PLAN stage 專屬 checklist（包括：所有子任務是否符合 INVEST 原則、是否已確認依賴關係和並行可行性）

## 開放問題

- **Exit Criteria 的強制程度**：architect 需決定是「AI 自我聲明」（agent 自己填寫 checklist）還是「格式規則強制」（hook 檢查 Handoff 是否含 Exit Criteria 區塊）— 本提案傾向前者，降低 agent 負擔，但後者有更高的可靠性保證
- **Checklist 的粒度**：3 項 vs 5 項的取捨，更多項目增加遺漏保護但也增加 agent 認知負擔，architect 需定奪
- **是否修改 handoff-protocol.md 中的「Handoff 傳遞」區塊**：新增 Main Agent 應如何對待不完整的 Exit Criteria（如有未勾選項目是否應退回），architect 需判斷這個規則是否有必要
