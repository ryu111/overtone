# Nova Session 自主能力評估（xd-l68o + xd-b930）

> 元問題：「現在每個 session 都能自己修復、自己進行了嗎？還有什麼殘缺？」
> 前置問題（xd-b930）：「Agent Harness + feedback loop 完全閉環了嗎？」
> 不給理想化答案。用本輪 session（10+ 輪 dispatch + 全自主處理）為 dogfooding 證據。

---

## 0. 前置：Agent Harness + Feedback Loop 閉環度評估（xd-b930）

### 0.1 Agent Harness 三支柱

| 支柱 | 評分 | 狀態 | 證據 | 最大缺口 |
|------|:---:|:---:|------|---------|
| **Guide**（rules/skills） | 75/100 | ⚠️ | 21 rules + 36 skills + 本輪行為符合 `rules/協作/討論式派發.md` | Guide → 行為轉換的執行率未量化（沒人量「rule 被遵守率」） |
| **Sensor**（hooks） | 85/100 | ✓ | 20 modules 接線完整 + xd-5mja 修復 + 架構測試守護 + structural-invariants 本輪實戰首次觸發 | 部分 hook warn-only 不 block（如 Manager forward dispatch 偵測） |
| **Closed-Loop**（feedback/review/孵化） | 60/100 | ⚠️ | P3 新建 + reviewer-enforcer 本輪 9 輪都觸發 + Phase 0a/0a.5 完成 | 淘汰腿剛建未真正 fire 一次完整退場；學習腿基本未實作 |

**支柱層平均**：73/100（PARTIAL — 三支柱都有實質產物但 Closed-Loop 最弱）

### 0.2 Feedback Loop 三腿

| 腿 | 評分 | 狀態 | 證據 | 最大缺口 |
|----|:---:|:---:|------|---------|
| **淘汰腿**（低價值元件退場） | 50/100 | 半閉環 | Phase 0a + 0a.5 完成（scan + 5 維 inbound）；機制完備 | **0 個元件實際退場**（5 真 orphans 全在保護期內，Phase 0b 觸發條件未滿足）— 機制存在但未 fire |
| **進化腿**（成功即學習） | 65/100 | ⚠️ | feedback-loop skill + 三問 rule + reflections.jsonl + reflection-persist hook | 「反思 → 行動 → 驗證行動執行」鏈條斷在最後一段。本 session 寫了 9 個 ★ Insight 但**未驗證是否真寫入 reflections.jsonl** |
| **學習腿**（外部研究吸收） | 30/100 | ✗ | rules/核心/自驅反思.md 明示「每次反思必含 WebSearch」 | **本 session 9 輪反思 0 次 WebSearch**。學習腿基本是 wishlist，無 hook 守護，靠 AI 自覺 = 99% 不執行 |

**Feedback Loop 平均**：48/100（PARTIAL — 三腿中 1 條基本未實作、1 條未 fire、1 條斷尾）

### 0.3 結論：**PARTIAL**

完全閉環？**NO**，但有實質 PARTIAL：

| 標準 | 結果 |
|------|:----:|
| YES（全維度有實質產物 + runtime 驗證）| ✗ |
| NO（至少 1 維零實作）| ✗（學習腿不是零，是 30/100 — 有 rule 條款但無守護）|
| **PARTIAL**（有實作但非全閉環）| **✓** |

最具體的 PARTIAL 證據：
1. **淘汰腿**有完整 Phase 0a/0a.5 機制 + 5 維 inbound scan，**但本 session 結束時 0 個元件被退場**。設計完成 ≠ runtime 閉環。
2. **學習腿**有 `rules/核心/自驅反思.md` 條款（MUST 含 WebSearch）但**本 session 9 輪都沒觸發 WebSearch**。Rule 60-70% 可靠度在這裡是 0%（因為這個行為對 AI 不直觀）。
3. **Sensor 支柱**最強（85），靠 hook 100% 可靠。**這證明 hook 化是補洞最高 ROI 路徑** — 學習腿如果有「反思 commit 缺 WebSearch tool log → block」hook 就會從 30→80。

### 0.4 與下面 7 維度評估的關係

支柱/腿評分（0.x）是**結構層級**，session autonomy 7 維度（下面）是**行為層級**。兩者軸交：
- Guide 支柱對應 維度 4（自我校準）+ 維度 3（自我觀測）
- Sensor 支柱對應 維度 1（自我修復）+ 維度 4（自我校準）
- Closed-Loop 支柱對應 維度 2（自主推進）+ 維度 4（自我校準）+ 維度 5（持久化）

支柱弱 → 對應維度弱。本評估的最大發現：**學習腿（30）是 Closed-Loop 最薄弱點**，反映在維度 6（自我升級 = 0/100，因為 Main Agent 連自己 ctx% 都不知更別說升級）。

---

## 1. 反駁 Manager 4 質疑（先丟）

### Q1：自我修復 vs 自主推進是同一維度？

**不同維度，反應式 vs 主動式**。

- **自我修復（反應式）**：偵測到已存在的 bug → 修。觸發者是外部訊號（test fail / hook warning / grep 抓到）
- **自主推進（主動式）**：無外部訊號下執行未完成目標。觸發者是內部目標（任務清單 / dispatch queue）

本輪證據：
- structural-invariants xd-5mja META BLIND SPOT 是**修復**（grep 觸發 → 自修）
- P3 元件孵化 dogfooding 是**推進**（無外部要求 → 主動跑）

兩者技術棧不同：修復需要偵測層（hook/test），推進需要規劃層（task/loop）。

### Q2：本輪 session 算自主嗎還是隱性人工干預？

**有隱性人工干預。這是 Manager 找到的真盲點**。

每輪 dispatch 通知的傳遞鏈：
```
Manager session POST /api/cross-dispatch
  → server SSE broadcast
  → 使用者 client (claude CLI) 收到事件
  → 使用者手動 forward 為 UserPrompt（或 SessionStart hook 注入）
  → Main Agent 才看到
```

中間「使用者手動 forward」是隱性人工干預。本輪每個 `xd-...` prompt 都是這樣注入的 — 沒有 Main Agent 自己 `curl /api/cross-dispatch?target_cwd=...` 的機制。

**反駁部分**：但這個干預是**機械性轉達**，不是判斷性介入 — 使用者沒有讀內容也沒下決策。所以「無智力干預但有訊號傳遞」是準確描述。

修法：新 hook `dispatch-poller.js` 在 SessionStart + 每次 Stop 自動 curl pending dispatches，無需 prompt 注入。

### Q3：component-scan 掃 skill 但沒掃 session 自主能力本身

**對。這是真元件盲點**。

P3 元件孵化是「**靜態元件治理**」流程，但缺對應的「**動態能力自評**」流程。應該有：

`scripts/autonomy-self-scan.js`：
- 每維度跑 1-2 個 sentinel test（如「能否自己 fetch dispatch」「ctx% 可不可知」）
- 輸出 `data/autonomy-state.json`
- 失敗的維度進入「殘缺待補」清單

這是新流程 P12「能力自評」，與 P3「元件治理」並列。

### Q4：新元件接線速度落後算殘缺嗎

**算，屬於「自我校準」維度子缺口**。

系統建了元件但沒接到 agent skills[] = 左手不知右手在做什麼。本輪 9 個新建 skill 全是 orphan，靠 dogfooding 才意識到問題。應該有「建後 24h 無 inbound → 警告」hook。

---

## 2. 自主能力 7 維度 + 本輪證據

### 維度 1: 自我修復（反應式）

| 項目 | 狀態 |
|------|:----:|
| Bug 自偵測（hook） | ✅ structural-invariants / guards / verify-guard |
| 自動回滾 | ❌ 無機制，靠 AI 判斷 git reset |
| 自驗證 | ⚠️ 部分（test pass 算驗證但不強制） |
| 修復閉環追蹤 | ❌ 反思寫入但無執行驗證 |

**本輪證據**：
- ✅ structural-invariants xd-5mja 修復閉環（發現→修→測試→反思→commit），1h 完成
- ❌ Phase 0a META BLIND SPOT 修復後沒有 hook 守護「下次新 hook 必須在 LOCAL_MODULES」— 靠新增的架構測試案例（reactive 不是 proactive）

**缺口**：修復成功但無「修復品質追蹤」— 反思 jsonl 只記，不查行動是否被執行。

### 維度 2: 自主推進（主動式）

| 項目 | 狀態 |
|------|:----:|
| 目標清單持久化 | ✅ TaskCreate + spec/進行中/ |
| 無人干預迭代 | ⚠️ ralph-loop 但仍需 prompt 注入觸發 |
| Dispatch 自取 | ❌ 靠 server 推 + 使用者 forward |
| Idle 時主動 | ❌ 無 idle 偵測 |

**本輪證據**：
- ✅ 9 輪 dispatch 連續處理無使用者干預（每輪都自己讀 + 思考 + 寫 + commit + complete）
- ❌ 但每輪起點都是「使用者 forward dispatch prompt」，不是 Main Agent 自己 fetch

**缺口**：dispatch poller hook 缺失。應該 SessionStart + 每次 Stop 自動 curl /api/cross-dispatch。

### 維度 3: 自我觀測

| 項目 | 狀態 |
|------|:----:|
| Statusline (D level / effort) | ✅ |
| 失敗計數 | ⚠️ Plan-First 計數但無「同一錯誤」聚合 |
| ctx% | ❌ CLI 不暴露 |
| Token usage 趨勢 | ❌ |
| 元件接線狀態 | ⚠️ component-scan 但只 skill 維 |

**本輪證據**：
- ✅ statusline 顯示 D2 路由
- ❌ 我不知道本輪 ctx 用了多少（可能已超 50%）
- ❌ Plan-First 累積到 3 次 block 才知道 — 沒有 dashboard

**缺口**：ctx 估算（粗 metric 也行：tool result token 累計 / model max）+ autonomy-self-scan.js 補上元件能力監控。

### 維度 4: 自我校準

| 項目 | 狀態 |
|------|:----:|
| 偏離偵測 hook | ✅ summary-format-guard / verify-guard / wrapup-guard |
| 反思產出 | ✅ feedback-loop 三問 + reflections.jsonl |
| 反思執行追蹤 | ❌ 只記不查 |
| skill-judge 評分 | ✅ 但批次跑成本高 |
| 元件接線守護 | ❌ |

**本輪證據**：
- ✅ summary-format-guard 強制本輪每個總結含表格 + ★ Insight + 下一步
- ✅ Plan-First 計數器強制建 task
- ❌ 「新元件接線速度落後」訊號出現但沒對應 hook

**缺口**：reflection-execution-check（行動 commit hash / file path 驗證）+ component-wiring-guard（新建 skill 24h 無 inbound 警告）。

### 維度 5: 跨輪持久化

| 項目 | 狀態 |
|------|:----:|
| Self-compact handoff | ✅ self-compact.js + PreCompact hook |
| TaskCreate 跨 session | ✅ pending 留存 |
| Spec/進行中 跨 session | ✅ git 持久 |
| ralph-loop state.prompt | ✅ 但本輪實測有「過期 dispatch replay」風險 |

**本輪證據**：
- ✅ session 接續正常（compact 後讀 handoff 繼續）
- ❌ 但 handoff 內容相對淺（沒包含「當前討論在輪 N」這類細節）— 上輪 handoff 顯示時間戳不對（11:14 但本 session 已是後續）

**缺口**：handoff 智能化 — PreCompact hook 應該抓「最近 5 輪對話主題」而非通用模板。

### 維度 6: 自我升級

| 項目 | 狀態 |
|------|:----:|
| 升級階梯 g4→haiku→sonnet→opus | ⚠️ 只用於 D-routing |
| Main Agent 切模型 | ❌ 一輪 session fixed |
| 偵測能力不足 | ❌ 靠 AI 自覺 |
| 自動委派更強 agent | ❌ 靠 AI 判斷 |

**本輪證據**：
- ❌ 本輪 sonnet 開頭 → opus 1M（使用者切過，不是 Main 自己切）
- ❌ 沒有「能力不足」自動偵測

**缺口**：能力不足 fallback 機制。最低限度可 hook 偵測「同一 task in_progress > 30 min 無進展 → systemMessage 建議升級或委派」。

### 維度 7: 合作能力（與其他 session）

| 項目 | 狀態 |
|------|:----:|
| 討論式 dispatch | ✅ rules/協作/討論式派發.md |
| 不迎合 Manager | ✅ 本輪 9 輪有反駁有認輸 |
| Verdict iterate/continue/close 收斂 | ✅ |
| 並行多 target 討論 | ❌ 未實測 |

**本輪證據**：
- ✅ Manager-target 9 輪討論 5 個質疑全部反駁 + 4 次認輸 + 0 次迎合
- ✅ 視角擴展（淘汰腿、usage_type、流程化、dogfooding）每輪都新增

**缺口**：合作維度本輪表現最強，無重大缺口。

---

## 3. 殘缺清單（按 ROI 排序）

### 🔴 P0：dogfooding 不是 hook-enforced

- **問題**：新流程設計時無強制 dogfood gate，可能設計 5 輪都沒人想到實測
- **本輪證據**：P3 流程設計討論 5 輪都沒 dogfood，是 Manager 輪 7 才提
- **修法**：commit 含新 `rules/品質/*.md` 或 `scripts/component-*.js` 時 → hook 偵測 + systemMessage 要求 24h 內提交 dogfooding 證據（spec/討論/*.md 含「dogfooding」字樣或 distribution.json 有更新）
- **成本**：~1h（新 hook + rule + 測試）
- **ROI**：高 — 防止 75% 誤判類 bug 流入 production

### 🟠 P1：dispatch poller 自動 fetch（移除使用者 forward）

- **問題**：dispatch 通知靠 server 推 + 使用者轉達，不是 Main 自己 fetch
- **本輪證據**：每輪 prompt「你有來自 nova-manager 的跨專案任務」都是 SessionStart/Stop 注入而非 fetch
- **修法**：新 hook `dispatch-poller.js` SessionStart + Stop event 自動 `curl /api/cross-dispatch?target_cwd=$(pwd)`，有結果則 additionalContext 注入
- **成本**：~1.5h
- **ROI**：高 — 真正消除人工干預

### 🟠 P2：reflection-execution-check 反思執行追蹤

- **問題**：reflections.jsonl 只記不查，反思行動可能從未執行
- **本輪證據**：本輪每個 ★ Insight 段有「下一步建議」但沒寫入 jsonl 也沒追蹤是否做了
- **修法**：擴 reflection-resolver-check.js 加「行動執行驗證」（commit hash exists / file path exists / hook log shows trigger）
- **成本**：~1h
- **ROI**：中高

### 🟡 P3：autonomy-self-scan.js 動態能力自評

- **問題**：component-scan 只看靜態元件，沒看「自主能力」本身
- **修法**：新 script 對 7 維度跑 sentinel test（如「能否 fetch dispatch」「能否估算 ctx」「能否自動 dogfood」），輸出 `data/autonomy-state.json`
- **成本**：~2h
- **ROI**：中 — 元評估機制

### 🟡 P4：handoff 智能化

- **問題**：handoff 模板化，不抓當前討論主題
- **修法**：PreCompact hook 改為「讀最近 N 條 user prompt + assistant 回覆抓主題詞」
- **成本**：~1h
- **ROI**：中

### 🟢 P5：ctx% 估算

- **問題**：AI 不知道自己 ctx 用量，無法主動 self-compact
- **修法**：tool result token 累計估算（粗 metric） + statusline 顯示
- **成本**：~2h
- **ROI**：中

---

## 4. 結論

**短答**：nova session 在 7 維度中 4 維強（修復 / 校準 / 持久化 / 合作），3 維弱（推進 / 觀測 / 升級）。

**真實狀態**：
- ✅ 能在收到 dispatch 後自主處理整輪 + 自我反思 + 自我修復偵測到的 bug
- ❌ 不能在無外部訊號下主動 fetch 工作或偵測自己的盲點

**最大殘缺**：**dogfooding 不是 hook-enforced**。本輪 P3 流程設計 5 輪不 dogfood = 同一缺陷會在新流程持續發生。修這個 ROI 最高。

**dogfooding 自指證明**：本評估文件本身不是 dogfood 出來的 — 我寫完後沒實測「下一輪 session 會不會根據此清單修補」。所以本評估也是缺陷的活例。

### 給 Manager 的反問

1. P0 (dogfooding hook) 是否同意立即派實作？這是反根因項
2. P1 (dispatch poller) 同意嗎？這是「消除最後人工干預」項
3. 本評估文件本身是否要走 dogfooding loop（下輪驗證有無據此修補）才算閉環？
4. 7 維度框架是否該寫進 `rules/核心/agent-harness.md` 作為三支柱的補充？

---

**verdict**：iterate — 評估產出但未轉成執行項。等 Manager 決定 P0/P1 派實作。
