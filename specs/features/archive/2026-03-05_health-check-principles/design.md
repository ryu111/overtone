---
feature: health-check-principles
stage: ARCH
created: 2026-03-05
author: architect
---

# Design: health-check-principles

## 技術摘要（What & Why）

- **方案**：在 health-check.js 新增 3 個靜態掃描 check 函式（checkClosedLoop / checkRecoveryStrategy / checkCompletionGap），並在 manage-component.js 的 create 成功後附加 2 條原則合規提示至 stderr。
- **理由**：沿用現有 health-check 的 checkDef + finding + DI 模式，零新依賴。偵測邏輯全部為確定性靜態分析（regex/exists），不引入 AI 判斷。
- **取捨**：checkClosedLoop 僅偵測「有 emit 但無任何 consumer」的事件，不判斷 consumer 是否「真正使用了」該事件的語義，這使偵測保持確定性但可能有少量漏報（consumer 存在但邏輯上沒反應）。接受此取捨，因為屬 warning 級，不阻擋 CI。

## API 介面設計

### 三個新 check 函式

```javascript
// A1 — checkClosedLoop
// 偵測有 emit 但無任何 consumer 的孤立事件（warning）
// - consumer 定義：codebase 中有 timeline.query(sid, { type: 'event:name' })
//   或 timeline.latest(sid, 'event:name') 呼叫
// 無 override 參數：掃描範圍固定為 PLUGIN_ROOT（與 checkPhantomEvents 一致）
// @returns {Finding[]}
function checkClosedLoop() { ... }

// A2 — checkRecoveryStrategy
// 偵測 handler 模組 + agent 是否定義失敗恢復行為（warning）
// @param {string} [pluginRootOverride] — 供測試覆蓋 agent 目錄
// @returns {Finding[]}
function checkRecoveryStrategy(pluginRootOverride) { ... }

// A3 — checkCompletionGap
// 偵測 skill 是否缺少 references/ 子目錄（warning）
// @param {string} [skillsDirOverride] — 供測試覆蓋 skills 目錄
// @returns {Finding[]}
function checkCompletionGap(skillsDirOverride) { ... }
```

### Finding 型別（沿用現有 schema，無新增必填欄位）

```typescript
interface Finding {
  check: string;                          // 'closed-loop' | 'recovery-strategy' | 'completion-gap'
  severity: 'error' | 'warning' | 'info'; // 三個新 check 只用 warning
  file: string;                           // 相對路徑（toRelative 處理）
  message: string;                        // 人讀說明
  detail?: string;                        // 補充資訊（可選）
}
```

## 偵測演算法設計

### A1 — checkClosedLoop 演算法

```
1. 從 registry.js 取得所有 timelineEvents key → Set<string>
2. 在步驟 1 的基礎上，移除「有 emit 但無 consumer 是合理的」事件
   （session:compact-suggestion、hook:timing、queue:auto-write — 只寫不讀是設計決策）
   → exemptEvents Set
3. 收集 plugin 目錄下所有 .js（排除 health-check.js 本身 + node_modules）
4. 掃描 consumer pattern（只找直接 type string 參數）：
   - timeline.query(*, { type: 'event:name' })
   - timeline.latest(*, 'event:name')
   兩個 regex 提取所有被 query/latest 的 event key → Set<string> consumedEvents
5. 對每個 (timelineEvents key - exemptEvents)：
   若不在 consumedEvents → warning finding
```

**Consumer regex（精確匹配 type 字串）：**
```javascript
// timeline.query(sid, { type: 'event:name' }) 或含 type: 的物件字面量位置
const queryTypeRe   = /timeline\.query\s*\([^,]+,\s*\{[^}]*type\s*:\s*['"]([a-z]+:[a-z][a-z-]*)['"]/g;
// timeline.latest(sid, 'event:name')
const latestTypeRe  = /timeline\.latest\s*\([^,]+,\s*['"]([a-z]+:[a-z][a-z-]*)['"]/g;
// filter.type === 'event:name' 或 .type === 'event:name'（timeline.js 內部）
const filterTypeRe  = /\.type\s*[=!]=\s*['"]([a-z]+:[a-z][a-z-]*)['"]/g;
```

### A2 — checkRecoveryStrategy 演算法

**子項 1：Handler 模組 try-catch 掃描**
```
1. 枚舉 SCRIPTS_LIB 下 *-handler.js（9 個）
2. 讀取每個檔案，尋找：主入口函式（function handle* 或 function run 或第一個 export 函式）
3. 判斷函式 body 是否含 'try {' 語法（正則：/\btry\s*\{/）
4. 若無 → warning finding
   message: `{filename} 主入口函式缺少頂層 try-catch 保護`
```

**子項 2：Agent prompt 停止條件掃描**
```
1. 枚舉 agents/*.md
2. 讀取 body（frontmatter 以外的部分，用 gray-matter 解析）
3. 搜尋關鍵詞（任一命中即視為通過）：
   ['停止條件', 'STOP', '誤判防護', '失敗恢復', 'error recovery', '停止點']
4. 若全部未命中 → warning finding
   message: `agent "{name}" 缺少停止條件或誤判防護描述`
```

### A3 — checkCompletionGap 演算法

```
1. 枚舉 SKILLS_DIR 下各子目錄
2. 對每個 skill 目錄：檢查 {skillDir}/references/ 是否存在（existsSync）
3. 若不存在 → warning finding
   message: `skill "{name}" 缺少 references/ 目錄，可能影響補全能力偵測`
```

## 資料模型

無新的持久化資料模型。所有輸出遵循現有 Finding schema（check / severity / file / message / detail）。

## 檔案結構

```
修改的檔案：
  plugins/overtone/scripts/health-check.js
    ← 修改：新增 checkClosedLoop / checkRecoveryStrategy / checkCompletionGap 函式
    ← 修改：更新頂部 JSDoc 列表（12 項 → 15 項）
    ← 修改：runAllChecks checkDefs 新增 3 個條目
    ← 修改：module.exports 新增 3 個函式

  plugins/overtone/scripts/manage-component.js
    ← 修改：create agent 成功後新增 1 條 stderr 提示（失敗恢復策略）
    ← 修改：create skill 成功後新增 1 條 stderr 提示（references/ 補全能力）

  docs/spec/overtone-製作規範.md
    ← 修改：更新「已知缺口」狀態（待實作 → 已實作）

  docs/status.md
    ← 修改：更新 health-check 項目數 12 → 15

新增的檔案：
  tests/unit/health-check-principles.test.js
    ← 新增：3 個新 check 函式的單元測試
```

## 關鍵技術決策

### 決策 1：checkClosedLoop exempt 事件清單

- **選項 A（選擇）**：硬編碼 exempt 清單（`session:compact-suggestion`、`hook:timing`、`queue:auto-write`）— 優點：簡單確定、零誤報，與 proposal 要求一致（severity=warning 而非 error）
- **選項 B（未選）**：全部事件都強制要求 consumer，補充更多 consumer 程式碼 — 原因：部分事件本就是「fire and forget」設計，強制 consumer 反而製造不必要工作

### 決策 2：checkRecoveryStrategy 主入口函式識別

- **選項 A（選擇）**：掃描函式名稱含 `handle` 或 `run` 的函式，回退到檔案中第一個 `^function ` — 優點：與 handler 模組命名慣例完全吻合（handleAgentStop / handleSessionStart 等），精確
- **選項 B（未選）**：掃描整個檔案任意 try-catch — 原因：若輔助函式有 try-catch 但主入口無，會產生 false negative；主入口無保護才是真正的風險

### 決策 3：checkClosedLoop consumer regex 範圍

- **選項 A（選擇）**：只掃描 `timeline.query` / `timeline.latest` / `.type ===` 精確呼叫，不掃描泛化讀取 — 優點：zero false positive，只偵測「明確按 type 使用的 consumer」
- **選項 B（未選）**：任意 `query` / `readTimeline` 呼叫都算 consumer — 原因：泛化讀取（讀全部 events）不代表此 event 被處理，會產生大量 false negative

### 決策 4：DI 參數設計

- **選擇**：`checkRecoveryStrategy(pluginRootOverride)` 和 `checkCompletionGap(skillsDirOverride)` 使用 override 參數（與 checkComponentChain 一致）；`checkClosedLoop` 無參數（掃描範圍固定為 PLUGIN_ROOT，與 checkPhantomEvents 一致）
- **理由**：checkClosedLoop 本質是對 plugin 全域掃描，測試直接用真實 codebase；checkRecoveryStrategy/checkCompletionGap 需要 DI 以在 tmp 目錄建立可控測試場景

## 實作注意事項

給 developer 的提醒：

1. **exempt 事件清單位置**：在 `checkClosedLoop` 函式內硬編碼為常數 `const EXEMPT_EVENTS = new Set([...])`，不需要放到全域或 registry
2. **checkRecoveryStrategy handler 清單**：動態取自 `readdirSync(SCRIPTS_LIB).filter(f => f.endsWith('-handler.js'))`，不要硬編碼 9 個名稱，未來新增 handler 自動覆蓋
3. **manage-component.js 提示插入位置**：在現有 if/else if chain 的 `create agent` 和 `create skill` 分支中，**追加**至現有 `process.stderr.write` 呼叫後，各新增一行 stderr；不要合併或替換現有提示
4. **runAllChecks 順序**：新 3 個 check 加在 `test-growth` 之前（`quality-trends` 後），維持現有 12 個不動
5. **tests 測試結構**：沿用 `health-check-proactive.test.js` 的 describe + beforeEach/afterEach tmp 目錄模式；DI 注入方式對齊 `checkComponentChain(pluginRootOverride)` 模式
6. **module.exports 更新**：三個新函式都加入 exports，供測試 require
7. **`runAllChecks` 測試**：`health-check-proactive.test.js` 中有 `checks.length === 12` 的斷言，需同步更新為 15
