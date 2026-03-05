# Agent Prompt 四模式補齊 — 技術設計

## 技術摘要（What & Why）

- **方案**：直接使用 `manage-component.js update agent <name> '{"body": "..."}'` 更新 14 個 agent 的 prompt body
- **理由**：`updateAgent` 支援 `body` 欄位完整替換正文，同時保留 frontmatter；Edit 工具被 pre-edit guard 阻擋（agents/*.md 受保護）
- **取捨**：body 是整段替換（非 patch），developer 需讀取現有 body 後附加新章節；並行執行無 race condition（每個 agent 獨立檔案，atomicWrite 每次只寫一個檔案）

## 章節位置標準（標準化規則）

參考已完整的 agent（code-reviewer、database-reviewer、product-manager）：

| agent | 誤判防護位置 | 信心過濾位置 |
|-------|------------|------------|
| code-reviewer | DON'T 後、輸入前（L92 → L109 → L118） | DON'T 後（同區塊） |
| database-reviewer | DON'T 後、輸入前（L37 → L44 → L56 → L69） | DON'T 後（先信心過濾再誤判防護） |
| product-manager | 停止條件後（最末段） | DO 後（L108 → L118 → L126） |

**統一規則**（採用 database-reviewer 的模式，最一致）：

```
## DO
## DON'T
## 信心過濾（>80% 規則）   ← 若需新增
## 誤判防護                ← 若需新增
## 輸入
## 輸出
## 停止條件
```

理由：DON'T 之後、輸入之前是自然的「邊界說明」位置；停止條件是最終確認區塊，不摻雜其他內容。

## API 介面設計

### manage-component.js update agent

```bash
bun plugins/overtone/scripts/manage-component.js update agent <agentName> '<json>'
```

JSON 格式（body 欄位）：

```javascript
{
  "body": "<完整的 agent prompt 正文，從 # 標題開始到結尾>"
}
```

- `body` 是**完整替換**（非 patch）：developer 必須先 Read 現有檔案，在正確位置插入新章節後，將完整正文作為 `body` 值傳入
- frontmatter（YAML 頭部）不受 `body` 影響，完整保留
- 並行安全：每個 agent 獨立檔案，atomicWrite 是單檔操作，無 race condition

### 14 個 agent 的修改規格

#### 修改類型 A：只加誤判防護

適用：architect、debugger、developer、planner、retrospective、tester

**architect** — 在 DON'T 後加：
```markdown
## 誤判防護

常見誤判，📋 MUST 正確辨識：

| 情況 | 正確處理 |
|------|--------|
| 看到現有程式碼有「更好的寫法」 | 先分析現有 codebase pattern，確認不是既有設計決策再提出 |
| 覺得方案「太簡單不夠彈性」 | 簡單能滿足需求就是正確方案，不要引入未來才用到的抽象層 |
| 看到類似功能想統一抽象 | 確認有 3+ 個使用點且邏輯完全相同再抽象，否則保持內嵌 |
| 分析子任務依賴關係 | 沒有共同輸出檔案 + 無邏輯依賴 = 可並行，不必保守地設為 sequential |
```

**debugger** — 在 DON'T 後加：
```markdown
## 誤判防護

常見 false positive，📋 MUST 正確辨識：

| 情況 | 正確處理 |
|------|--------|
| 只找到一個假設就急著修復 | 至少提出 2 個競爭假設並逐一排除後再動手 |
| stack trace 頂層是錯誤發生點 | 頂層通常是症狀，根因在呼叫鏈深處，需追蹤到源頭 |
| mock 設定看起來正確但測試失敗 | 確認 mock scope、import path、呼叫順序，mock 問題常是假錯誤 |
| 測試偶爾 pass 偶爾 fail | 優先考慮 flaky test（timing、global state），而非邏輯 bug |
```

**developer** — 在 DON'T 後加：
```markdown
## 誤判防護

常見誤判，📋 MUST 正確辨識：

| 情況 | 正確處理 |
|------|--------|
| Handoff Open Questions 有未解問題 | Open Questions 是給 reviewer 的資訊，不是阻擋完成的條件，除非明確標示 BLOCKING |
| test 執行失敗 | 先確認是測試本身的問題還是實作問題，不要盲目修改實作 |
| 所有 test pass | pass 不代表覆蓋完整，檢查 Handoff 的驗收標準是否都有對應測試 |
```

**planner** — 在 DON'T 後加：
```markdown
## 誤判防護

常見誤判，📋 MUST 正確辨識：

| 情況 | 正確處理 |
|------|--------|
| 使用者描述了一個解法 | 先抽取解法背後的需求，需求分解才是 planner 的輸出，而非直接拆解使用者描述的解法 |
| 任務粒度不確定 | 每個子任務應是一個 agent 可獨立完成的單元（1 session 內），太大就繼續拆 |
| 遇到技術選型問題 | 標記為 Open Question 交給 architect 決定，planner 不做技術決策 |
| 分析子任務 | 操作不同檔案且無邏輯依賴就是可並行，不要保守地設為 sequential |
```

**retrospective** — 在 DON'T 後加：
```markdown
## 誤判防護

常見誤判，📋 MUST 正確辨識：

| 情況 | 正確處理 |
|------|--------|
| 要寫的內容與 code-reviewer 的 REVIEW 重疊 | 回顧聚焦流程改善，而非重複審查程式碼問題 |
| 不確定該觸發幾次 retroCount | retroCount 由 Main Agent 根據 workflow 設定管理，retrospective 只執行當前這次 |
| Findings 有 ISSUES 清單 | ISSUES 是記錄，不是立即行動項目，除非標記為 CRITICAL |
| 所有階段都 PASS | PASS 不等於完美執行，仍需分析 timing、agent 效率等改善點 |
```

**tester** — 在 DON'T 後加：
```markdown
## 誤判防護

常見 false positive，📋 MUST 正確辨識：

| 情況 | 正確處理 |
|------|--------|
| Handoff 沒有明確說用哪個測試框架 | 讀取現有 test 檔案確認 pattern，不要假設或引入新框架 |
| test 全部 pass | pass 不等於邏輯正確，確認 assertion 有實際驗證行為而非只是 toBeDefined |
| 測試跑失敗 | 先判斷是 spec 設計問題還是實作問題，FAIL 不代表 developer 一定寫錯 |
| 看到 toBeDefined / toBeTruthy | 這類 weak assertion 不算覆蓋，補上具體值的 assertion |
```

#### 修改類型 B：加信心過濾 + 誤判防護

適用：build-error-resolver、designer、doc-updater、e2e-runner

**build-error-resolver** — 在 DON'T 後加：
```markdown
## 信心過濾（>80% 規則）

只在 **>80% 確信是 build 錯誤的根因** 時才修改。

| 修改（>80%） | 不修改（<80%） |
|-------------|---------------|
| 明確的 import/export 錯誤 | warning（非 error） |
| 型別不相容（TS error） | deprecation notice（仍能 build） |
| 語法錯誤 | test 失敗（屬於 test failure，非 build error） |
| 缺少依賴（module not found） | 效能 warning |

## 誤判防護

常見誤判，📋 MUST 正確辨識：

| 情況 | 正確處理 |
|------|--------|
| 看到 warning 訊息 | warning 不是 build failure，不修改 |
| 看到 deprecation 訊息 | deprecation 不會阻擋 build，不在此次範圍 |
| test fail 出現在 build log | test fail 是測試問題不是 build 問題，不修改實作 |
```

**designer** — 在 DON'T 後加：
```markdown
## 信心過濾（>80% 規則）

只在 **>80% 確信設計判斷正確** 時才輸出具體規格。

| 回報（>80%） | 標記待確認（<80%） |
|-------------|------------------|
| 與現有設計系統明確衝突 | 色彩對比（需量測才能確認） |
| 元件缺少必要互動狀態 | 「感覺不協調」的視覺判斷 |
| 無障礙問題（aria、focus） | 設計偏好差異 |

## 誤判防護

常見誤判，📋 MUST 正確辨識：

| 情況 | 正確處理 |
|------|--------|
| 使用者說「這個顏色不對」 | 確認是品牌色彩規範問題還是個人偏好，查設計 token |
| 看到設計規格文件 | 設計規格 ≠ 前端實作碼，不要直接複製 CSS 值 |
| 不確定某個元件是否符合設計系統 | 先查現有元件庫，確認是新增還是複用 |
```

**doc-updater** — 在 DON'T 後加：
```markdown
## 信心過濾（>80% 規則）

只更新 **>80% 確信有直接對應程式碼變更** 的文件段落。

| 更新（>80%） | 不更新（<80%） |
|-------------|---------------|
| API 簽名改變且文件有對應說明 | 程式碼有變更但文件沒有直接描述該功能 |
| 新增函式且文件有功能列表 | 「感覺」文件可能過時 |
| 刪除功能且文件仍有說明 | 文件風格與程式碼風格不一致 |

## 誤判防護

常見誤判，📋 MUST 正確辨識：

| 情況 | 正確處理 |
|------|--------|
| 程式碼有任何變更 | 不是每次程式碼改動都需要更新文件，只更新有直接對應的段落 |
| 看到 status.md 有數字 | status 數字（如 test 數量）由 CI 或工具自動更新，不手動修改 |
| 看到 roadmap 有計劃項目 | roadmap 是產品決策，不因程式碼變更而自動更新 |
```

**e2e-runner** — 在 DON'T 後加：
```markdown
## 信心過濾（>80% 規則）

只為 **>80% 確信有 BDD spec 定義的行為** 撰寫 E2E test。

| 撰寫（>80%） | 不撰寫（<80%） |
|-------------|---------------|
| BDD spec 有明確 Given/When/Then | 「感覺應該要測」但無 spec |
| 功能有明確的使用者可見行為 | 純 API 行為（屬於 unit test） |
| 跨元件的整合行為 | 已有 unit test 覆蓋的內部邏輯 |

## 誤判防護

常見 false positive，📋 MUST 正確辨識：

| 情況 | 正確處理 |
|------|--------|
| BDD spec 的 @ref 有變動 | 先確認 @ref 指向的功能是否實際改變，不要因 @ref 更新就重寫整個 E2E |
| headless 模式 test 失敗 | headless 與 interactive 行為可能不同，先在 interactive 模式確認再判斷 |
| DOM 元素存在但不可見 | E2E 應測試使用者可見行為，不可見的元素需確認是否是合理的隱藏狀態 |
| test 偶爾 pass 偶爾 fail | 優先考慮 timing issue（等待元素載入），加 waitFor 而非斷言放寬 |
```

#### 修改類型 C：加信心過濾 + 誤判防護（特殊邏輯）

適用：qa、refactor-cleaner、security-reviewer、claude-developer

**qa** — 在 DON'T 後加：
```markdown
## 信心過濾（≥80% 規則）

只在 **≥80% 確信是真正的品質問題** 時才標記 FAIL。

| 標記 FAIL（≥80%） | 標記 PASS 附帶 comment（<80%） |
|-----------------|-------------------------------|
| 功能與驗收標準明確不符 | 行為與預期不同但可能是設計決策 |
| 使用者流程明確中斷 | 邊界條件下的行為不確定 |
| 安全問題（資料洩漏等） | UI 細節不如預期但不影響功能 |

## 誤判防護

常見誤判，📋 MUST 正確辨識：

| 情況 | 正確處理 |
|------|--------|
| 發現問題 | 先確認是 QA 環境問題還是 dev 實作問題，QA 問題不算 dev 錯誤 |
| 邊界條件行為與主流程不同 | 邊界行為可能是設計決策，查驗收標準確認 |
| smoke test 全通過 | smoke test 覆蓋主流程，不代表所有邊界情況都正確 |
```

**refactor-cleaner** — 在 DON'T 後加：
```markdown
## 信心過濾（≥90% 規則）

只在 **≥90% 確信安全** 時才刪除或重構。

| 執行（≥90%） | 不執行（<90%） |
|-------------|---------------|
| 靜態分析確認無任何呼叫點 | knip 回報 unused 但未確認 runtime 行為 |
| import 路徑確認無動態引用 | peer dependency 的間接使用 |
| 測試確認行為不變 | build-time 使用但 runtime 才呼叫的程式碼 |

## 誤判防護

常見誤判，📋 MUST 正確辨識：

| 情況 | 正確處理 |
|------|--------|
| knip 回報 unused | knip 只做靜態分析，不偵測動態 require/import、eval、reflection |
| 看到 peer dependency | peer dep 的使用者是外部專案，不能因本專案無直接使用就刪除 |
| build 成功 | build 成功不等於 runtime 正確，需確認有測試覆蓋對應行為 |
```

**security-reviewer** — 在 DON'T 後加：
```markdown
## 信心過濾（分級規則）

| 等級 | 信心門檻 | 說明 |
|------|---------|------|
| Critical | 100% 必報 | 任何 Critical 安全問題都必須回報 |
| Medium | ≥70% 才報 | 有明確攻擊路徑的才回報 |
| Low | ≥80% 才報 | 有具體緩解必要的才回報 |
| 理論風險 | 不報 | 無具體攻擊場景的理論漏洞 |
```

**claude-developer** — 在 DON'T 後加：
```markdown
## 信心過濾（閉環確認）

只在 **確認變更閉環** 後才輸出 Handoff：

| 必須確認（>90%） | 不確認就阻擋 |
|----------------|------------|
| 元件修改後 validate-agents.js 通過 | 任何元件變更 |
| hook event 名稱與 hooks.json 一致 | hook 相關修改 |
| agent skills 欄位對應 skills/ 目錄存在 | skill 引用變更 |

## 誤判防護

常見誤判，📋 MUST 正確辨識：

| 情況 | 正確處理 |
|------|--------|
| hook event 名稱不在記憶中 | 不猜測，讀取 hooks.json 確認實際 event 名稱 |
| 閉環驗證有 warning | 讀取 warning 內容判斷是否需要處理，warning 不等於 error |
```

#### 修改類型 D：極精簡補齊（grader）

grader 是 maxTurns: 5 的輕量 agent，採用最精簡的四模式補齊：

**grader** — 在 `⛔ **DON'T**` 那行後補完整的邊界清單和信心過濾：
```markdown
⛔ **DON'T**：不修改任何程式碼。📋 MUST NOT 寫 Handoff、做決策、委派其他 agent。不評論輸出內容的對錯。

## 信心過濾

對 agent 輸出品質有 **≥80% 把握** 才給高分。

- `clarity`：輸出是否條理清晰（不是文字多就是清晰）
- `completeness`：是否完整回答需求（不是有輸出就是完整）
- `actionability`：下一步行動是否明確（不是有下一步就是可操作）

## 誤判防護

| 情況 | 正確處理 |
|------|--------|
| 輸出很長 | 長不等於高分，看是否針對需求 |
| 有 Handoff 格式 | 格式正確不等於 completeness 滿分 |
| 有明確結論 | 結論清楚加 clarity 分，但 completeness 看需求覆蓋度 |
```

## 資料模型

不涉及新的資料結構，修改的是 agent .md 檔案的正文內容。

**修改格式**：
- 讀取現有 agent .md 正文
- 在正確位置（DON'T 後、輸入前）插入新章節
- 以 `manage-component.js update agent <name> '{"body":"..."}'` 寫入

## 檔案結構

```
修改的檔案（14 個）：
  plugins/overtone/agents/architect.md         ← 加誤判防護
  plugins/overtone/agents/build-error-resolver.md  ← 加信心過濾 + 誤判防護
  plugins/overtone/agents/debugger.md          ← 加誤判防護
  plugins/overtone/agents/designer.md          ← 加信心過濾 + 誤判防護
  plugins/overtone/agents/developer.md         ← 加誤判防護
  plugins/overtone/agents/doc-updater.md       ← 加信心過濾 + 誤判防護
  plugins/overtone/agents/e2e-runner.md        ← 加信心過濾 + 誤判防護
  plugins/overtone/agents/grader.md            ← 加邊界清單 + 信心過濾 + 誤判防護（極精簡）
  plugins/overtone/agents/planner.md           ← 加誤判防護
  plugins/overtone/agents/qa.md                ← 加信心過濾 + 誤判防護
  plugins/overtone/agents/refactor-cleaner.md  ← 加信心過濾 + 誤判防護
  plugins/overtone/agents/retrospective.md     ← 加誤判防護
  plugins/overtone/agents/tester.md            ← 加誤判防護
  plugins/overtone/agents/claude-developer.md  ← 加信心過濾 + 誤判防護
  plugins/overtone/agents/security-reviewer.md ← 加信心過濾
```

## 關鍵技術決策

### 決策 1：body 整段替換 vs Edit 工具

- **選項 A（選擇）**：`manage-component.js update agent` 傳 `body` 欄位 — 符合 pre-edit guard 規則，唯一合法路徑
- **選項 B（未選）**：Edit 工具 — agents/*.md 受 pre-edit guard 保護，會被阻擋

### 決策 2：章節位置

- **選項 A（選擇）**：DON'T 後、輸入前 — 與 database-reviewer 一致，是「邊界說明」的自然位置
- **選項 B（未選）**：停止條件後（product-manager 的模式）— product-manager 的誤判防護是額外補上的，非最佳位置

### 決策 3：並行執行策略

- **選項 A（選擇）**：Phase 1 按修改類型分批（A/B/C/D），同一 Phase 內可並行，上限 5 個同時 — atomicWrite 無 race condition，14 個 agent 可以分批並行
- **選項 B（未選）**：序列執行全部 14 個 — 無技術必要，浪費時間

## 實作注意事項

給 developer 的提醒：

1. **讀取再寫入**：每個 agent 都必須先 Read 現有內容，找到 DON'T 章節末尾的確切位置，再附加新章節，最後整段作為 `body` 傳給 manage-component.js
2. **grader 特殊處理**：grader 沒有 DO/DON'T 章節分隔，直接在第一行 `⛔ **DON'T**` 後擴充整個結構
3. **位置確認**：插入點是 `## DON'T` 區塊最後一個 bullet 之後，`## 輸入` 之前（若無輸入章節則在輸出前）
4. **security-reviewer**：只加信心過濾，不加誤判防護（planner 的規格如此）
5. **驗證**：所有修改完成後執行 `bun plugins/overtone/scripts/validate-agents.js` 確認格式正確
