# Reflection Execution Check 設計討論（xd-63z8）

> P2 第 1 輪。**重大發現**：reflection-resolver.js 已存在但無 hook 接線 — META BLIND SPOT 重演（同 xd-5mja）。
> 真正的 P2 不是新建 hook，而是把現有 resolver script 接線。

## 0. 前置調查（Manager 要求）— 揭露現況

### 既有元件清單

| 元件 | 行數 | 職責 | 接線狀態 |
|------|:---:|------|:--------:|
| `hooks/modules/reflection-persist.js` | 196 | Stop hook 抓 ★ Insight → parse → persist 到 jsonl | ✅ Stop hook 已接 |
| `hooks/modules/reflection-resolver-check.js` | 73 | Stop hook 警告 backlog（>5 unresolved + >24h） | ✅ Stop hook 已接 |
| `hooks/modules/reflection-counter.js` | ? | 反思計數 | ✅ 已接 |
| `hooks/modules/reflect-guard.js` | ? | 反思品質守護 | ✅ 已接 |
| `scripts/reflection-resolver.js` | 130+ | **CLI 工具**：掃 jsonl → verifyCommit/verifyFile/verifyRuleRef → 自動回填 resolved_at | ❌ **無 hook 接線** |

### Schema 現況

`reflection-persist.js` 已強制 VERIFIABLE_PATTERNS：
```js
const VERIFIABLE_PATTERNS = [
  /\b[a-f0-9]{7,40}\b/,                  // commit hash
  /(?:\.\/|~\/|\/)[\w\-/.一-龥]+\.(md|js|ts|json|jsonl|tsx|jsx|sh)/, // file
  /rules\/[\w\-/.一-龥]+\.md/,            // rule ref
  /skills\/[\w\-]+\/?/,                  // skill ref
  /hooks\/modules\/[\w\-]+\.js/,         // hook ref
  /無需修改[，,]\s*原因[：:]/,            // explicit no-op
];
```

行動陣列不是純字串也不是純結構化，是**「半結構化字串」** — 字串但 schema 強制含可驗證 ref 之一。

### scripts/reflection-resolver.js 已實作的能力

- `verifyCommit(hash, repo)`：`git show --no-patch <hash>` 確認存在
- `verifyFile(path, cwd)`：existsSync + isFile
- `verifyRuleRef(ref, claudeDir)`：existsSync 或 grep rules/
- `verifyActionString(action)`：抓 commit/file/rule pattern → 任一驗證通過
- `resolveEntry(entry)`：所有行動 verified → 返回 ISO timestamp
- `resolveAll(path)`：讀 jsonl → resolve null entries → 寫回

**結論**：P2 想要的「行動執行驗證」**邏輯已經寫好**，只缺 hook 接線觸發。

---

## 1. 反駁 Manager P2 假設前提

### 反駁「reflections.jsonl 只記不查」

**錯**。`reflection-resolver.js` script 已實作完整查驗邏輯。真實狀態是：
- ✅ jsonl 寫入（reflection-persist.js）
- ✅ 查驗邏輯（scripts/reflection-resolver.js）
- ✅ 警告積壓（reflection-resolver-check.js）
- ❌ **缺接線**：resolver script 是手動 CLI，沒有 hook 自動觸發

P2 真正的修法不是「擴展 reflection-resolver-check.js 加行動驗證」，而是：

**把 scripts/reflection-resolver.js 接線到 hook event**

這是 META BLIND SPOT 第二例：寫好的工具沒接線 = 形同不存在。第一例是 xd-5mja structural-invariants（hook 寫好但 LOCAL_MODULES 未註冊）。

---

## 2. 反駁 Manager 5 質疑（基於正確現況）

### Q1：行動格式是否結構化

**答：c) 半結構化**（混合）。VERIFIABLE_PATTERNS 強制行動字串含 commit/file/rule/skill/hook ref pattern，但行動本身仍是自由字串。

**不需 migration**。半結構化已能 programmatic check（regex 抓 ref → existsSync/git show 驗證）。`scripts/reflection-resolver.js` 已實作。

### Q2：驗證時機

**反駁 a (寫入時)**：行動通常是「下次才做」，立即驗證 100% 失敗，無意義。

**反駁 b (下次 Stop check)**：時機晚 1 個 session，但符合「行動延遲執行」常態 — 部分接受。

**反駁 d (PreCompact batch)**：太晚，compact 是事後總結。

**接受 c (PostToolUse 偵測 commit/Edit → 標記 done) + b (Stop check) 組合**：

我的版本 — **event-driven 標記 + Stop 統一 check**：
- **PostToolUse:Bash + git commit** → 解析 commit hash → 跑 `resolveAll(jsonl)` 中相關 entries → 若有 unresolved entry 含此 hash → 標記 resolved_at
- **PostToolUse:Edit/Write** → file path → 同上但 grep 含此 path 的 unresolved entry
- **Stop hook** → 跑現有 detectBacklog 但**擴展為兩類警告**：(1) backlog >5 + >24h（既有）(2) 行動 ref 失效（新增：`verifyActionString` 返回 verifiable=true verified=false 的 entries）

### Q3：未執行反思怎麼處理

**反駁 b (block)**：反思積壓不該 block — 否則永遠 stop 不了，破壞 ralph-loop。

**反駁 c (debt jsonl 累積)**：已有 reflections.jsonl resolved_at=null 就是 debt 紀錄，不需另開檔案。

**接受 a (systemMessage)**：跟既有 reflection-resolver-check 一致。但**擴展為兩類訊息**：
1. **「積壓警告」**（既有）：>5 unresolved + >24h
2. **「行動失效警告」**（新增）：refl 行動含 commit hash 但 git show 失敗 / 含 file path 但 existsSync false / 含 rule ref 但 grep 不到 → systemMessage 列出失效行動

**為什麼不 block**：反思是事後反省，行動失效可能是 false positive（commit 在另一 repo / file 已 rename / rule 已合併）。block 風險高，warn 風險低。

### Q4：跟 dogfooding-tracker 的關係

**不該合併。理由是 commitment 類型不同**：
- **dogfooding-tracker**：追「**新元件需驗證**」— element-driven，trigger=檔案被建立
- **reflection-execution-check**：追「**反思承諾的行動需執行**」— promise-driven，trigger=反思被寫入

重疊區（反思承諾建新 hook → 兩者都追蹤）是**特性不是 bug** — 兩者可獨立 fail/pass。範例：
- 反思說「建 hooks/modules/X.js」→ reflection-execution-check 看 X.js 是否存在
- X.js 真的建了 → dogfooding-tracker 看 X.js 是否被 dogfood 驗證
- 兩個 hook 互不干涉，serialized check 兩階段

**反駁合併成「commitment-tracker」**：抽象過頭。兩者 state schema 完全不同（dogfooding 看檔案 + age + commits_since；reflection 看 jsonl entries + verifiable refs），合併等於建巨型 hook 雙職責。SRP 違反。

### Q5：誤判風險

**接受真盲點，但已有結構性防護**。

- 散文行動進不來：`reflection-persist.js` 的 `validateActions` 已對無 VERIFIABLE_PATTERN 的散文行動發 warning 並仍寫入 — 但 reflection-execution-check 只 check 已通過 schema 驗證的具體 ref（commit/file/rule/skill/hook）
- 模糊行動「記 memory / 寫 skill / 改 rule」必須含具體 ref → 通過 schema → 可驗證
- **邊界 case**：file 確實存在但內容不對 → 不檢查內容（出 LLM-judge 範圍）。承認此 false negative 但合理 — 比 false positive 安全

**Tradeoff 判斷**：
- false positive（誤標 resolved）= 放過真未執行行動 → 危險（隱性失誤）
- false negative（誤判未 resolved）= 提醒已執行行動 → 煩人但安全

選 false negative 偏向。reflection-resolver.js 既有 `resolveEntry` 邏輯是 `allOk && anyOk` — 全部行動驗證通過才 resolve，符合 false negative 偏向。

---

## 3. 我的設計版本

### 核心策略

**不新建 hook 模組**，而是：
1. **新建 `hooks/modules/reflection-execution-check.js`**（薄 wrapper），匯入 `scripts/reflection-resolver.js` 的 `resolveAll` + `verifyActionString`
2. **接線 PostToolUse:Bash + PostToolUse:Edit/Write + Stop**
3. **擴展 reflection-resolver-check.js 加第二類警告**

或者更精簡：

**只接線既有 reflection-resolver.js + 擴展 reflection-resolver-check.js**：
- reflection-resolver-check.js 加 import resolveAll 並 inline 跑 → 自動 resolve 後再警告 backlog
- 不新建 hook 模組

我傾向**第二方案**（更輕量，避免新建第三個 reflection 相關 hook 加深 reflection 家族混亂 — 已 4 個 hook 是輪 1 #3 的 debt）。

### 修改範圍

| 檔案 | 改動 |
|------|------|
| `hooks/modules/reflection-resolver-check.js` | 加 import resolveAll + 在 checkResolverBacklog 開頭呼叫 → 自動 resolve 後再 detectBacklog；若有 verifiable=true verified=false 的 entries → 加第二類警告 |
| `scripts/reflection-resolver.js` | 不動（CLI 入口仍可用） |
| `hooks/hook-client.js` | 不動（reflection-resolver-check 已接 Stop） |
| `tests/unit/reflection-resolver-check.test.js` | 加 case 驗證自動 resolve 行為 + 第二類警告 |

### 流程

```
Stop event
  → reflection-resolver-check.checkResolverBacklog
    → 1. 跑 resolveAll(reflections.jsonl) [新增] — 自動回填可驗證 entries
    → 2. 載入更新後 reflections（最近 10 筆）
    → 3. detectBacklog [既有] — 警告 backlog
    → 4. detectInvalidActions [新增] — 警告行動 ref 失效
    → return systemMessage 含兩類警告
```

### 成本重估

| 項 | 估時 |
|---|:---:|
| reflection-resolver-check.js 擴展（resolveAll 整合 + detectInvalidActions） | 30 min |
| Unit test 加 case（自動 resolve + 第二類警告） | 30 min |
| Meta-dogfood（跑一次實際反思看是否 auto-resolve） | 15 min |
| **總** | **~1.25h**（比 Manager 原估 1h 略高） |

**比 P0/P1 便宜很多**（P0 ~3h, P1 ~2.5h），因為**邏輯已存在只需接線**。

---

## 4. 反問 Manager（輪 2）

1. 接受「META BLIND SPOT 重演」的診斷嗎？P2 真問題是接線而非新建？
2. 第二方案（擴展現有 resolver-check，不新建 hook 模組）vs 第一方案（新建薄 wrapper 模組）— 哪個治本？
3. event-driven 標記（PostToolUse 偵測 commit）vs Stop hook 跑 resolveAll — 我選後者（更簡單），同意嗎？
4. 兩類 warning（積壓 + 行動失效）合成單一 systemMessage 還是分開？
5. Reflection hook 家族 4 個（persist/resolver-check/counter/reflect-guard）的命名混亂在輪 1 #3 提過 — 本次 P2 是否該順手重命名收斂？還是延後另一輪 dispatch？

---

**verdict**：iterate — 揭露 META BLIND SPOT 重演 + 5 反問等 Manager 收斂。**重要**：本輪沒實作但發現「scripts/reflection-resolver.js 未接線」這個結構性缺陷比 P2 原命題更上游。

---

## 5. 討論輪 2 — Q_A 短答 + 收斂

Manager 接受 META BLIND SPOT 診斷 + 第二方案 + Stop hook + 合 warning + 重構延後。提 Q_A：

### Q_A：P0 dogfooding-tracker 為何沒抓 historical orphan script？

**答：P3 + Phase 0b 雙軌，不該由 P0 補**。

P0 的 RUNTIME_AFFECTING regex 只在 `PostToolUse:Edit/Write` 觸發 — 設計上**只追新建/修改**，不掃既存元件。這是合理的 scope（dogfooding-tracker 名字就是「tracker」不是「scanner」）。

歷史債務該由：
- **P3 autonomy-self-scan.js** 的「sensor test」加一條：「scan ~/.claude/scripts/ 下每個 runtime-affecting script，grep hooks/hook-client.js 看是否接線；無接線 → 列 orphan candidates」
- **或 Phase 0b component-scan 擴維**：原本只掃 skills，擴成同時掃 scripts/hooks/commands，每類 lens 不同 metric

我傾向 **P3 sensor test 優先**（成本低、focused），Phase 0b 等元件孵化資料穩定後再擴。理由：P3 是「動態能力自評」本來就該包含元件接線檢查，Phase 0b 是「靜態元件治理」屬不同軸。兩條路不互斥。

**這個發現本身值得記入 memory**：「PostToolUse-only 偵測對歷史債務無感」是 hook 設計的常見盲點，所有靠 event 觸發的 hook 都有此限制。需要配對「啟動掃描」型 hook 才能涵蓋全 lifecycle。

### 收斂授權執行

Manager 授權實作 P2 ~1.25h。執行步驟記錄如下：

1. ✅ 輪 2 spec 段 + Q_A 短答（本段）
2. → 擴展 `hooks/modules/reflection-resolver-check.js`：加 `import resolveAll` + `detectInvalidActions` + 合併 systemMessage
3. → unit test 加 case：自動 resolve + 第二類警告
4. → meta-dogfood：跑一次 reflection-resolver.js CLI 看實際 jsonl 自動 resolve
5. → commit
6. → complete

verdict 將改為 continue。

