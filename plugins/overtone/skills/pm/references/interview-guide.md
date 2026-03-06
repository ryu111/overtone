# 深度訪談引擎操作指引

> **注意**：interview.js 引擎僅用於**無人值守場景**（使用者明確要求自動完成）或明確要求深度訪談/完整 Project Spec 時。
> 互動式產品訪談 📋 MUST 使用「研究先行 + AskUserQuestion」行為模式，不使用此引擎。
> 詳見 `SKILL.md` 的「研究先行原則」與 `product-manager.md` 的「Advisory 模式流程」。

PM agent 執行多輪結構化訪談的完整操作手冊。

---

## 何時使用多輪訪談

以下情境需啟動訪談引擎，而非直接進入分析：

| 情境 | 說明 |
|------|------|
| **複雜功能** | 需求涉及多個子系統、權限、狀態機 |
| **新領域** | PM 對業務領域不熟悉（電商、金融、醫療等），需先收集基本事實 |
| **無人值守場景** | 使用者不在線，需要提前收集足夠資訊讓後續階段自動執行 |
| **需求模糊** | 初始描述過於抽象（如「改善使用體驗」），需逐層追問 |

**不需要訪談**：使用者已提供完整設計文件、只是功能修改或 bug 修復、純技術重構。

---

## interview.js API 摘要

```
require('./scripts/lib/interview')
```

### 核心 API（訪談引擎）

| 函式 | 簽名 | 說明 |
|------|------|------|
| `init` | `(featureName, outputPath, options?)` | 建立新訪談 session |
| `nextQuestion` | `(session)` | 取得下一個待回答問題，null 表示問完 |
| `recordAnswer` | `(session, questionId, answer)` | 記錄回答（純函式，回傳新 session） |
| `isComplete` | `(session)` | 判斷訪談是否達到完成條件 |
| `generateSpec` | `(session)` | 從回答產生 project-spec.md 並寫入 outputPath |
| `loadSession` | `(statePath)` | 從 interview-state.json 還原 session，不存在時回傳 null |
| `saveSession` | `(session, statePath)` | 將 session 持久化到 statePath |

### 領域研究 API（新增）

| 函式 | 簽名 | 說明 |
|------|------|------|
| `researchDomain` | `(topic, language?)` | 執行領域基本概念研究（WebSearch + WebFetch），回傳 `{ summary, concepts, questions }` |
| `startInterview` | `(session, domainResearch)` | 將領域研究結果注入現有 session，回傳更新後的 session（含 `domainResearch` 欄位） |
| `getResearchQuestions` | `(session)` | 根據領域研究自動生成 3-5 個深度訪談問題，加入現有問題庫 |

**資料模型**：

```
InterviewSession：{ featureName, outputPath, answers, startedAt, completedAt, options }
Question：{ id, facet, text, required, dependsOn }
ProjectSpec：{ feature, generatedAt, facets: { functional, flow, ui, edgeCases, acceptance } }
```

**選項**：

```js
{
  minAnswersPerFacet: 2,   // 每個必問面向的最低回答數（預設 2）
  skipFacets: [],          // 跳過的面向（如：['ui']）
}
```

---

## 五面向說明

訪談圍繞五個面向展開，依序進行：

### 1. functional（功能定義）

**目標**：釐清功能的核心目的、使用者與輸入輸出。

| 問題 | 必問 | 說明 |
|------|------|------|
| func-1：核心目的與問題 | 是 | 功能解決什麼問題？不要讓使用者直接描述方案 |
| func-2：主要使用者與情境 | 是 | 誰用？什麼場景？多常發生？ |
| func-3：輸入與輸出 | 是 | 接收什麼資料？產生什麼結果？ |
| func-4：系統互動與依賴 | 否 | 與其他模組的關係 |
| func-5：Out of Scope | 否 | 明確排除項，避免範圍蔓延 |

### 2. flow（操作流程）

**目標**：定義操作步驟、成功路徑與失敗路徑。

| 問題 | 必問 | 說明 |
|------|------|------|
| flow-1：主要操作步驟 | 是 | 請使用者列 3-5 步，具體動詞 |
| flow-2：成功結果狀態 | 是 | 操作完成後系統顯示什麼？ |
| flow-3：失敗路徑 | 是 | 最常見的失敗情況與通知方式 |
| flow-4：取消與狀態恢復 | 否 | 中途取消能恢復嗎？ |
| flow-5：狀態機描述 | 否 | 列出主要狀態轉換（如：草稿→送出→完成） |

### 3. ui（UI 設計，可選）

**目標**：收集介面元素與互動模式需求。

**跳過條件（skipFacets: ['ui']）**：

- 功能是純 CLI 工具、API endpoint、背景排程
- 沒有任何 UI 需求（無 Dashboard、無表單、無視覺元件）
- 使用者明確說明不需要 UI

**判斷準則**：

```
有無「使用者直接看到或操作的介面」？
  是 → 保留 ui 面向
  否 → skipFacets: ['ui']
```

| 問題 | 說明 |
|------|------|
| ui-1：主要介面元素 | 表單、按鈕、列表、對話框等 |
| ui-2：互動模式 | 點擊、拖曳、輸入、選擇 |
| ui-3：即時反饋 | loading、進度條、即時驗證 |
| ui-4：無障礙與多語系 | a11y、i18n 需求 |

### 4. edge-cases（邊界條件）

**目標**：識別錯誤處理、極端輸入與並發情況。

| 問題 | 必問 | 說明 |
|------|------|------|
| edge-1：常見錯誤情況 | 是 | 最常見的錯誤 + 系統處理方式 |
| edge-2：極端輸入 | 是 | 空值、超長字串、特殊字符 |
| edge-3：並發衝突 | 是 | 多人同時操作同一資源 |
| edge-4：網路中斷與逾時 | 否 | 資料保護與使用者恢復流程 |
| edge-5：安全性考量 | 否 | 權限驗證、資料隔離、防惡意輸入 |

### 5. acceptance（驗收標準）

**目標**：定義可衡量的完成標準與 BDD 場景。

| 問題 | 必問 | 說明 |
|------|------|------|
| acc-1：完成定義 | 是 | 做到什麼程度算成功？須可衡量 |
| acc-2：效能指標 | 是 | 回應時間、吞吐量、可用性 |
| acc-3：BDD 場景 | 是 | 至少 3 個：正常路徑、錯誤路徑、邊界情況 |
| acc-4：測試類型 | 否 | 單元測試、整合測試、手動 UAT |
| acc-5：監控指標 | 否 | 上線後需追蹤的告警指標 |

---

## 訪談流程

### 研究先行（📋 MUST）

訪談開始前，PM 📋 MUST 先做研究，再提問。

**反模式**（⛔ 嚴禁）：什麼都不了解就直接問使用者「你想要什麼功能？」

**研究先行流程**：
```
1. 聆聽使用者描述想做什麼產品、有什麼參考
        ↓
2. PM 自己做研究（WebSearch）
   - 搜尋競品：市場上有哪些類似產品？差異在哪？
   - 搜尋市場：目標市場規模、用戶痛點、常見需求
   - 搜尋產業：法規、技術標準、業界慣例
        ↓
3. 向使用者報告研究發現（競品差異、市場概況、關鍵決策點）
        ↓
4. 基於研究，提出具體決策問題（商品類型、付費模式、技術選型等）
   而不是泛泛的「你想要什麼功能？」
```

### 標準訪談流程

```
1. 研究先行（WebSearch 競品/市場/痛點）— 📋 MUST，不可省略
        ↓
2. 向使用者報告研究發現
        ↓
3. 領域研究（新領域時，用 researchDomain API）
        ↓
4. 初始化 session（init）
        ↓
5. 取得下一個問題（nextQuestion）→ null 時跳到步驟 8
        ↓
6. 向使用者提問，收集回答
        ↓
7. 記錄回答（recordAnswer）→ 儲存進度（saveSession）→ 回到步驟 5
        ↓
8. 完成判斷（isComplete）
   - 通過 → 產生規格（generateSpec）
   - 未通過 → 繼續追問必問題
```

### 中斷恢復

每次 `recordAnswer` 後立即 `saveSession`，確保進度不丟失：

```
session = loadSession(statePath)   // 偵測現有進度
if (session) {
  // 恢復訪談，繼續未完成的問題
} else {
  session = init(featureName, outputPath, options)
}
```

`loadSession` 在以下情況回傳 null：
- 狀態檔不存在（全新訪談）
- 狀態檔損壞（JSON 解析失敗）

---

## 領域研究整合

**PM 進入陌生領域時，先研究再訪談。**

研究目標：理解基本術語、常見流程、業界標準，避免向使用者問出外行問題。

### 研究流程

```javascript
// 1. 自主研究領域（新領域時）
const research = await researchDomain('電商結帳流程');
// 回傳：{ summary: '...', concepts: ['購物車', '支付閘道'], questions: ['如何處理...?'] }

// 2. 建立訪談 session
let session = init(featureName, outputPath);

// 3. 注入研究結果
session = startInterview(session, research);
// 現在 session.domainResearch 包含研究結果

// 4. 注入深度問題
const deepQuestions = getResearchQuestions(session);
// 根據領域研究自動生成 3-5 個深度問題，加入問題庫

// 5. 開始訪談
// 訪談引擎會優先提出深度問題，最大化資訊蒐集效率
```

### 重點

- **先研究後訪談**：`researchDomain` → `startInterview` → `getResearchQuestions` → 開始訪談
- **不要顛倒順序**：先 `init` session 再研究會導致深度問題無法注入
- **Session 持久化包含研究結果**：`saveSession` / `loadSession` 自動保存與還原 `domainResearch` 欄位
- **語言支援**：`researchDomain(topic, 'zh-TW')` 指定繁體中文研究

---

## 呼叫範例

### 帶領域研究的完整訪談流程

```bash
node -e "
const interview = require('./plugins/overtone/scripts/lib/interview');
const path = require('path');

// 1. 研究領域（新領域時）
const research = interview.researchDomain('支付閘道整合');

// 2. 初始化訪談 session
let session = interview.init('payment-checkout', '/tmp/checkout-spec');

// 3. 注入領域研究結果
session = interview.startInterview(session, research);

// 4. 自動生成深度問題
const deepQs = interview.getResearchQuestions(session);
console.log('深度問題：', deepQs);

// 5. 開始訪談
console.log('訪談開始，featureName:', session.featureName);
console.log('第一個問題:', interview.nextQuestion(session));
"
```

### 標準訪談流程（不需領域研究）

```bash
node -e "
const interview = require('./plugins/overtone/scripts/lib/interview');

// 初始化（有 UI 需求時不跳過 ui 面向）
let session = interview.init('payment-checkout', '/tmp/checkout-spec');

// 跳過 ui（純 API 功能）
// let session = interview.init('data-export-api', '/tmp/export-spec', { skipFacets: ['ui'] });

console.log('訪談開始，featureName:', session.featureName);
console.log('第一個問題:', interview.nextQuestion(session));
"
```

### 記錄回答並儲存進度

```bash
node -e "
const interview = require('./plugins/overtone/scripts/lib/interview');
const STATE_PATH = '/tmp/interview-state.json';

// 嘗試還原現有進度
let session = interview.loadSession(STATE_PATH)
  || interview.init('my-feature', '/tmp/my-spec');

// 取得下一個問題
const q = interview.nextQuestion(session);
if (q) {
  console.log('[' + q.facet + '] ' + q.text);
  // 記錄回答（純函式，回傳新 session）
  session = interview.recordAnswer(session, q.id, '使用者的回答');
  interview.saveSession(session, STATE_PATH);
  console.log('進度已儲存');
}

// 判斷是否完成
if (interview.isComplete(session)) {
  const spec = interview.generateSpec(session);
  console.log('Project Spec 已寫入 outputPath/project-spec.md');
}
"
```

### 直接查詢問題庫

```bash
node -e "
const { QUESTION_BANK } = require('./plugins/overtone/scripts/lib/interview');
const required = QUESTION_BANK.filter(q => q.required);
console.log('必問題數：', required.length);
console.log('面向分布：', [...new Set(required.map(q => q.facet))]);
"
```

---

## 完成判斷邏輯

`isComplete` 的判斷規則：

1. **必問面向**：`functional`、`flow`、`edge-cases`、`acceptance`（四個）
2. **ui 面向**：全為補充題，不影響完成判斷
3. **skipFacets**：被跳過的面向不計入完成判斷
4. **閾值**：每個必問面向的**必問題回答數** >= `minAnswersPerFacet`（預設 2）

**範例**：

```
minAnswersPerFacet = 2, skipFacets = ['ui']

functional: 已答 func-1, func-2, func-3 (3 必問題) → 達標
flow:       已答 flow-1, flow-2 (2 必問題)          → 達標
edge-cases: 已答 edge-1 (1 必問題)                  → 未達標，繼續追問
acceptance: 已答 acc-1, acc-2, acc-3 (3 必問題)     → 達標

結果：isComplete = false（edge-cases 不足）
```

---

## 常見操作模式

### 追問模式（必問題未達閾值）

`nextQuestion` 會自動優先返回必問題（先於補充題）。若某面向必問題未達標，繼續呼叫 `nextQuestion` 即可取得下一題。

### 補充題模式（必問題已全答）

所有必問題回答完畢後，`nextQuestion` 開始返回補充題。補充題的 `dependsOn` 前置問題未回答時會跳過。

### 快速模式（只問必問題）

若希望只問必問題，完成後立即產生規格，在 `nextQuestion` 返回補充題時停止訪談並呼叫 `generateSpec`。
