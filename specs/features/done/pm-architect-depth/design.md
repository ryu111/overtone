# PM-Architect 深度改進 — 技術設計

## 技術摘要（What & Why）

- **方案**：就地修改（In-place modification），不新增抽象層
- **理由**：所有變更都是在現有模組內新增內容（問題項目、checklist 項目、文字段落），沒有跨模組新 API，最小化風險
- **取捨**：MoSCoW 警告採用 keyword 比對（非結構化解析），準確率有限但靜默降級不影響主流程；proposal.md 格式未強制標準化，掃描可能找不到檔案

---

## T1：interview.js — flow 面向新增 3 個必問題

### 修改位置

`plugins/overtone/scripts/lib/interview.js`，在 `QUESTION_BANK` 陣列的 `// ── flow（3 必問 + 2 補充）──` 區塊末尾（flow-5 之後），新增三個問題物件。

### 新增問題定義

```javascript
// ── flow（原 3 必問 + 2 補充，新增後 6 必問 + 2 補充）──
{
  id: 'flow-6',
  facet: 'flow',
  text: '使用者從哪個頁面或入口點觸發這個操作？完成前的上下文是什麼？',
  required: true,
  dependsOn: null,
},
{
  id: 'flow-7',
  facet: 'flow',
  text: '操作完成後，使用者最可能想做什麼？系統應引導他們到哪裡（post-action flow）？',
  required: true,
  dependsOn: null,
},
{
  id: 'flow-8',
  facet: 'flow',
  text: '這個操作的結果需要即時反映在哪些其他頁面或元件上？',
  required: true,
  dependsOn: null,
},
```

### 設計決策

- **全設 required: true**：入口點、post-action、狀態傳播都是 Acid Test 直接暴露的遺漏，設為必問
- **dependsOn: null**：三題都是獨立問題，不依賴前置問題
- **minAnswersPerFacet 不變**：仍為 2，flow 面向從 3 必問增至 6 必問，完成門檻不受影響（只需回答 2 道必問題即通過）
- **flow-5 之後插入**：flow-5 是 optional（依賴 flow-4），新增題放在所有 flow 問題最後，避免干擾排序

### 位置確認

當前 flow 區塊為第 80-115 行（flow-1 到 flow-5），新增三題後 flow 區塊擴展至約第 130 行。

---

## T2：architect.md — DO 清單新增跨元件狀態同步

### 修改方式

透過 `manage-component.js update agent architect` 的 `body` 欄位替換。developer 需先 Read architect.md 現有正文，在 DO 清單和誤判防護兩處插入內容。

### DO 清單新增項目

在現有 DO 清單（`## DO（📋 MUST）` 區塊）的最後一條 `💡 選擇最簡單能滿足需求的方案` 之前插入：

```
- 📋 若方案涉及跨頁面/跨元件的資料變動，MUST 定義狀態同步策略（前端 store / event bus / polling / SSE），並在 design.md 中說明選擇理由
```

### 誤判防護新增項目

在現有 `## 誤判防護` 區塊末尾新增：

```
- 「純後端功能不需要狀態同步」是誤判 — 後端跨模組狀態傳播（如快取失效、訂閱通知）同樣需要明確設計
```

### 設計決策

- 在 DO 清單插入而非附加至結尾，保持「分析 → 設計 → 定義 → 規劃 → 確保」的邏輯流
- 誤判防護明確點出「只有前端才需要狀態同步」的反模式，擴展適用範圍

---

## T3：product-manager.md — UX flow 研究指引強化

### 修改方式

透過 `manage-component.js update agent product-manager` 的 `body` 欄位替換。developer 需先 Read product-manager.md 現有正文，修改兩處。

### Advisory 模式流程步驟 2 的修改

現有步驟 2：
```
2. **研究**（📋 MUST）：用 WebSearch 搜尋競品、市場現況、產業痛點、法規風險
```

改為：
```
2. **研究**（📋 MUST）：用 WebSearch 搜尋競品、市場現況、產業痛點、法規風險；**研究競品時 MUST 包含 UX flow**（主要操作路徑、post-action 引導設計），不可只列功能清單
```

### DO 清單新增項目

在 `## DO（📋 MUST）` 區塊的 `📋 提問前 MUST 先用 WebSearch 研究競品...` 那條之後插入：

```
- 📋 競品研究 MUST 包含 UX flow 研究：「使用者如何完成主要操作」「完成後系統引導使用者做什麼（post-action）」，不可只比較功能清單
```

### 設計決策

- 改步驟 2 是「規範變更」，告知必須做什麼
- 改 DO 清單是「可查手冊」，讓 agent 執行前能 grep 到明確指令
- 兩處都改確保無論從哪個路徑讀取 prompt 都能命中

---

## T4：architecture skill — 新建 state-sync-patterns.md

### 新建檔案

`plugins/overtone/skills/architecture/references/state-sync-patterns.md`

### 文件結構設計

```
# 跨元件/頁面狀態同步模式

## 決策樹：選擇哪種同步模式？

（文字決策樹）

## 四種模式詳解

### 1. Props Drilling / Component State（本地狀態）
### 2. 全域 Store（Vuex / Pinia / Redux / Zustand）
### 3. Event Bus（自訂事件匯流排）
### 4. Server State（API Polling / SSE / WebSocket）

每種模式：適用場景 + tradeoff + 反模式警告 + Overtone 設計時的引用方式

## 後端跨模組狀態傳播
（簡述：event sourcing / 快取失效通知）

## Overtone 架構整合注意事項
```

### 完整文件草稿

```markdown
# 跨元件/頁面狀態同步模式

> 來源：Overtone Architect Knowledge Domain

## 決策樹：選擇哪種同步模式？

```
資料需要跨元件/頁面共享嗎？
  │
  ├── 否（只有當前元件用）→ 本地 Component State（不需要同步）
  │
  └── 是
        │
        ├── 資料來源是伺服器（後端 API）？
        │     ├── 是，需要即時推送 → SSE / WebSocket（Server State Push）
        │     ├── 是，輪詢可接受 → API Polling（Server State Pull）
        │     └── 是，只需一次性載入 → 前端 Store 快取（全域 Store + fetch）
        │
        └── 資料來源是前端操作（不需要後端）？
              ├── 只有 2-3 個關聯元件 → Props / Context 傳遞
              ├── 跨多個頁面或深度巢狀 → 全域 Store
              └── 需要解耦（元件互不知道彼此）→ Event Bus
```

## 四種模式詳解

### 1. 本地狀態（Component State / Props Drilling）

**適用場景**：
- 狀態只在父子元件之間共享
- 元件樹深度 <= 3 層
- 不需要跨頁面保持狀態

**Tradeoff**：
- 優點：最簡單，無額外依賴，易於追蹤
- 缺點：超過 3 層後 props drilling 維護成本高
- 缺點：頁面切換後狀態丟失

**反模式警告**：
- 用 props drilling 傳遞超過 4 層 — 改用全域 Store
- 在 localStorage 模擬全域狀態 — 用正式的 Store

**Architect 設計時**：
- 繪製元件樹時標注哪些資料需要跨層傳遞
- 超過 2 層即評估是否改用 Store

---

### 2. 全域 Store（Vuex / Pinia / Redux / Zustand）

**適用場景**：
- 狀態需要在多個頁面間保持
- 多個不相關元件需要讀/寫同一資料
- 需要時間旅行 debug 或嚴格的狀態追蹤

**Tradeoff**：
- 優點：單一資料來源（Single Source of Truth）
- 優點：任何元件都能訂閱，解耦
- 缺點：引入框架依賴，增加程式碼量
- 缺點：過度使用導致所有狀態都全域化（反模式）

**反模式警告**：
- 把所有狀態都放 Store — 只放需要跨元件共享的
- Store 中放 UI 狀態（如 modal 開關）— 保留在本地 Component State

**Architect 設計時**：
- 在 design.md 的資料模型章節列出「Store 中的 state shape」
- 說明哪些操作會 mutate Store，影響哪些頁面

---

### 3. Event Bus（自訂事件匯流排）

**適用場景**：
- 元件之間需要傳遞訊息，但不想直接依賴
- 一對多通知（一個操作觸發多個元件更新）
- 解耦兩個不相關模組

**Tradeoff**：
- 優點：完全解耦，發送方不需要知道接收方
- 缺點：事件流難以追蹤（隱性依賴）
- 缺點：未移除的 listener 造成記憶體洩漏
- 缺點：沒有型別安全

**反模式警告**：
- 用 Event Bus 替代 Store 管理業務狀態 — 業務狀態放 Store
- 不移除 listener — 元件銷毀時 MUST 呼叫 `off`

**Architect 設計時**：
- 若使用 Event Bus，在 design.md 列出所有事件名稱和 payload 格式
- Overtone 的 remote/event-bus 可作為後端事件匯流排的參考

---

### 4. Server State（API Polling / SSE / WebSocket）

**適用場景**：
- 狀態由後端維護（資料庫、Session）
- 多個使用者/視窗需要看到同步狀態
- 需要即時推送（如通知、進度更新）

**子模式選擇**：

| 子模式 | 適用 | 延遲 | 複雜度 |
|--------|------|------|--------|
| API Polling | 允許 1-5 秒延遲 | 中 | 低 |
| SSE（伺服器推送）| 一對一，單向推送 | 低 | 中 |
| WebSocket | 雙向即時通訊 | 極低 | 高 |

**Tradeoff**：
- 優點：狀態以後端為主，前端只是顯示層
- 優點：多視窗自動同步
- 缺點：依賴網路，需要處理連線失敗
- 缺點：增加後端複雜度（連線管理）

**反模式警告**：
- 用 WebSocket 替代所有 HTTP API — 只用於需要即時雙向的場景
- Polling interval 太短（< 1 秒）— 用 SSE 替代

**Architect 設計時**：
- 在 design.md 明確指定後端資料更新 → 前端感知的路徑
- Overtone Dashboard 的 SSE 實作可作為參考（`scripts/lib/dashboard/`）

---

## 後端跨模組狀態傳播

後端架構同樣面臨狀態同步問題（不局限於前端）：

| 場景 | 推薦模式 |
|------|----------|
| Service A 更新資料，Service B 需要感知 | Event 發布/訂閱（EventBus） |
| 快取資料失效 | Cache-Aside + TTL，或 Write-Through |
| 分散式事務 | Saga Pattern（補償事務） |
| 狀態機轉換通知 | Domain Event + 訂閱者 |

---

## Architect 設計整合

在 design.md 中明確狀態同步策略：

```
## 狀態同步策略

資料流：{操作描述} → {Store/API/Event} → {影響的元件/頁面}

選擇依據：{為何選此模式}
```

**Checklist（設計 review 時確認）**：
- [ ] 列出所有跨元件共享的狀態
- [ ] 確認每個狀態的 owner（哪個元件/API 是 source of truth）
- [ ] 定義更新傳播路徑（操作 → 狀態更新 → UI 反映）
- [ ] 考慮離線/網路失敗情況下的狀態一致性
```

### SKILL.md 新增 reference 項目

在 `plugins/overtone/skills/architecture/SKILL.md` 的資源索引表格中新增一行：

```
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/architecture/references/state-sync-patterns.md` | 跨元件/頁面狀態同步四種模式（Props/Store/EventBus/Server State）+ 決策樹 |
```

---

## T5：interview-guide.md — flow 面向同步更新

### 修改位置

`plugins/overtone/skills/pm/references/interview-guide.md`，找到 `### 2. flow（操作流程）` 區塊的必問題表格，新增三行。

### 表格新增行

在現有 `| flow-5：狀態機描述 | 否 | 列出主要狀態轉換（如：草稿→送出→完成） |` 之後新增：

```markdown
| flow-6：入口點與上下文 | 是 | 使用者從哪個頁面/入口點觸發？觸發前的上下文是什麼？ |
| flow-7：post-action flow | 是 | 操作完成後使用者最可能想做什麼？系統應引導去哪？ |
| flow-8：狀態傳播範圍 | 是 | 操作結果需要即時反映在哪些其他頁面或元件？ |
```

### 區塊標題更新

現有標題：`### 2. flow（操作流程）`，**不需修改**，但下方說明文字「**目標**：定義操作步驟、成功路徑與失敗路徑。」可保持不變，新增的三題自然延伸此目標。

---

## T6：pre-task-handler.js — MoSCoW 警告注入

### 設計概覽

在 `handlePreTask` 函式的「組裝 updatedInput」段（第 260 行附近），於現有 `failureWarning` 注入之後新增 `moscowWarning` 注入，對象是 `developer` 和 `architect` agent。

### 新增邏輯的 interface

```javascript
/**
 * 從 Product Brief（proposal.md）讀取 MoSCoW 項目並比對 prompt
 *
 * @param {string} projectRoot - 專案根目錄
 * @param {string} targetAgent - 目標 agent 名稱
 * @param {string} originalPrompt - 原始 task prompt
 * @returns {string|null} 警告文字，若無警告則回傳 null
 */
// function buildMoscowWarning(projectRoot, targetAgent, originalPrompt): string | null
```

### 實作邏輯（pseudo-code）

```
1. 只對 developer / architect 執行（其他 agent 直接回傳 null）
2. 掃描 {projectRoot}/specs/features/in-progress/*/proposal.md
   - 找到多個時取最新修改時間的
   - 找不到則靜默降級 return null
3. 讀取 proposal.md 內容，提取 Should/Could 項目
   - 尋找 `**Should**:` 或 `- **Should**:` 區塊後的列表項目（`- ` 開頭）
   - 尋找 `**Could**:` 或 `- **Could**:` 區塊後的列表項目
   - 解析停止條件：碰到下一個 `**` 標題即停止
4. 比對 originalPrompt 中的關鍵詞
   - 將每個 Should/Could 項目文字拆成 token（2 字以上的詞）
   - 若 prompt 中包含任何 token，記錄此項目為「命中」
5. 若有命中的 Should/Could 項目，組裝警告訊息：
   [PM MoSCoW 警告]
   以下功能在 Product Brief 中標記為 Should/Could（非 Must），
   請確認是否在本次 MVP 範圍內，避免 scope creep：
   - [命中的 Should 項目 1]
   - [命中的 Should 項目 2]
   若確認要實作，請在 Handoff 中說明理由。
6. 回傳警告文字（或 null）
```

### 注入位置（pre-task-handler.js）

在現有的 `failureWarning` 注入段之後（約第 356 行），新增：

```javascript
// MoSCoW 警告注入（只對 developer / architect，靜默降級）
const MOSCOW_WARNING_AGENTS = ['developer', 'architect'];
let moscowWarning = null;
try {
  if (MOSCOW_WARNING_AGENTS.includes(targetAgent)) {
    moscowWarning = buildMoscowWarning(projectRoot, targetAgent, toolInput.prompt || '');
  }
} catch { /* 靜默降級 */ }
```

### updatedInput 組裝順序更新

原順序：`[PARALLEL INSTANCE] → workflowContext → skillContext → gapWarnings → globalObs → scoreContext → failureWarning → testIndex → originalPrompt`

新順序：`[PARALLEL INSTANCE] → workflowContext → skillContext → gapWarnings → globalObs → scoreContext → failureWarning → moscowWarning → testIndex → originalPrompt`

MoSCoW 警告放在 failureWarning 之後、testIndex 之前，屬於「上下文注入」類別，不應影響測試索引的可讀性。

### 邊界設計

- `buildMoscowWarning` 函式作為 module-private 函式定義在 `pre-task-handler.js` 內（不 export）
- 不新增外部依賴，只使用 `fs`（已被引入）和 `path`（已被引入）
- 整個邏輯包在 try/catch，任何錯誤靜默降級

---

## 檔案結構

```
修改的檔案：
  plugins/overtone/scripts/lib/interview.js              ← 修改：QUESTION_BANK 新增 flow-6/7/8
  plugins/overtone/skills/pm/references/interview-guide.md  ← 修改：flow 面向表格新增三行（依賴 T1）
  plugins/overtone/scripts/lib/pre-task-handler.js       ← 修改：新增 buildMoscowWarning + moscowWarning 注入
  plugins/overtone/agents/architect.md                   ← 修改：DO 清單 + 誤判防護（manage-component.js）
  plugins/overtone/agents/product-manager.md             ← 修改：步驟 2 + DO 清單（manage-component.js）
  plugins/overtone/skills/architecture/SKILL.md          ← 修改：資源索引新增一行（manage-component.js）

新增的檔案：
  plugins/overtone/skills/architecture/references/state-sync-patterns.md  ← 新增：狀態同步模式 reference
  tests/unit/interview.test.js                           ← 修改：新增 flow-6/7/8 測試
  tests/unit/pre-task-handler.test.js                    ← 修改：新增 MoSCoW 警告測試
```

---

## 關鍵技術決策

### 決策 1：MoSCoW 警告用 keyword 比對還是結構化解析

- **選項 A（選擇）：keyword 比對** — 將 Should/Could 項目文字拆 token 後在 prompt 中搜尋。優點：實作簡單、靜默降級容易；缺點：誤判率較高（若 prompt 中碰巧出現相同詞）
- **選項 B（未選）：結構化解析 Product Brief** — 需要 Product Brief 有固定格式，目前 proposal.md 格式不統一，過早標準化

### 決策 2：MoSCoW 警告的 Brief 路徑策略

- **選項 A（選擇）：掃描 `specs/features/in-progress/*/proposal.md`，取最新修改時間** — 靜態規則，不依賴 workflow 狀態，實作簡單
- **選項 B（未選）：從 workflow.json 的 featureName 直接組路徑** — 依賴 featureName 和目錄名稱完全一致，假設可能不成立

### 決策 3：state-sync-patterns.md 是否涵蓋後端

- **選項 A（選擇）：同時涵蓋前端四模式 + 後端跨模組簡述** — architect 設計時後端狀態傳播同樣需要考慮（誤判防護的根據）
- **選項 B（未選）：只涵蓋前端** — Acid Test 的 issue 雖然是前端，但 architect 誤判防護應涵蓋後端場景

### 決策 4：flow-6/7/8 是否全設 required: true

- **選項 A（選擇）：全設 required: true** — 三題都是 Acid Test 直接暴露的遺漏（入口點/post-action/狀態傳播），設為可選等於未解決問題
- **選項 B（未選）：部分設為 required: false** — 降低訪談長度，但犧牲覆蓋深度

---

## 實作注意事項

給 developer 的提醒：

1. **agent .md 修改唯一合法路徑**：architect.md 和 product-manager.md 受 pre-edit guard 保護，MUST 使用 `manage-component.js update agent <name> '{"body": "..."}'`，不可直接 Edit
2. **updateAgent body 替換是完整替換**：developer 必須先 Read 現有正文，完整替換（含已有的所有章節），只在正確位置插入新內容
3. **SKILL.md 同樣受 guard 保護**：architecture SKILL.md 的修改也要透過 `manage-component.js update skill architecture`
4. **interview.js 可直接 Edit**：interview.js 不是元件檔案，可用 Edit 工具直接修改
5. **pre-task-handler.js 的 `const { readFileSync, existsSync } = require('fs')`**：`fs` 和 `path` 都已在 gap detection 段被 inline require，MoSCoW 邏輯可直接用（但要注意 `fs` 在 MoSCoW 函式 scope 中需重新 require，因為外層是 try/catch 的 inline require）
6. **proposal.md 掃描**：用 `fs.readdirSync` 或 Glob-like 掃描 `specs/features/in-progress/` 目錄，找 `proposal.md`，取 `fs.statSync(...).mtimeMs` 最大者
7. **測試**：pre-task-handler.test.js 現有測試不可破壞；interview.test.js 的 QUESTION_BANK 相關測試需更新（flow 面向 required 題數從 3 變 6）
