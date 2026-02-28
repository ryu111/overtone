# Overtone Product Roadmap

> 最後更新：2026-02-28 | 當前 Phase：0（地基穩固）

## 產品定位

> **Overtone — 裝上 Claude Code，就像有了一個開發團隊。**

## Phase 總覽

| Phase | 名稱 | 目標 | 狀態 |
|:-----:|------|------|:----:|
| 0 | 地基穩固 | 核心 pipeline 真的能用 | 🔵 進行中 |
| 1 | 首次體驗 | 新使用者 5 分鐘內上手 | ⚪ 待開始 |
| 2 | 外部驗證 | 取得 5-10 個外部使用者回饋 | ⚪ 待開始 |
| 3 | 成長方向 | 根據 Phase 2 回饋決定 | ⚪ 未定義 |

---

## Phase 0: Foundation（地基穩固）

**目標**：確認核心 pipeline 真的能用。507 個 tests 測的是「元件能跑」，不是「pipeline 好用」。

### Entry Criteria

- [x] v0.17.0 完成

### 核心工作

| # | 任務 | 說明 | 狀態 |
|---|------|------|:----:|
| 0-1 | single workflow 跑 10 次 | 真實開發任務，記錄成功率和人工介入次數 | ⚪ 0/10 |
| 0-2 | quick workflow 跑 10 次 | 真實開發任務，記錄成功率和人工介入次數 | 🔵 1/10 |
| 0-3 | standard workflow 跑 10 次 | 真實開發任務，記錄成功率和人工介入次數 | 🔵 2/10 |
| 0-4 | 修復路由/Loop/Hook 問題 | 根據 0-1~0-3 發現的問題逐一修復 | ⚪ |
| 0-5 | auto/SKILL.md 認知負荷控制 | 確保 ≤ 120 行，必要時分層載入 | ⚪ |

### 驗證方式

融入日常開發，每次有真實需求就用 workflow 執行，自然累積完成次數。

### 驗證場景

在 Overtone 專案本身跑 30 次真實開發任務。

### 驗證記錄

| # | 日期 | Workflow | 任務 | 結果 | 人工介入 | 備註 |
|---|------|----------|------|:----:|:--------:|------|
| 1 | 2026-02-28 | standard | dashboard-duplicate-spawn-fix | ✅ 完成 | 0 次 | PM discovery → standard 全流程。599 tests pass，+11 新測試 |
| 2 | 2026-02-28 | standard | instinct-observation-quality | ✅ 完成 | 0 次 | 6 項品質改進（emit 飽和、code fence、agent_performance、workflow_routing、search-tools、confidence-scoring）。626 tests pass，+27 新測試 |
| 3 | 2026-02-28 | quick | specs-auto-archive-fix | ✅ 完成 | 0 次 | readTasksCheckboxes() Dev Phases 排除修復 + 歷史 feature 歸檔清理。629 tests pass，+3 新測試 |

### 成功指標

| 指標 | 目標值 |
|------|--------|
| quick workflow 完成率 | ≥ 80%（10 次中 ≥ 8 次完成） |
| standard workflow 完成率 | ≥ 80% |
| Main Agent 路由準確率 | ≥ 90% |
| 人工介入頻率 | < 1 次/workflow |

### Exit Criteria

- [ ] 30 次測試完成，完成率數據記錄在案
- [ ] quick 和 standard 完成率均 ≥ 80%
- [ ] 發現的關鍵問題已修復

### 風險

- 完成率遠低於 80%（< 50%）：暫停 Roadmap，專注修根因
- 使用者失去動力（「又要跑 30 次」）：融入日常開發，每次改完就用 workflow 驗證

---

## Phase 1: Onboarding（首次體驗）

**目標**：讓一個從未用過 Overtone 的人，在 5 分鐘內裝好並成功跑一次 quick workflow。

### Entry Criteria

- [ ] Phase 0 完成

### 核心工作

| # | 任務 | 說明 | 狀態 |
|---|------|------|:----:|
| 1-1 | README 重寫 | 「3 分鐘上手」三步驟：安裝 → 第一次使用 → 看到結果。只展示 single/quick/standard | ⚪ |
| 1-2 | SessionStart banner 優化 | 清晰告知新使用者可以做什麼 | ⚪ |
| 1-3 | plugin.json description 更新 | 改為「裝上 Claude Code，就像有了一個開發團隊」 | ⚪ |
| 1-4 | 非 Overtone 專案實戰 | 在外部專案上用 standard workflow 完成一個真實功能 | ⚪ |
| 1-5 | 規格文件同步 | 修正 agent 數量（15→16）、workflow 數量（15→18）、test 數量等不一致 | ⚪ |

### 成功指標

| 指標 | 目標值 |
|------|--------|
| 非 Overtone 專案跑通 standard workflow | ≥ 1 次 |
| README 可讀性 | 新使用者 5 分鐘內完成安裝並跑完 quick workflow |

### Exit Criteria

- [ ] README 完成重寫
- [ ] 非 Overtone 專案實戰通過
- [ ] 規格文件不一致全部修正

---

## Phase 2: Validation（外部驗證）

**目標**：取得 5-10 個外部使用者的回饋，驗證「全自動 pipeline」是否真的是使用者想要的。

### Entry Criteria

- [ ] Phase 0 + Phase 1 完成

### 核心工作

| # | 任務 | 說明 | 狀態 |
|---|------|------|:----:|
| 2-1 | 發文推廣 | 在 r/ClaudeAI 或 Twitter/X 發文介紹 | ⚪ |
| 2-2 | 收集回饋 | 記錄安裝成功率、首次使用體驗、功能回饋 | ⚪ |
| 2-3 | 根據回饋決定 Phase 3 方向 | 分析回饋數據，定義下一階段目標 | ⚪ |

### 成功指標

| 指標 | 目標值 |
|------|--------|
| GitHub stars | ≥ 10 |
| 外部使用者完成安裝 | ≥ 3 人 |
| 首次使用者完成率（quick workflow） | ≥ 60% |
| 7 天留存率 | ≥ 30% |

### Exit Criteria

- [ ] 有外部回饋數據
- [ ] Phase 3 方向已決定

---

## Phase 3: Growth（成長方向）

**目標**：根據 Phase 2 回饋決定。本 Phase 的具體內容現在不定義。

| 可能方向 | 觸發條件 |
|---------|---------|
| 深化自動化 | 回饋：「自動化很棒但不夠穩」 |
| 簡化入門 | 回饋：「太複雜了，只想用 quick」 |
| 擴展平台 | 回饋：「想自己加 agent」 |
| 重新定位 | 回饋：「我不需要全自動」 |

---

## 分工模型（RACI）

| 角色 | 是誰 | 核心職責 |
|------|------|---------|
| **Product Owner** | 使用者 | 願景、最終決策、Go/No-Go、優先順序 |
| **PM Agent** | product-manager | 分析、建議、結構化、追蹤、drift 偵測 |
| **Architect** | architect agent | 技術可行性、架構決策 |
| **Developer** | developer agent | 實作 |

### RACI 矩陣

| 決策領域 | Product Owner | PM Agent | Architect | Developer |
|---------|:---:|:---:|:---:|:---:|
| 產品願景和定位 | **A/R** | C | I | I |
| 功能優先順序 | **A** | R | C | I |
| Go/No-Go 決策 | **A/R** | C | C | I |
| 需求探索和釐清 | C | **A/R** | I | I |
| 方案比較和分析 | A | **R** | C | I |
| MVP 範圍定義 | A | **R** | C | I |
| 成功指標設定 | A | **R** | I | I |
| 技術架構 | I | I | **A/R** | C |
| 實作細節 | I | I | C | **A/R** |
| Drift 偵測 | I | **A/R** | I | I |

> R=執行 A=當責 C=諮詢 I=通知

### 協作流程

```
使用者有新想法
    ↓
[1] 使用者描述需求（可以很模糊）
    ↓
[2] PM Agent: 五層追問 → 釐清問題 → 產出 Product Brief
    ↓
[3] 使用者: 確認/修改 Brief（Go/No-Go 決策點）
    ↓
[4] PM Agent: 建議 workflow 類型
    ↓
[5] Pipeline 自動執行: PLAN → ARCH → DEV → TEST → ...
    ↓
[6] PM Agent: 完成後 drift 偵測 — 交付物是否對齊原始目標？
```

**關鍵原則**：

- 使用者不需要懂產品管理理論。PM Agent 自動使用 RICE/MoSCoW/Kano，使用者只需回答「你想解決什麼問題」和「這方向對嗎」
- 使用者保留所有最終決策權。PM Agent 永遠是 advisory 角色
- 使用者可以隨時推翻 PM 的建議

---

## 失真防護

### 檢測清單（每次開發前自問）

| 檢查項 | 問題 | 失真信號 |
|--------|------|----------|
| 動機測試 | 這個功能是因為有人需要，還是因為我可以做？ | 答不出具體使用場景 |
| 複雜度測試 | 這會讓 Main Agent 的 SKILL.md 變長嗎？ | auto/SKILL.md 超過 120 行 |
| 外部驗證 | 有沒有任何非我本人的人要求過這個功能？ | 所有功能都是自己想的 |
| 10 次測試 | 這個 workflow 我連跑 10 次，成功幾次？ | 成功率低於 80% |

### 量化指標上限

| 指標 | 當前值 | 上限 |
|------|--------|------|
| auto/SKILL.md 行數 | 101 行 | ≤ 120 行 |
| Workflow 模板數 | 18 個 | ≤ 20 個 |
| Agent 數量 | 17 個 | 凍結，不新增 |

---

## 文件索引

| 文件 | 職責 | 更新頻率 |
|------|------|---------|
| `docs/product-brief.md` | 產品定位、目標用戶、差異化、MVP 範圍 | 每次 Phase 完成時 |
| `docs/product-roadmap.md` | Phase 計劃、成功指標、進度追蹤 | 每次 Phase 進入/退出時 |
| `docs/status.md` | 版本狀態、核心指標、近期變更 | 每次版本發布 |
| `docs/spec/overtone.md` | 技術規格索引 | 架構變更時 |
