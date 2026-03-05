# Proposal

## 功能名稱

`evolution-engine-auto-create`（P4.2 — Evolution Engine 自動修復層）

## 需求背景（Why）

- **問題**：P4.1 完成的 gap-analyzer.js 能偵測缺口（missing-skill、broken-chain、missing-consumer、no-references、sync-mismatch），並為每個缺口產出建議指令 skeleton，但仍需人工逐一執行修復。對於有明確修復方式的缺口類型（sync-mismatch、no-references），這是重複性的手動操作。
- **目標**：在 gap-analyzer 的基礎上建立自動修復層。對可自動修復的缺口類型，直接執行修復並驗證結果；對需要人類決策的缺口（missing-skill、broken-chain、missing-consumer），維持現有的建議輸出，不自動執行。
- **優先級**：Phase 4 Level 3 自我進化能力的核心里程碑，P4.1 分析層已完成，P4.2 執行層是自然的下一步。

## 使用者故事

```
身為 Overtone 維護者
我想要執行 bun scripts/evolution.js fix
以便自動修復可安全修復的元件一致性缺口，不需要手動逐一執行 fix-consistency.js 和 mkdir 指令
```

```
身為 Overtone 維護者
我想要 --dry-run 預覽模式
以便在實際修復前確認哪些動作會被執行，避免非預期的修改
```

## 範圍邊界

### 在範圍內（In Scope）

- `evolution.js` 新增 `fix` 子命令（`bun scripts/evolution.js fix [--dry-run] [--type <type>]`）
- 安全預設：不加旗標時為 dry-run 模式（需加 `--execute` 才真正執行）
- `sync-mismatch` 自動修復：呼叫 `fix-consistency.js --fix` 邏輯
- `no-references` 自動修復：建立 `references/` 目錄和 `README.md` 佔位檔
- 修復後驗證：重新執行 analyzeGaps，確認缺口消失
- gap-analyzer.js 新增 `fixable`（boolean）和 `fixAction`（指令字串）欄位到 Gap 物件
- `--type <type>` 過濾旗標：只修復指定類型的缺口
- fix 子命令的 usage 更新（printUsage）
- unit 測試：gap-analyzer.js 新欄位
- integration 測試：evolution.js fix 子命令（dry-run 路徑 + execute 路徑）

### 不在範圍內（Out of Scope）

- `missing-skill` 自動修復（需人類決定 skill 內容，風險高）
- `broken-chain` 自動修復（需人類確認 agent 配置，風險高）
- `missing-consumer` 自動修復（需人類確認消費關係正確性，風險高）
- 修改 fix-consistency.js 的核心邏輯（直接呼叫其功能，不改其內部）
- 修改 manage-component.js（超出本次範圍）
- 互動式（interactive）修復模式（未來可擴展）

## 子任務清單

1. **擴展 gap-analyzer.js — 新增 fixable 和 fixAction 欄位**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/gap-analyzer.js`
   - 說明：在 findingToGap() 回傳的 Gap 物件中新增兩個欄位。`fixable: true` 限於 `sync-mismatch` 和 `no-references`；`fixAction` 為對應的具體修復指令字串（sync-mismatch → `fix-consistency --fix` 呼叫路徑，no-references → mkdir + 寫入 README.md 的 Node.js 表示法）。需確保現有的 gap-analyzer 測試全部通過。

2. **實作 gap-fixer.js — 修復執行邏輯（lib 層）**（可與子任務 1 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/gap-fixer.js`（新建）
   - 說明：建立新的 lib 模組，匯出 `fixGaps(gaps, options)` 函式。接收 analyzeGaps 回傳的 gaps 陣列和 `{ dryRun, typeFilter }` 選項。對每個 `fixable: true` 的 gap 執行修復動作（呼叫 fix-consistency.js 邏輯或 fs 操作建立 references 目錄）。修復後回傳 `{ fixed, skipped, failed }` 結果物件。dryRun 模式只輸出計劃，不執行任何 fs 或 script 呼叫。

3. **更新 evolution.js — 新增 fix 子命令**（依賴子任務 1、2 完成）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/evolution.js`
   - 說明：新增 `fix` 分支處理。解析 `--dry-run`（未來考慮改為預設）、`--execute`（真正執行）、`--type <type>` 旗標。呼叫 analyzeGaps → 過濾 fixable gaps → 呼叫 gap-fixer.js → 輸出修復結果報告 → 觸發驗證（再次 analyzeGaps）→ 輸出驗證結果。同步更新 printUsage() 加入 fix 子命令說明。exit code：無需修復 exit 0，修復成功 exit 0，修復後仍有缺口 exit 1，執行錯誤 exit 1。

4. **新增 unit 測試 — gap-analyzer 新欄位 + gap-fixer**（可與子任務 2 並行）
   - 負責 agent：developer
   - 相關檔案：`tests/unit/gap-analyzer.test.js`（擴展）、`tests/unit/gap-fixer.test.js`（新建）
   - 說明：擴展 gap-analyzer.test.js 驗證 fixable 和 fixAction 欄位的存在和值（sync-mismatch → fixable: true，missing-skill → fixable: false）。新建 gap-fixer.test.js 覆蓋：dryRun 模式不執行任何 fs 操作、typeFilter 過濾邏輯、fixGaps 回傳結構（fixed/skipped/failed）、no-references 修復建立目錄和 README.md。

5. **新增 integration 測試 — evolution.js fix 子命令**（依賴子任務 3 完成）
   - 負責 agent：developer
   - 相關檔案：`tests/integration/evolution-fix.test.js`（新建）
   - 說明：擴展現有 evolution-analyze.test.js 的測試模式。覆蓋：`fix --dry-run` 輸出預覽計劃不執行修復、`fix --type sync-mismatch` 過濾正確、`fix --type invalid-type` 顯示錯誤、不帶 --execute 預設為 dry-run、fix 子命令顯示於 usage。使用真實 codebase（無缺口 → fix 輸出「無可修復缺口」並 exit 0）。

## 開放問題

- **fix-consistency.js 的呼叫方式**：gap-fixer.js 應直接 require fix-consistency.js 的邏輯（需要 fix-consistency.js 匯出其修復函式），還是透過子進程 spawn 呼叫？目前 fix-consistency.js 的修復邏輯未匯出（只在 module 層執行），architect 需決定是否重構其 API。
- **no-references 修復的 README.md 內容**：只寫 `# References` 佔位，還是要根據 skill 名稱產出更有意義的內容？
- **--execute 旗標 vs 預設行為**：需求說「dry-run 為預設，加 --execute 才真正執行」。需確認旗標命名（--execute 或 --force 或 --apply）是否與現有腳本一致。
- **驗證步驟的 exit code 語意**：修復後重跑 analyzeGaps，若同一個 gap 仍存在（修復失敗），exit code 應如何設計？建議 exit 1 + 列出未修復的缺口。
