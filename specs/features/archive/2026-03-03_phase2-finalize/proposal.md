# Proposal: phase2-finalize — P4 文件同步 + S19 Agent 專一化精鍊收尾

## 背景

Phase 2「核心穩固」的系統強化四個 Phase（P1-P4）中，P1、P2、P3 已完成，P4 進行中（約 80% 完成），S19 剛開始（約 20% 完成）。

本次 feature 的目標是收尾這兩個未完成項目，讓 Phase 2 正式結案。

---

## 需求分析

### P4 文件同步（~80% 完成 → 100%）

#### P4-1：CLAUDE.md 缺口

**位置**：`/Users/sbu/projects/overtone/CLAUDE.md`

**缺口**：
- `skills/` 一行描述為「19 個 Skill（WHAT — 知識域 + orchestrator + utilities-with-refs）」，但沒有列出 11 個 knowledge domain 的完整名稱
- 「Agent 專職」原則只說「17 個 agent 各司其職」，可能可以補充 model 分級邏輯

**修改範圍**：小幅更新，補充 11 個 knowledge domain 清單（一行，逗號分隔）

#### P4-2：docs/vision.md 缺口

**位置**：`/Users/sbu/projects/overtone/docs/vision.md`

**缺口**：
- Layer 1 現有實現表格的「學習框架」欄位寫「Instinct + Knowledge Engine」，但 Knowledge Engine 的具體實現（11 個 knowledge domain）沒有提及
- 其他數據已與 v0.28.21 對齊，無重大缺口

**修改範圍**：微幅更新 Layer 1 表格，補充 Knowledge Engine 的 domain 數量

#### P4-3：docs/roadmap.md 缺口

**位置**：`/Users/sbu/projects/overtone/docs/roadmap.md`

**缺口（具體）**：
1. P1 完成標準說明「新建 3 domain（debugging、architecture、build-system）+ 強化 5 既有 domain + 17 新 reference 檔案」——實際上，目前有 11 個 domain，說明已過時（當初是 8 個）
2. P2 完成標準說明「評估 agent 拆分機會、職責邊界精鍊、model 降級空間（→ S19）」——只做了 architect/retrospective 降級，S19 的量化分析尚未完成
3. P4 需要在完成後標記為 ✅
4. S19 目前狀態 🔵，完成後更新為 ✅

**修改範圍**：P1/P2 說明細化、P4/S19 狀態更新

#### P4-4：docs/status.md 確認

**位置**：`/Users/sbu/projects/overtone/docs/status.md`

**現況**：當前 status.md 已包含所有 11 個 knowledge domain，核心指標正確，近期變更正確。基本對齊，可能需要小幅確認。

**修改範圍**：確認一致性，必要時微調

---

### S19 Agent 專一化精鍊（~20% 完成 → 100%）

#### S19-1：建立 Agent 評估框架文件

**位置**：`/Users/sbu/projects/overtone/docs/analysis/agent-specialization.md`（新建）

**內容**：
- 17 agents × 6 維度量化評分表
  - 職責專一度（1-5）
  - 推理複雜度（1-5）
  - Skill 依賴度（1-5，Skill 提供的知識覆蓋率）
  - 決策確定性（1-5，輸入→輸出的確定程度）
  - 建議 Model
  - 當前 Model
- 5 個 Opus/Opusplan agents 的深度分析（product-manager, planner, code-reviewer, security-reviewer + 已完成的 architect, retrospective）
- Skill 完善度 vs Model 需求映射表
- 結論：哪些可降級、哪些維持、理由

**評估框架說明**：
- 「知識在 Skill 裡越充分，Model 降級越安全」
- 降級條件：職責專一度 ≥4 AND Skill 依賴度 ≥4 AND 決策確定性 ≥4

#### S19-2：更新 roadmap.md 的 S19 狀態

作為 S19 分析完成後的標記更新（依賴 S19-1）

---

## 子任務清單

### P4 子任務（全部可並行）

| # | 子任務 | 類型 | 影響文件 |
|---|--------|------|----------|
| P4-1 | CLAUDE.md 補充 11 個 knowledge domain 清單 | 文件更新 | `/Users/sbu/projects/overtone/CLAUDE.md` |
| P4-2 | vision.md Layer 1 表格補充 Knowledge Engine domain 數量 | 文件更新 | `/Users/sbu/projects/overtone/docs/vision.md` |
| P4-3 | roadmap.md P1 說明細化 + P2 說明明確化 | 文件更新 | `/Users/sbu/projects/overtone/docs/roadmap.md` |
| P4-4 | status.md 一致性確認（如有缺口則更新） | 文件確認 | `/Users/sbu/projects/overtone/docs/status.md` |

### S19 子任務（序列）

| # | 子任務 | 類型 | 影響文件 |
|---|--------|------|----------|
| S19-1 | 建立 docs/analysis/agent-specialization.md（17 agents × 6 維度分析） | 新建文件 | `/Users/sbu/projects/overtone/docs/analysis/agent-specialization.md` |
| S19-2 | roadmap.md S19 狀態更新為 ✅ + P4 狀態更新為 ✅ | 文件更新 | `/Users/sbu/projects/overtone/docs/roadmap.md` |

---

## 優先順序與依賴關係

```
P4-1 ─┐
P4-2 ─┤─ 可並行（互無依賴）
P4-3 ─┤
P4-4 ─┘

S19-1 → S19-2（S19-2 依賴 S19-1 的分析結論）

P4 和 S19-1 可並行啟動
S19-2 必須等 S19-1 完成 + P4-3 確認 roadmap 格式
```

---

## 範圍邊界

**在此次範圍內**：
- 文件內容對齊（CLAUDE.md + vision.md + roadmap.md + status.md）
- Agent 量化分析文件（新建）
- roadmap 狀態標記更新

**不在此次範圍內**：
- 實際修改任何 agent 的 model 配置（S19 是分析，不是執行）
- 修改 plugin.json 版本（純文件變更，無程式碼）
- 建立新的 skill 或 agent

---

## 風險評估

| 風險 | 機率 | 影響 | 對策 |
|------|------|------|------|
| S19-1 的量化評分主觀性過高 | 中 | 中 | 使用明確的評分標準（1-5 定義清楚） |
| roadmap.md P1/P2 說明改寫破壞格式 | 低 | 低 | developer 照現有表格格式修改 |
| docs/analysis/ 目錄不存在 | 已確認 | 低 | developer 自行建立目錄 |

---

## 技術約束

- 文件位置：`docs/`（不在 `plugins/overtone/` 下）
- 分析文件：`docs/analysis/agent-specialization.md`（新建，需建立 `docs/analysis/` 目錄）
- 所有文件使用繁體中文
- 純文件變更，無程式碼修改，不需要 bump-version
- 無向後相容問題
