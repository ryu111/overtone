# Issue 分類與優先級決策

> 📋 **何時讀取**：從 GitHub Issue 啟動 workflow 時，決定分類、優先級和執行策略。

## Issue 分類決策樹

```
Issue 進入
  │
  ├─ 標題/內容含 "crash" / "error" / "無法" / "broken"？
  │    └─→ 🐛 Bug（→ debug workflow）
  │
  ├─ 標題含 "新增" / "add" / "support" / "implement"？
  │    └─→ ✨ Feature（→ standard workflow）
  │
  ├─ 標題含 "改善" / "improve" / "enhance" / "optimize"？
  │    └─→ 🔧 Enhancement（→ standard workflow）
  │
  ├─ 標題含 "重構" / "refactor" / "cleanup" / "tech debt"？
  │    └─→ ♻️ Refactor（→ refactor workflow）
  │
  ├─ 標題含 "文件" / "docs" / "README" / "documentation"？
  │    └─→ 📝 Documentation（→ single workflow）
  │
  ├─ 標題含 "安全" / "security" / "vulnerability" / "CVE"？
  │    └─→ 🔒 Security（→ secure workflow）
  │
  ├─ 標題含 "UI" / "design" / "畫面" / "介面" / "layout"？
  │    └─→ 🎨 Design（→ full workflow）
  │
  └─ 無法分類？
       └─→ ❓ 預設 standard workflow + 提示使用者確認
```

## 優先級評估

### 優先級矩陣

| 優先級 | 影響範圍 | 嚴重程度 | 回應時間 | 範例 |
|:------:|---------|---------|---------|------|
| P0 緊急 | 全系統 | 服務中斷/資料遺失 | 立即 | 生產環境崩潰、安全漏洞 |
| P1 高 | 主要功能 | 功能不可用 | 當日 | 核心功能 bug、效能嚴重下降 |
| P2 中 | 次要功能 | 功能受限 | 本週 | 非核心 bug、UI 顯示問題 |
| P3 低 | 邊緣情境 | 輕微不便 | 排程 | 文案修正、非關鍵優化 |

### 優先級推斷線索

| 線索 | 推斷優先級 | 說明 |
|------|:---------:|------|
| Label 含 `critical` / `urgent` | P0 | 明確標記緊急 |
| Label 含 `security` | P0-P1 | 安全問題預設高優先 |
| Label 含 `bug` | P1-P2 | 依嚴重程度判斷 |
| Label 含 `enhancement` / `feature` | P2-P3 | 功能需求通常可排程 |
| Label 含 `docs` / `documentation` | P3 | 文件通常最低優先 |
| Issue body 提及 "workaround" | 降一級 | 有臨時方案可緩解 |
| Issue body 提及 "blocking" | 升一級 | 阻擋其他工作 |
| Assignees 非空 | 不影響 | 已有人負責 |

## Label → Workflow 映射擴展

### 基本映射（參考 label-workflow-map.md）

| Label | Workflow | 階段組成 |
|:-----:|:--------:|---------|
| `bug` | debug | DEBUG → DEV → TEST |
| `enhancement` | standard | PLAN → ARCH → T:spec → DEV → [R+T] → RETRO → DOCS |
| `feature` | standard | PLAN → ARCH → T:spec → DEV → [R+T] → RETRO → DOCS |
| `ui` / `design` | full | PLAN → DESIGN → ARCH → T:spec → DEV → [R+T] → RETRO → DOCS |
| `security` | secure | PLAN → ARCH → SECURITY → T:spec → DEV → [R+T] → RETRO → DOCS |
| `documentation` | single | DEV |
| `refactor` | refactor | ARCH → T:spec → DEV → REVIEW → T:verify |

### 複合 Label 範例

| Label 組合 | 選擇的 Workflow | 推理 |
|-----------|:--------------:|------|
| `bug` + `security` | secure | security 優先級最高 |
| `feature` + `ui` | full | full 優先級高於 standard |
| `enhancement` + `docs` | standard | standard 優先級高於 single |
| `bug` + `enhancement` | standard | standard 優先級高於 debug |
| `refactor` + `docs` | refactor | refactor 優先級高於 single |
| `security` + `ui` + `bug` | secure | security 始終最優先 |

### 優先級排序（衝突解決）

```
secure > full > standard > debug > refactor > single
```

## Issue 內容解析

- **結構化 Issue**：嘗試識別區段（問題描述 / 重現步驟 / 期望行為 / 實際行為 / 環境資訊）
- **非結構化 Issue**：< 50 字提示補充、50-500 字直接傳給 agent、> 500 字摘要前 500 字

## Issue 轉 Feature Spec 流程

### 轉換決策樹

```
Issue 讀取完成
  │
  ├─ Workflow 是 single？
  │    └─→ 不建立 spec，直接執行 DEV
  │
  ├─ Workflow 是 debug？
  │    └─→ 不建立 spec，直接執行 DEBUG → DEV → TEST
  │
  └─ 其他 workflow（standard / full / secure / refactor）？
       └─→ 建立 Feature Spec
            │
            ├─ 1. 建立目錄：specs/features/in-progress/<feature-name>/
            ├─ 2. 寫入 proposal.md（Issue 內容）
            ├─ 3. PLAN agent 產生 tasks.md
            └─ 4. ARCH agent 產生 architecture.md（若適用）
```

### proposal.md 格式

proposal.md 包含：Issue title、來源標記（Issue #number + labels + 優先級）、問題描述（原文保留）、相關資訊（URL / assignees / 建立時間）、初步分析（workflow 類型 + 選擇原因）。

### Feature Name 產生規則

Issue title → 轉小寫 → 移除非字母數字 → 空格轉連字符 → 截斷至 50 字元。
Branch 名稱格式：`feat/issue-{number}-{feature-name}`

## 分類衝突處理

| 情況 | 處置 |
|------|------|
| Label 與 body 內容不一致 | 以 Label 為準（用戶明確標記） |
| 無 Label + body 語意模糊 | 預設 standard，提示使用者確認 |
| 多個衝突 Label | 按優先級排序規則選擇最高的 |
| 無 Label 時 | 根據內容關鍵字分析建議 Label（僅建議，不自動加標記） |
