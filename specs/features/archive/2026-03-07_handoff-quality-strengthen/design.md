# Design: handoff-quality-strengthen

## 技術摘要（What & Why）

- **方案**：純 prompt 修改 — 在 4 個 agent 的 Handoff 輸出格式中加入 stage-specific Exit Criteria checklist，並在 handoff-protocol.md 中新增對應的欄位定義和 Main Agent 處理規則
- **理由**：問題根源是 agent 輸出 Handoff 時沒有結構化的自我確認流程。在 prompt 層加入強制 checklist 是成本最低且最快見效的修正；hook 層的格式檢查屬於過度設計（需要新增 hook 邏輯、增加維護點），此次不引入
- **取捨**：AI 自我聲明比 hook 格式強制更脆弱（agent 可能填假勾選），但從觀察看問題多數是「沒提醒到」而非「故意跳過」，prompt 強化足以解決主要問題；hook 檢查留到後續若仍有高頻遺漏再補強

### Open Questions 決策

1. **Exit Criteria 強制程度**：選「AI 自我聲明」— 降低 agent 認知負擔，hook 格式強制超出本次範圍
2. **Checklist 項目數量**：
   - DEV / REVIEW：各 5 項（最高風險 stage，覆蓋面要廣）
   - ARCH / PLAN：各 3 項（較低風險，保持精簡）
3. **Main Agent 對未勾選項目的處理**：在 handoff-protocol.md 中明確定義 — 有未勾選項目時 Main Agent MUST 以 AskUserQuestion 詢問使用者是否繼續或退回重做（與現有 Open Questions 處理邏輯一致）

## API 介面設計

本功能為純 prompt 修改，無程式碼 API。

### Exit Criteria 欄位格式（Markdown）

```markdown
### Exit Criteria
- [x] 已確認 {驗收項目}
- [ ] 未確認 {待確認項目}
```

- 勾選 `[x]`：agent 已驗證該項目
- 未勾選 `[ ]`：agent 跳過或無法確認，需 Main Agent 介入

### Stage-Specific 項目定義

**DEV（5 項）**：
```
- [ ] bun scripts/impact.js <修改的檔案> 已執行，受影響元件已確認
- [ ] 所有 hardcoded 計數/數值（測試斷言中的數字、常數）已同步更新
- [ ] 新增/修改的功能有對應測試，且 bun test 全套通過
- [ ] 修改涉及的 API/介面/文件是否需要更新（如需，已更新）
- [ ] Handoff 中指定的所有需求已實作，無遺漏
```

**REVIEW（5 項）**：
```
- [ ] git diff 所有變更檔案已閱讀
- [ ] bun scripts/impact.js 已執行，確認依賴元件未受破壞
- [ ] 所有 hardcoded 計數/數值的引用（測試斷言、文件、常數）已確認同步
- [ ] 對照 BDD spec（若存在）逐條驗證行為符合規格
- [ ] 做出明確的 APPROVE / REQUEST CHANGES / REJECT 判定
```

**ARCH（3 項）**：
```
- [ ] 搜尋現有 codebase 確認設計符合現有 patterns（未引入新慣例）
- [ ] 所有受影響的現有元件已標注在 Edge Cases to Handle 區塊
- [ ] 設計選用最簡單能滿足需求的方案（無過度設計）
```

**PLAN（3 項）**：
```
- [ ] 所有子任務符合 INVEST 原則（可獨立、可估計、可測試）
- [ ] 依賴關係已分析，並行可行性已標明
- [ ] 範圍邊界明確（In Scope / Out of Scope 已定義）
```

## 資料模型

無新增資料模型。所有修改為 Markdown 文件中的文字格式定義。

## 檔案結構

```
修改的檔案：
  plugins/overtone/skills/workflow-core/references/handoff-protocol.md
    ← 修改：新增第五個欄位「Exit Criteria」定義 + Main Agent 對未勾選項目的處理規則

  plugins/overtone/agents/developer.md
    ← 修改：在輸出格式的 Test Scope 區塊之後、Open Questions 之前加入 Exit Criteria 區塊（5 項）

  plugins/overtone/agents/code-reviewer.md
    ← 修改：在 APPROVE/REJECT 兩種輸出格式的 Open Questions 之前加入 Review Checklist 區塊（5 項）；
             同步強化 DO 區塊中 hardcoded 數值審查的指引

  plugins/overtone/agents/architect.md
    ← 修改：在輸出格式的 Open Questions 之前加入 Exit Criteria 區塊（3 項）

  plugins/overtone/agents/planner.md
    ← 修改：在輸出格式的 Open Questions 之前加入 Exit Criteria 區塊（3 項）
```

## 關鍵技術決策

### 決策 1：Exit Criteria 欄位位置

- **選項 A**（選擇）：置於 Open Questions 之前 — 與現有欄位語意一致（先完成自我確認，再提問不確定事項），且不打斷 Handoff 的資訊流動順序
- **選項 B**（未選）：置於 Findings 之後 — 語意上略顯突兀，Findings 是描述性的，直接接 checklist 缺乏過渡

### 決策 2：APPROVE vs REJECT Handoff 格式是否都要加 Review Checklist

- **選項 A**（選擇）：兩種格式都加 — checklist 本身是「審查過程的紀錄」，不論結論如何都應有記錄，Main Agent 和後續 agent 也能看到審查覆蓋了哪些面向
- **選項 B**（未選）：只加在 APPROVE 格式 — REJECT 時 checklist 可能顯得多餘，但這會造成格式不一致，且 REJECT 時更需要記錄「什麼已確認、什麼沒確認」

### 決策 3：handoff-protocol.md Main Agent 規則的強度

- **選項 A**（選擇）：📋 MUST 以 AskUserQuestion 處理未勾選項目（與 Open Questions 規則對齊）— 強制人工介入，防止靜默跳過
- **選項 B**（未選）：Main Agent 自行判斷是否退回 — 留有彈性但也留有遺漏空間，不解決根本問題

## 實作注意事項

給 developer 的提醒：

- agent .md 受 pre-edit guard 保護，⛔ 不可直接 Edit 修改；必須使用 `manage-component.js update agent <name> '{"body": "...完整正文..."}'` 路徑
- 修改前必須先 Read 現有正文，在正確位置插入 Exit Criteria 區塊後傳入完整 body
- handoff-protocol.md 受 pre-edit guard 保護（skills/*/SKILL.md 或其 references）；但 handoff-protocol.md 是 references 目錄下的 md 檔，需確認保護範圍 — 若受保護則用 `manage-component.js update skill workflow-core`，若不受保護（只保護 SKILL.md）則直接 Edit
- 4 個 agent 的修改（tasks 2-5）不依賴彼此，可完全並行；handoff-protocol.md（task 1）應先完成，因為它定義了其他 4 個 agent 引用的格式規範
- Exit Criteria 項目措詞：用「已確認」/「已完成」開頭（確定性動詞），不用「是否」（語意模糊）
