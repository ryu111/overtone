# health-check.js — 四維度元件健康檢查

## 動機（Why）

- **問題**：R3.1 Gap 偵測需要結構化的健康報告作為輸入，目前缺少統一的元件完整性檢查腳本。smoke-test.js 只覆蓋 L1-L2 模組 import 驗證，不檢查元件間的依賴閉環、覆蓋率、掛載完整性、對齊關係
- **目標**：建立 `~/.claude/scripts/health-check.js`，對 nova 系統執行四維度確定性檢查，產出標準化 JSON 報告供 gap-analyzer.js 消費
- **不做的代價**：gap-analyzer 無法自動偵測元件缺口，R3.1 進度停滯，R4.2 缺口自動發現無法啟動

## 範圍

### In-scope

- 四個 check 函式：`checkClosedLoop`、`checkSkillCoverage`、`checkHookIntegrity`、`checkAgentAlignment`
- 標準化 HealthReport + Finding 輸出格式（JSON）
- CLI 執行模式：`bun ~/.claude/scripts/health-check.js [check-name]`
- 可 import 模式：`import { checkClosedLoop, ... } from './health-check.js'`
- 快速模式（subset）供 maintainer.js 呼叫

### Out-of-scope

- gap-analyzer.js 本身（消費 health-check 結果，R3.1 下一步）
- AI 語意判斷（所有檢查皆為確定性檔案系統比對）
- 自動修復（只偵測不修復，修復由 gap-fixer.js 負責）
- 跨 repo 一致性檢查（overtone 測試引用 nova 模組，屬 review-checklist 第 4 層人工範疇）

## 使用者故事

身為 gap-analyzer.js，我想要 `import { runAll }` 取得結構化健康報告，以便產出標準化 Gap 物件。

身為開發者，我想要 `bun ~/.claude/scripts/health-check.js` 一鍵檢查系統完整性，以便在修改元件後立即驗證閉環。

身為 maintainer.js，我想要 `import { runQuick }` 在 SessionEnd 執行輕量檢查（<500ms），以便在簡報中標註異常。

## 行為規格

### 正常路徑

1. 讀取 `~/.claude/` 下的 skills/、agents/、hooks/、settings.json、scripts/
2. 依指定的 check 名稱（或全部）執行對應的確定性檢查
3. 每個檢查產出 `Finding[]`（包含 type、severity、element、description）
4. 彙整為 `HealthReport`（summary + findings + metadata）
5. CLI 模式印出 JSON 到 stdout；import 模式回傳物件

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| `~/.claude/` 不存在 | 回傳空報告 + 單筆 critical finding「CLAUDE_DIR not found」 |
| settings.json 解析失敗 | hookIntegrity check 回傳 critical finding，其他 check 不受影響 |
| 指定的 check-name 不存在 | stderr 印錯誤訊息 + exit code 1 |
| 某個 check 內部 throw | 該 check 回傳 error finding，不影響其他 check 的執行 |

### 邊界條件

- skills/ 為空 → closedLoop + skillCoverage 回傳 warning findings
- agents/ 為空 → agentAlignment 回傳 warning finding
- 0 個 finding → 健康，summary.status = "healthy"

## 資料模型

### 輸入

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| checks | string[] | 否 | 指定執行哪些 check（預設全部）|
| quick | boolean | 否 | 快速模式（只跑 closedLoop + hookIntegrity）|

### 輸出（HealthReport）

| 欄位 | 型別 | 說明 |
|------|------|------|
| summary | object | `{ status, total, critical, warning, info, duration }` |
| findings | Finding[] | 所有發現的問題 |
| metadata | object | `{ timestamp, version, checksRun }` |

### Finding 結構

| 欄位 | 型別 | 說明 |
|------|------|------|
| check | string | 來自哪個 check（closedLoop/skillCoverage/hookIntegrity/agentAlignment）|
| type | string | 缺口類型（orphan-skill/missing-consumer/broken-hook/misaligned-agent 等）|
| severity | "critical" \| "warning" \| "info" | 嚴重度 |
| element | string | 哪個元件（如 `skill:debugging`、`hook:PreToolUse:Bash`）|
| description | string | 人可讀的問題描述 |

### 儲存

- 不寫檔案。報告為純函式輸出，由消費者決定是否持久化

## 介面契約

### CLI

```bash
# 執行全部檢查
bun ~/.claude/scripts/health-check.js

# 執行指定檢查
bun ~/.claude/scripts/health-check.js closedLoop

# 快速模式
bun ~/.claude/scripts/health-check.js --quick
```

CLI stdout 為 JSON（HealthReport），stderr 為人可讀摘要。

### 程式化 API

```javascript
import {
  checkClosedLoop,
  checkSkillCoverage,
  checkHookIntegrity,
  checkAgentAlignment,
  runAll,
  runQuick,
} from './health-check.js';

// 單項檢查 → Finding[]
const findings = await checkClosedLoop();

// 全部檢查 → HealthReport
const report = await runAll();

// 快速模式 → HealthReport（closedLoop + hookIntegrity）
const quick = await runQuick();
```

### 錯誤碼

| exit code | 意義 |
|:---------:|------|
| 0 | 檢查完成（不代表無 finding，只代表腳本正常結束）|
| 1 | 參數錯誤或腳本內部錯誤 |

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | 全量檢查 <2s、快速模式 <500ms（純檔案系統讀取，無網路）|
| 檔案行數 | ≤800 行（bloat detection 上限）|
| 依賴 | 零外部依賴（只用 Node built-in + Bun API）|
| 確定性 | 相同檔案系統狀態 → 相同輸出（無隨機、無 AI 語意）|

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | `~/.claude/settings.json` | hookIntegrity 讀取 hook 掛載設定 |
| 上游 | `~/.claude/skills/*/SKILL.md` | closedLoop + skillCoverage 讀取 skill 定義 |
| 上游 | `~/.claude/agents/*.md` | agentAlignment 讀取 agent frontmatter |
| 上游 | `~/.claude/hooks/modules/*.js` | hookIntegrity 檢查模組存在性 |
| 下游 | gap-analyzer.js（R3.1 待建） | 消費 HealthReport 產出 Gap 物件 |
| 下游 | maintainer.js | SessionEnd 呼叫 runQuick() 注入簡報 |
| 下游 | smoke-test.js（可選） | 可整合呼叫 runAll() 作為 L2 項目 |

## 驗收標準

- [ ] `bun test` 通過所有 health-check 相關測試
- [ ] `bun ~/.claude/scripts/health-check.js` 輸出合法 JSON（HealthReport 格式）
- [ ] 每個 check 函式可獨立 import 和呼叫
- [ ] 快速模式（`--quick`）執行時間 <500ms
- [ ] 人為製造缺口（如刪除 skill 目錄但保留 agent 引用）時能偵測到 finding
- [ ] 腳本行數 ≤800

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| SKILL.md frontmatter 格式不統一導致解析失敗 | 中 | 中 | 容錯解析：解析失敗的 skill 生成 warning finding 而非 crash |
| settings.json 結構變更導致 hookIntegrity 失效 | 低 | 中 | 容錯讀取 + 明確的 schema 假設文檔化在 design.md |
| 行數超過 800 行 | 中 | 低 | 提取共用的 fs-scan 邏輯為 helper，4 個 check 函式保持精簡 |
| 檢查項目遺漏（閉環模型有 4 層但 check 只覆蓋部分）| 低 | 中 | design.md 明確列出每個 check 對應的閉環層 checklist items |

## 四個 Check 函式的檢查項目

### 1. checkClosedLoop（對應 element-dependency 第 1 層）

| 檢查項 | finding type | severity |
|--------|-------------|----------|
| Skill 目錄存在但無 SKILL.md | `missing-skillmd` | critical |
| SKILL.md 未被任何 agent 的 skills[] 引用 | `orphan-skill` | warning |
| SKILL.md references/ 中有檔案但 SKILL.md 無索引 | `unindexed-reference` | warning |
| SKILL.md 索引指向不存在的 reference 檔案 | `broken-reference` | critical |
| Skill 目錄名 != SKILL.md frontmatter name | `name-mismatch` | warning |

### 2. checkSkillCoverage（knowledge vs execution 覆蓋率）

| 檢查項 | finding type | severity |
|--------|-------------|----------|
| Skill 有 references 但 roadmap 標記執行層缺失 | `missing-execution-layer` | info |
| scripts/ 中腳本找不到對應的 skill 消費者 | `orphan-script` | warning |
| Skill references 為空（0 個 reference 檔案）| `empty-references` | info |

### 3. checkHookIntegrity（settings.json + 模組完整性）

| 檢查項 | finding type | severity |
|--------|-------------|----------|
| settings.json hook command 指向不存在的腳本 | `broken-hook-command` | critical |
| hook-client.js FALLBACK_MODULES 中引用的模組不存在 | `broken-fallback` | critical |
| hook 模組 export 的函式名與 server 路由預期不符 | `handler-mismatch` | warning |
| settings.json 有事件類型但無對應 handler 模組 | `unhandled-event` | info |

### 4. checkAgentAlignment（agent skills[] 對齊）

| 檢查項 | finding type | severity |
|--------|-------------|----------|
| Agent skills[] 引用不存在的 skill 目錄 | `missing-skill-dir` | critical |
| Agent skills[] 引用的 skill 無 SKILL.md | `missing-skill-definition` | critical |
| Agent frontmatter 缺少 skills 欄位 | `no-skills-defined` | info |
| 同一 skill 被多個 agent 引用（資訊性，非問題）| `shared-skill` | info |
