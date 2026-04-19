# Rules 索引化 Phase 1 — 掃描報告

**日期**：2026-04-16  
**任務**：xd-1776339036379-k59i  
**目標**：29 個 rules 的「可移出段落 + 目標 SKILL」清單，供 Manager 確認後執行 Phase 2

---

## 統計摘要

| 指標 | 數值 |
|------|------|
| 當前 rules 總行數 | 1154 行（29 個檔案，平均 39.8 行） |
| 可移出估計（fat） | ~812 行（70%） |
| 薄化後估計 | ~342 行（平均 11.8 行/檔） |
| 需建新 SKILL 或 reference 檔 | 15 個 reference 檔（絕大多數 SKILL 已存在） |

---

## 逐檔分析

### 元件/ (5 個檔案)

**1. AskUserQuestion全鏈路.md**（42 行 → 估計 9 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 鏈路說明（ASCII 流程圖 code block）| 13 | 移出 |
| 防護規則（4 條 MUST/NEVER + 指向）| 9 | **保留** |
| 踩坑記錄 table（4 事件 × 教訓）| 10 | 移出 |
| frontmatter | 5 | 保留 |

目標：`skills/claude-dev/references/ask-user-question-chain.md`（新建）

---

**2. hook-discipline.md**（31 行 → 估計 15 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 擴展紀律 MUST/NEVER/SHOULD（6 條）| 9 | **保留** |
| Output Size MUST/NEVER/SHOULD/COULD（6 條）| 8 | **保留** |
| 派生來源（xd-xxx 參考）| 4 | 移出 |

目標：`skills/claude-dev/references/hook-discipline-history.md`（新建，只含派生來源）  
**注意**：此檔已很精簡（大多是 MUST/NEVER），預計只降至 15 行左右。

---

**3. library-caller-boundary.md**（33 行 → 估計 10 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 動機段落（xd-e71m 事件背景）| 7 | 移出 |
| 規則 MUST/NEVER/SHOULD/COULD（6 條）| 9 | **保留** |
| 反例 vs 正例 table（4 行）| 6 | 移出 |
| 派生來源 | 3 | 移出 |
| 與既有 rule 關係 | 3 | 移出 |

目標：`skills/claude-dev/references/library-caller-boundary-detail.md`（新建）

---

**4. 元件治理.md**（48 行 → 估計 18 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 分類決策 MUST（3 條 + 詳見 pointer）| 5 | **保留** |
| 行數治理 MUST/NEVER（5 條）| 7 | **保留** |
| 知識分類 MUST（1 條 + table 4 行）| 6 | **保留**（table 是規則的一部分） |
| DRY 與歸屬 MUST/NEVER（3 條）| 5 | **保留** |
| Layer-based 模型限制 MUST/NEVER（2 條）| 5 | **保留** |
| Memory 規範 MUST/NEVER（3 條 + 詳見）| 5 | **保留** |

**注意**：此檔幾乎全是 MUST/NEVER，fat 很少。只能在措辭上微壓縮。目標 18 行（不達 15）。

---

**5. 模組架構.md**（49 行 → 估計 13 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| SSE-first MUST/NEVER（3 條）+ SSE 指向 | 7 | **保留**（指向已存在） |
| 模組職責分離 MUST/NEVER（2 條）| 4 | **保留** |
| 模組方向表（8 行完整 table）| 10 | **部分移出**：table 縮為「詳見 skills/claude-dev/references/module-architecture.md」（此檔已存在且有 table） |
| 新 hook module 接線守護 MUST/NEVER（3 條 + 測試鎖定）| 9 | **保留（核心規則）** |
| 反例正例指向 | 2 | 移出（已有指向） |

目標：縮減 module 方向 table → 改為 1 行指向 `skills/claude-dev/references/module-architecture.md`

---

### 協作/ (7 個檔案)

**6. canonical-引用驗證.md**（27 行 → 估計 9 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 動機（xd-ew0k 事件）| 8 | 移出 |
| 規則 MUST/NEVER（4 條）| 6 | **保留** |
| 反例 vs 正例 table（4 行）| 6 | 移出 |
| 派生來源 | 3 | 移出 |

目標：`skills/cross-session/references/canonical-verification-detail.md`（新建）

---

**7. owner-commit-discipline.md**（47 行 → 估計 12 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 動機（搶先 commit 事件）| 9 | 移出 |
| 規則 MUST（3 條）+ passive accept 時限 table | 8 | **保留** |
| MUST Draft branch、NEVER 搶先（3 條）| 5 | **保留** |
| 反例 vs 正例 table | 7 | 移出 |
| 例外 SHOULD（3 條）| 5 | **保留（邊界條件重要）** |
| 派生來源 + 與既有 rule 關係 | 8 | 移出 |

目標：`skills/dispatch-lifecycle/references/owner-commit-detail.md`（新建）

---

**8. peer-discussion-visibility.md**（37 行 → 估計 10 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 動機（hub-and-spoke 反模式事件）| 7 | 移出 |
| 規則 MUST/NEVER/SHOULD（5 條）| 8 | **保留** |
| 反例 vs 正例 table | 8 | 移出 |
| 例外 SHOULD（2 條）| 4 | **保留** |
| 派生來源 + 與既有 rule 關係 | 5 | 移出 |

目標：`skills/cross-session/references/peer-discussion-detail.md`（新建）

---

**9. 完成即討論.md**（28 行 → 估計 12 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 設計說明（3 行）| 4 | 移出 |
| 規則 MUST/NEVER/COULD（6 條）| 9 | **保留** |
| 與既有元件對稱說明 | 5 | 移出 |
| 詳細 schema 指向 | 2 | **保留** |

目標：`skills/dispatch-lifecycle/references/complete-as-discussion-detail.md`（新建）

---

**10. 跨專案協作.md**（46 行 → 估計 18 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| Scope 邊界 MUST/NEVER（2 條）| 4 | **保留** |
| 派發品質 MUST/NEVER（3 條）| 5 | **保留** |
| 討論 vs 命令 MUST/NEVER（3 條）| 6 | **保留** |
| 接收與完成 MUST（6 條）| 8 | **保留** |
| 全域元件修改流程 MUST/NEVER（5 條 + 例外）| 9 | **保留** |
| 流程指向 | 2 | **保留（已是 pointer）** |

**注意**：此檔幾乎全是核心行為規則，無明顯 fat。預計 18 行（不達 15）。  
可微壓縮：把多個 MUST 條款合併（e.g., 接收與完成的 6 條中 2 條可合）。

---

**11. 討論式派發.md**（30 行 → 估計 14 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 角色定位 MUST/NEVER/COULD（4 條）| 7 | **保留** |
| 討論式 dispatch 準則 MUST/NEVER/COULD（5 條）| 8 | **保留** |
| 核心目標 non_negotiable MUST/NEVER（3 條）| 6 | **保留** |
| 詳見 skills/cross-session pointer | 2 | **保留** |

**注意**：此檔也主要是規則，很少 fat。預計 14 行。

---

**12. 討論式派発持久化.md**（45 行 → 估計 13 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 動機（xd-1xos 失聯事件）| 8 | 移出 |
| 規則 MUST/NEVER（3 條）| 5 | **保留** |
| 實作 vs 討論 dispatch 區別 table | 6 | **保留（關鍵判斷依據）** |
| 程式化守護 MUST（2 條）| 4 | 移出（技術細節移 SKILL） |
| 討論式 dispatch Round 推進 MUST/NEVER（2 條）| 6 | **保留（高頻踩坑，核心規則）** |
| 反例 vs 正例 table | 5 | 移出 |
| 派生來源 | 3 | 移出 |

目標：`skills/dispatch-lifecycle/references/dispatch-persistence-detail.md`（新建）

---

### 品質/ (5 個檔案)

**13. benchmark-winner-selection.md**（46 行 → 估計 11 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 動機（xd-jyeu / xd-31cb 事件）| 5 | 移出 |
| Pareto 四步 MUST（6 行含步驟）| 7 | **保留** |
| winner 回報格式 MUST（1 條）| 2 | **保留** |
| NEVER 三條反模式 | 5 | **保留** |
| 程式化守護 SHOULD（2 條）| 4 | 移出（技術細節） |
| 反例 vs 正例 table | 6 | 移出 |
| 測試鎖定 MUST | 4 | 移出（細節移 SKILL） |
| 與既有 rule 關係 | 6 | 移出 |
| 派生來源 | 1 | 移出 |

目標：`skills/pipeline-quality-gate/references/benchmark-pareto-detail.md`（新建）

---

**14. 元件孵化.md**（42 行 → 估計 13 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 原則段落（3 行背景）| 4 | 移出 |
| usage_type 四型 Gate table | 7 | **保留（判斷依據）** |
| 規則 MUST/NEVER（6 條）| 8 | **保留** |
| 觀察監控 MUST/SHOULD（2 條 + SHOULD）| 6 | **保留（1 MUST 核心，1 SHOULD 可移）** |
| Phase 進展 MUST（3 條）| 5 | 移出（細節移 SKILL） |
| 詳細 schema 指向 | 2 | **保留** |

目標：`skills/component-classification/references/incubation-detail.md`（新建）

---

**15. 回饋與進化.md**（41 行 → 估計 13 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 成功即進化 MUST（3 條）| 5 | **保留** |
| 自驅任務迴圈 MUST（3 條）| 5 | **保留** |
| 完成後三問 MUST/NEVER（3 條）| 6 | **保留** |
| 反例 vs 正例 table（3 行）| 7 | 移出 |
| 詳見 skills/feedback-loop pointer | 2 | **保留** |
| 防護升級階梯 pointer | 2 | **保留** |

目標：`skills/feedback-loop/references/feedback-and-evolution-detail.md`（append 到現有 protocols.md 或新建）

---

**16. 完成與閉環.md**（48 行 → 估計 16 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 三層完成模型 table | 6 | **保留（核心判準）** |
| 驗收品質標準 MUST/NEVER（3 條）| 5 | **保留** |
| 閉環規範 MUST/NEVER（9 條）| 12 | **保留（全部核心）** |
| 產品思維鏈 MUST/NEVER（2 條）| 4 | **保留** |

**注意**：此檔幾乎全是核心規則，預計 16 行（稍超 15）。可微壓縮：合併幾條相關的 MUST。

---

**17. 測試規範.md**（43 行 → 估計 13 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| MUST 觸發條件 + 何時觸發 table（4 行）| 8 | **保留** |
| MUST test fail / SHOULD flaky / NEVER skip / MUST 名稱（4 條）| 6 | **保留** |
| 測試位置 table（3 行）| 5 | **保留（常用判斷依據）** |
| 反例 vs 正例 table（4 行）| 7 | 移出 |
| pointer 到 nova-test | 2 | **保留** |

目標：`skills/nova-test/references/test-spec-examples.md`（新建，含反例正例）

---

### 核心/ (6 個檔案)

**18. agent-harness.md**（36 行 → 估計 12 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 原則段落（3 行背景）| 4 | 移出 |
| 三支柱定義 table（5 行）| 6 | **保留** |
| 規則 MUST/NEVER（4 條）| 6 | **保留** |
| 元件→支柱對照（7 行 list）| 8 | 移出（縮為 1 行 pointer） |
| 與元件孵化的關係 | 3 | 移出 |
| 詳細討論史指向 | 2 | **保留** |

目標：`skills/architecture/references/harness-component-map.md`（新建）

---

**19. 並行執行.md**（29 行 → 估計 14 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 核心 MUST/NEVER（3 條）| 5 | **保留** |
| 依賴偵測 MUST（1 條）| 3 | **保留** |
| 前景並行 MUST/NEVER（2 條）| 4 | **保留** |
| Agent 調度 MUST/NEVER（2 條）| 4 | **保留** |
| 依賴偵測 checklist pointer | 2 | **保留** |

**注意**：此檔已很精簡，主要是規則。預計 14 行。

---

**20. 任務管理.md**（48 行 → 估計 18 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| Plan-First MUST/NEVER（2 條）| 4 | **保留** |
| 持久化 MUST/NEVER（2 條）| 4 | **保留** |
| 收尾清理 MUST/NEVER（2 條）| 4 | **保留** |
| TaskCreate 三個入口（6 行 list）| 7 | 移出 → 縮為「依時機建 task，三入口詳見 skills」 |
| TaskComplete 三個入口（5 行 list）| 6 | 移出 → 同上 |
| 時機對照表（完整 table 8 行）| 9 | 移出 → 縮為「詳見 skills/feedback-loop/SKILL.md 時機表」 |
| 不需要 task 的場景（5 行）| 5 | 移出 |

目標：`skills/feedback-loop/references/task-management-timing.md`（新建）  
**注意**：三個入口 + 時機表是重要操作指引，雖可移出，但 Phase 2 執行時需確認 skills/feedback-loop/SKILL.md 已有對應內容。

---

**21. 失敗與修復.md**（49 行 → 估計 17 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 3 次失敗 STOP MUST/NEVER（2 條）| 4 | **保留** |
| 完成證據 MUST（1 條）| 2 | **保留** |
| 根因修復 MUST/NEVER（3 條）| 6 | **保留** |
| 防護原則 MUST/NEVER（3 條）| 5 | **保留** |
| 重複犯錯升級 MUST + table（次數表）| 7 | **保留（table 是規則，非知識）** |
| 使用者回饋防護 MUST/NEVER（2 條）| 4 | **保留** |
| 改動隔離 MUST/NEVER（2 條）| 4 | **保留** |
| 防護類型表 pointer + 反例正例 pointer | 3 | **保留（已是 pointer）** |

**注意**：此檔密度極高，幾乎全是核心 MUST/NEVER。預計 17 行。可微壓縮（合併 root cause MUST 3 條）。

---

**22. 深度路由.md**（47 行 → 估計 16 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| HARD GATE MUST/NEVER（3 條）| 5 | **保留** |
| 委派原則 MUST/NEVER（5 條）| 7 | **保留** |
| Model 三層 table（4 行）| 5 | **保留（操作依據）** |
| G-tier 維度 MUST/NEVER（3 條）| 5 | **保留** |
| 自主 vs 升級 MUST（2 條）| 4 | **保留** |
| 詳見 skills pointer | 2 | **保留** |

**注意**：此檔也是高密度規則，預計 16 行（稍超 15）。

---

**23. 自驅反思.md**（33 行 → 估計 13 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| MUST 反思四步（含 4 步驟列表）| 6 | **保留** |
| NEVER/NEVER（2 條）| 3 | **保留** |
| 反思 persist schema MUST（3 條）| 6 | **保留（schema 的 key 規則）** |
| 每次反思含外部研究 MUST（1 條）| 2 | **保留** |
| 三維度（3 行 list）| 4 | 移出（縮為 pointer） |
| 詳細協議 pointer | 2 | **保留** |

目標：`skills/feedback-loop/references/reflection-dimensions.md`（新建，或 append 到 protocols.md）

---

### 環境/ (6 個檔案)

**24. ralph-loop.md**（25 行 → 估計 10 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| state.prompt 定位 MUST/NEVER（2 條 + 說明）| 7 | **保留（條款）+ 移出（括號內說明）** |
| cross-dispatch 關係 MUST/NEVER（2 條）| 5 | **保留** |
| DONE 條件 MUST/NEVER（2 條）| 5 | **保留** |
| 詳見 skills pointer | 2 | **保留** |

目標：精簡括號內說明 → 細節移 skills/feedback-loop/SKILL.md（已有 ralph-loop 說明）

---

**25. 寫作規範.md**（32 行 → 估計 13 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 語言規則（1 條）| 3 | **保留** |
| 強調標記 table（5 行）| 7 | **保留（操作必備）** |
| 核心規則 MUST/NEVER（5 條）| 8 | **保留** |
| 術語規範 pointer | 2 | **保留** |

**注意**：此檔已比較精簡，預計 13 行。

---

**26. 工具選擇.md**（38 行 → 估計 13 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 瀏覽器 MUST/NEVER（3 條 + pointer）| 5 | **保留** |
| 本地模型 table（4 行分層）| 5 | **保留** |
| MUST timeout / NEVER 串行 await（2 條）| 4 | **保留** |
| Session 觀察 MUST（3 條）| 5 | **保留** |
| 詳見 pinchtab + local-model-dispatch pointer | 2 | **保留** |
| NEVER 背景 polling 說明（3 行）| 3 | 移出（已是 NEVER 條款，說明移 SKILL） |

目標：能力比較說明 → 已在 skills/pinchtab/references/ 和 skills/local-model-dispatch/SKILL.md

---

**27. 本地模型管理.md**（43 行 → 估計 14 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 目錄結構 table（7 行分類表）| 8 | **保留（操作必備）** |
| 規則 MUST/NEVER/SHOULD（6 條）| 8 | **保留** |
| Hook 守護細節（4 條 MUST/NEVER + 豁免說明）| 8 | 移出 → 縮為「Hook 守護：見 model-storage-guard.js + MUST 兩核心條款」 |
| 跨專案狀態說明（7 行）| 7 | 移出（背景知識） |
| 派生來源 | 4 | 移出 |

目標：`skills/local-model-dispatch/references/model-storage-detail.md`（新建）

---

**28. 總結格式.md**（46 行 → 估計 18 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| MUST 直接輸出（2 條）| 3 | **保留** |
| 格式 code block（template）| 12 | **保留（格式本身是規則）** |
| 格式 MUST/NEVER（4 條）| 6 | **保留** |
| 收尾流程 MUST（4 條）| 6 | **保留** |
| pointer 到 skills/feedback-loop | 2 | **保留** |

**注意**：格式 template 本身就是規則，無法移出。預計 18 行（不達 15）。

---

**29. 自壓縮.md**（45 行 → 估計 14 行）

| 段落 | 行數 | 動作 |
|------|------|------|
| 觸發 MUST/NEVER（2 條）| 4 | **保留** |
| 冷卻 MUST/NEVER（2 條）| 4 | **保留** |
| Session 替換 MUST（1 條）| 3 | **保留** |
| Handoff MUST（2 條）| 4 | **保留** |
| 背景觸發 MUST（2 條）| 4 | **保留** |
| 壓縮後 MUST（1 條）| 2 | **保留** |
| /handoff vs /handoff new 語意差（11 行 + SHOULD）| 13 | 移出（背景脈絡） |
| pointer 到 skills/feedback-loop | 2 | **保留** |

目標：`skills/feedback-loop/references/compact-handoff-detail.md`（新建，含 /handoff new 語意和 xd-izqa 背景）

---

## 需建立的新 Reference 檔（15 個）

| 新 reference 檔 | 來源 rule | 移入內容 |
|----------------|----------|---------|
| `skills/claude-dev/references/ask-user-question-chain.md` | AskUserQuestion全鏈路.md | 鏈路圖 + 踩坑記錄 |
| `skills/claude-dev/references/hook-discipline-history.md` | hook-discipline.md | 派生來源 |
| `skills/claude-dev/references/library-caller-boundary-detail.md` | library-caller-boundary.md | 動機 + 反例正例 + 派生 |
| `skills/cross-session/references/canonical-verification-detail.md` | canonical-引用驗證.md | 動機 + 反例正例 + 派生 |
| `skills/dispatch-lifecycle/references/owner-commit-detail.md` | owner-commit-discipline.md | 動機 + 反例正例 + 派生 |
| `skills/cross-session/references/peer-discussion-detail.md` | peer-discussion-visibility.md | 動機 + 反例正例 + 派生 |
| `skills/dispatch-lifecycle/references/complete-as-discussion-detail.md` | 完成即討論.md | 設計說明 + 對稱說明 |
| `skills/dispatch-lifecycle/references/dispatch-persistence-detail.md` | 討論式派発持久化.md | 動機 + 程式化守護 + 反例正例 + 派生 |
| `skills/pipeline-quality-gate/references/benchmark-pareto-detail.md` | benchmark-winner-selection.md | 動機 + 程式化守護 + 反例正例 + 測試鎖定 + 關係說明 |
| `skills/component-classification/references/incubation-detail.md` | 元件孵化.md | 原則說明 + Phase 進展細節 |
| `skills/feedback-loop/references/task-management-timing.md` | 任務管理.md | 三個入口 + 時機對照表 + 不需要 task 的場景 |
| `skills/architecture/references/harness-component-map.md` | agent-harness.md | 元件→支柱對照 + 與元件孵化關係 |
| `skills/nova-test/references/test-spec-examples.md` | 測試規範.md | 反例正例 table |
| `skills/local-model-dispatch/references/model-storage-detail.md` | 本地模型管理.md | Hook 守護細節 + 跨專案狀態 + 派生 |
| `skills/feedback-loop/references/compact-handoff-detail.md` | 自壓縮.md | /handoff vs /handoff new 語意差 + xd-izqa 背景 |

---

## 例外清單（薄化後仍 >15 行）

| 檔案 | 估計行數 | 原因 |
|------|---------|------|
| 元件治理.md | ~18 | 所有段落都是 MUST/NEVER，無 fat |
| 跨專案協作.md | ~18 | 多個 MUST 段，每個都核心 |
| 失敗與修復.md | ~17 | 高密度規則，次數表是規則一部分 |
| 深度路由.md | ~16 | 高密度路由規則 |
| 完成與閉環.md | ~16 | 三層模型 table 是規則核心 |
| 總結格式.md | ~18 | 格式 template 無法移出 |

**建議**：這 6 個檔案接受 15-18 行的例外，不強行壓縮到可能遺漏規則。

---

## Phase 2 執行建議

Phase 1 確認後，Phase 2 建議分批執行：

1. **Batch A**（fat 最多、最容易）：benchmark-winner, library-caller-boundary, canonical-引用驗證, peer-discussion-visibility, AskUserQuestion全鏈路（5 個）
2. **Batch B**（中等 fat）：owner-commit-discipline, 討論式派発持久化, 元件孵化, 自壓縮, 本地模型管理（5 個）
3. **Batch C**（少量 fat）：其餘 19 個

每 batch 後跑一次 `bun tests/unit/architecture.test.js` 確認通過再進下一批。

---

*nb 掃描完成於 2026-04-16，等 Manager 確認後執行 Phase 2*
