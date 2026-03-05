# Design — evolution-engine-auto-create（P4.2）

## 技術摘要（What & Why）

- **方案**：新增 `gap-fixer.js`（lib 層）+ 擴展 `gap-analyzer.js`（新欄位）+ 擴展 `evolution.js`（fix 子命令）
- **理由**：
  - fix-consistency.js 採用子進程呼叫（`Bun.spawnSync`），不重構其 API。fix-consistency.js 目前是直接執行腳本（無 `module.exports`），重構成匯出函式需要改動現有腳本行為。子進程方式完全隔離，行為與使用者手動執行完全一致，且不會因為 fix-consistency.js 的實作細節改變而影響 gap-fixer。
  - no-references 修復內容為佔位（`# References\n`），與 gap-analyzer 的現有 suggestion 一致，不產生 skill-specific 的假設內容。
  - 旗標命名採 `--execute`（而非 `--apply` / `--fix`），與 proposal.md 規格一致，且語意最清楚（明確表達「執行真實動作」vs 預覽）。
  - 修復後驗證失敗（缺口仍存在）exit 1，並列出未修復的缺口清單。
- **取捨**：子進程呼叫 fix-consistency.js 有額外 process spawn 開銷，但修復是低頻操作，可接受。

## Open Questions 決策

| 問題 | 決策 |
|------|------|
| fix-consistency.js 呼叫方式 | 子進程（`Bun.spawnSync`），不重構匯出 API |
| no-references README.md 內容 | 只寫 `# References` 佔位 |
| 旗標命名 | `--execute`（dry-run 為預設，加 `--execute` 才真正執行） |
| 修復後驗證失敗的 exit code | exit 1 + stderr 列出仍存在的缺口清單 |

## API 介面設計

### gap-analyzer.js — Gap 型別擴展

```typescript
interface Gap {
  type: 'broken-chain' | 'missing-skill' | 'missing-consumer' | 'no-references' | 'sync-mismatch'
  severity: 'error' | 'warning' | 'info'
  file: string
  message: string
  suggestion: string
  sourceCheck: string
  // 新增欄位
  fixable: boolean        // true 限於 sync-mismatch 和 no-references
  fixAction: string       // 描述修復動作的人類可讀字串（非執行命令）
}
```

fixable / fixAction 值：

| type | fixable | fixAction |
|------|---------|-----------|
| `sync-mismatch` | `true` | `"fix-consistency: 在 SKILL.md 消費者表新增缺少的 agent"` |
| `no-references` | `true` | `"create-references: 建立 references/ 目錄和 README.md 佔位"` |
| `missing-skill` | `false` | `""` |
| `broken-chain` | `false` | `""` |
| `missing-consumer` | `false` | `""` |

### gap-fixer.js — 核心 API

```typescript
interface FixOptions {
  dryRun: boolean          // true = 只輸出計劃，不執行任何 fs 或 script 呼叫
  typeFilter?: string      // 若設定，只修復此 type 的缺口（e.g., 'sync-mismatch'）
  pluginRoot?: string      // 覆寫 pluginRoot（供測試使用）
}

interface FixResult {
  fixed: FixedItem[]       // 成功修復的缺口
  skipped: SkippedItem[]   // 略過的缺口（fixable: false 或 typeFilter 不符）
  failed: FailedItem[]     // 嘗試修復但失敗的缺口
}

interface FixedItem {
  gap: Gap
  action: string           // 執行了什麼動作的描述
}

interface SkippedItem {
  gap: Gap
  reason: 'not-fixable' | 'type-filter' | 'dry-run'
}

interface FailedItem {
  gap: Gap
  error: string            // 失敗原因
}

// 主函式
function fixGaps(gaps: Gap[], options: FixOptions): FixResult
```

**注意**：`fixGaps` 為同步函式，不回傳 Promise。與 gap-analyzer.js 的同步風格一致。

**sync-mismatch 修復邏輯**：對所有 sync-mismatch 缺口，只執行一次 `Bun.spawnSync(['bun', FIX_CONSISTENCY_SCRIPT, '--fix'], ...)`，批次修復，不逐個執行。

**no-references 修復邏輯**：對每個 no-references gap 的 `gap.file`（e.g., `skills/foo/SKILL.md`），從路徑解析出 skillName，`mkdirSync(join(pluginRoot, 'skills', skillName, 'references'), { recursive: true })`，再寫入 `README.md`。

**typeFilter 語意**：不在 `['sync-mismatch', 'no-references']` 中的 typeFilter 值 → skipped（reason: 'type-filter'）；無效值不報錯，只是全部缺口被 skip。

### evolution.js — fix 子命令介面

```
bun scripts/evolution.js fix [--execute] [--type <type>] [--json]

旗標：
  --execute       真正執行修復（預設為 dry-run）
  --type <type>   只修復指定類型（sync-mismatch | no-references）
  --json          以 JSON 格式輸出結果
```

**Exit code 語意**：

| 情況 | exit code |
|------|-----------|
| 無可修復缺口 | 0 |
| 修復成功（所有 fixable gap 均已修復） | 0 |
| dry-run 模式（無論有無缺口） | 0 |
| 修復後仍有缺口存在 | 1 |
| 執行錯誤（例外） | 1 |
| --type 為無效值（非可修復類型） | 1 |

**flow**：

1. 解析 args / flags
2. 呼叫 `analyzeGaps()` 取得缺口清單
3. 過濾 `fixable: true` 的缺口（再按 typeFilter 過濾）
4. 若 dry-run：輸出預覽計劃，exit 0
5. 呼叫 `fixGaps(gaps, { dryRun: false, typeFilter })`
6. 輸出修復結果報告
7. 重新執行 `analyzeGaps()` 驗證
8. 比對修復前後的缺口清單，列出仍存在的缺口
9. 若有剩餘缺口 → exit 1；否則 exit 0

## 資料模型

無新增持久化儲存。所有狀態在單次執行內計算，不寫入任何 `.json` / `.jsonl` 檔案。

no-references 修復產生的檔案：

```
skills/{skillName}/references/README.md  ← 內容：'# References\n'
```

## 檔案結構

```
修改的檔案：
  plugins/overtone/scripts/lib/gap-analyzer.js  ← 修改：Gap 物件新增 fixable + fixAction 欄位
  plugins/overtone/scripts/evolution.js          ← 修改：新增 fix 子命令 + 更新 printUsage

新增的檔案：
  plugins/overtone/scripts/lib/gap-fixer.js      ← 新增：修復執行邏輯（fixGaps API）
  tests/unit/gap-fixer.test.js                    ← 新增：gap-fixer 單元測試
  tests/integration/evolution-fix.test.js         ← 新增：evolution.js fix 子命令整合測試

擴展的測試檔案：
  tests/unit/gap-analyzer.test.js                 ← 擴展：驗證 fixable + fixAction 欄位
```
