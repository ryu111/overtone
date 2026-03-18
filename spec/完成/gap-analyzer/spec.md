# Gap Analyzer

## 動機（Why）

- **問題**：health-check.js 產出原始 `Finding[]`，但下游消費者（gap-fixer、evolution.js CLI、evolve skill）無法直接使用——Finding 只描述「哪裡壞了」，缺少「怎麼分類」「該修什麼」「先修哪個」的決策資訊
- **目標**：提供標準化 `Gap` 物件，包含分類、修復方向提示、優先級，讓 gap-fixer 能直接選策略執行修復
- **不做的代價**：每個下游消費者各自解讀 Finding → 分類邏輯重複、不一致、無法演進

## 範圍

### In-scope

- 消費 health-check.js 的 `runAll()` → `HealthReport`
- 將 `Finding[]` 轉換為標準化 `Gap[]`
- 每個 finding.type 對應一組確定性的 category + repairHint
- 依 severity + impact 計算優先級
- CLI 和程式化 API 雙模式
- 聚合統計（按 category 分組計數）

### Out-of-scope

- 修復缺口（gap-fixer.js 的職責）
- AI 語意分析（純確定性邏輯）
- 新增 health-check 的 check 類型
- 持久化歷史趨勢（未來由 evolution.js 管理）

## 使用者故事

身為 gap-fixer.js，我想要收到結構化的 Gap 物件（含 category 和 repairHint），以便直接選擇修復策略而不需自行解讀 Finding。

身為 evolution.js CLI 的 `analyze` 子命令，我想要呼叫 `analyzeGaps()` 取得分類後的缺口清單，以便呈現給使用者或傳遞給修復流程。

身為開發者，我想要用 `bun gap-analyzer.js` CLI 快速看到系統缺口摘要，以便判斷系統健康趨勢。

## 行為規格

### 正常路徑

1. 呼叫 `analyzeGaps()` → 內部呼叫 `runAll()` 取得 `HealthReport`
2. 遍歷 `HealthReport.findings` → 每個 Finding 透過映射表轉換為 Gap
3. 計算每個 Gap 的 priority 分數（severity 權重 + impact 加成）
4. 按 priority 降序排列
5. 產出 `GapReport`（含 gaps、stats、metadata）

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| health-check runAll() 拋出例外 | 包裝為 GapReport { gaps: [], error: message }，不 throw |
| Finding 的 type 不在映射表中 | 使用 fallback category "unknown"，severity 保持原值，repairHint 為 "手動檢查" |
| HealthReport.findings 為空陣列 | 回傳 GapReport { gaps: [], stats: { total: 0, ... } }（健康狀態） |

### 邊界條件

- 同一 element 有多個 Finding → 各自獨立轉換為 Gap（不合併），保持 1:1 映射
- Finding severity 為 'info' → 轉換為 Gap 但 priority 最低，CLI 預設不顯示（加 `--all` 顯示）
- 未知的 finding.check → category 為 "unknown"

## 資料模型

### 輸入

消費 health-check.js 的 `HealthReport`（見上游 API 文件）。

### 輸出

#### Gap 物件

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | string | 唯一識別，格式 `{check}:{type}:{element-hash}` |
| category | string | 缺口分類（見分類表） |
| severity | 'critical' \| 'warning' \| 'info' | 繼承自 Finding |
| priority | number | 0-100，越高越優先 |
| repairHint | string | 給 gap-fixer 的修復方向（確定性文字） |
| source | object | 原始 Finding 完整保留 |
| context | object | `{ element, check, type, files: string[] }` |

#### GapReport 物件

| 欄位 | 型別 | 說明 |
|------|------|------|
| gaps | Gap[] | 按 priority 降序排列 |
| stats | object | `{ total, byCategory: {}, bySeverity: {} }` |
| metadata | object | `{ timestamp, version, healthCheckVersion, duration }` |
| error | string? | health-check 失敗時的錯誤訊息 |

### 儲存

- 不持久化（純轉換層，每次呼叫即時計算）

## 介面契約

### 程式化 API

```javascript
import { analyzeGaps, findingToGap, calculatePriority } from './gap-analyzer.js';

// 完整分析（呼叫 health-check runAll）
const report = await analyzeGaps(options?);
// options: { checks?: string[] }  — 透傳給 health-check

// 單一 Finding 轉換（純函式，gap-fixer 可單獨使用）
const gap = findingToGap(finding);

// 優先級計算（純函式，可測試）
const score = calculatePriority(severity, impactFactor);
```

### CLI

```bash
bun ~/.claude/scripts/gap-analyzer.js                    # 全部分析，stdout JSON
bun ~/.claude/scripts/gap-analyzer.js --summary          # 只輸出摘要（stderr 人可讀）
bun ~/.claude/scripts/gap-analyzer.js --category=closed-loop  # 過濾特定 category
bun ~/.claude/scripts/gap-analyzer.js --all              # 包含 info severity
bun ~/.claude/scripts/gap-analyzer.js --checks closedLoop hookIntegrity  # 指定 checks
```

## 缺口分類表

### Finding type → Gap category + repairHint 映射

| finding.check | finding.type | Gap category | repairHint |
|---------------|-------------|-------------|------------|
| closedLoop | missing-skillmd | structure | 建立 SKILL.md（frontmatter + 消費者 + 資源索引） |
| closedLoop | orphan-skill | dependency | 在對應 agent frontmatter 的 skills[] 加入引用 |
| closedLoop | name-mismatch | consistency | 統一目錄名與 frontmatter name 欄位 |
| closedLoop | unindexed-reference | documentation | 在 SKILL.md 的資源索引表中加入該檔案連結 |
| closedLoop | broken-reference | integrity | 建立缺失的 reference 檔案，或移除 SKILL.md 中的失效索引 |
| closedLoop | parse-error | integrity | 修正 SKILL.md frontmatter YAML 語法 |
| skillCoverage | orphan-script | dependency | 在對應 skill 的 SKILL.md 中引用該腳本 |
| skillCoverage | empty-references | coverage | 為 skill 建立 references 目錄並加入至少一份深度參考 |
| hookIntegrity | broken-hook-command | integrity | 修正 settings.json 中的 hook command 路徑 |
| hookIntegrity | broken-fallback | integrity | 修正 FALLBACK_MODULES 中的模組路徑 |
| hookIntegrity | handler-mismatch | consistency | 同步 FALLBACK_MODULES 的 fn 欄位與模組實際 export |
| agentAlignment | missing-skill-dir | structure | 建立缺失的 skill 目錄 |
| agentAlignment | missing-skill-definition | structure | 為已存在的 skill 目錄建立 SKILL.md |
| agentAlignment | no-skills-defined | coverage | 在 agent frontmatter 加入 skills 欄位 |
| agentAlignment | shared-skill | info | 資訊性：確認共用是有意設計而非意外重複 |
| * | check-error | system | 檢查 check 函式本身的錯誤並修復 |
| * | (unknown) | unknown | 手動檢查 — 未知的 finding type |

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | `analyzeGaps()` 總耗時 < health-check 耗時 + 50ms（轉換層開銷極小） |
| 可測試性 | `findingToGap` 和 `calculatePriority` 為純函式，可獨立單元測試 |
| 行數 | 400 行以內 |
| 依賴 | 零外部依賴，僅 import health-check.js |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | health-check.js | `runAll()` → `HealthReport` |
| 下游 | gap-fixer.js（R3.1 待建） | 消費 `Gap[]`，選擇修復策略 |
| 下游 | evolution.js CLI（R3.1 待建） | `analyze` 子命令呼叫 `analyzeGaps()` |
| 下游 | evolve skill | `/evolve` command 的知識域引用 |
| 下游 | R4.2 缺口自動發現 | gap-analyzer 是自動發現的前置 |

## 驗收標準

- [ ] `bun test gap-analyzer.test.js` 全部通過
- [ ] 每個 health-check finding.type（16 個）都有對應的 category 和 repairHint 映射
- [ ] `findingToGap` 純函式：同一 Finding 輸入永遠產出同一 Gap
- [ ] CLI `bun gap-analyzer.js` 輸出合法 JSON
- [ ] CLI `bun gap-analyzer.js --summary` 在 stderr 輸出人可讀摘要
- [ ] `analyzeGaps()` 在 health-check 失敗時不 throw，回傳含 error 的 GapReport
- [ ] 程式碼 400 行以內
- [ ] 零外部依賴

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| health-check 新增 finding.type 但 gap-analyzer 未更新映射 | 中 | 低 | fallback 到 "unknown" category + health-check 測試加 type 清單斷言 |
| Gap 物件結構變更導致 gap-fixer 破壞 | 低 | 高 | Gap 結構作為合約介面，版本化（version 欄位）|
| priority 計算公式不符實際修復優先序 | 中 | 低 | priority 公式獨立純函式，可迭代調整不影響其他邏輯 |
