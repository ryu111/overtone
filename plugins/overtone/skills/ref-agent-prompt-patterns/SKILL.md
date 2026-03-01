---
name: ref-agent-prompt-patterns
description: Agent prompt 工程模式快速參考：角色定義、方法論結構、專業領域覆蓋、品質標準（源自 Anthropic 官方 claude-code-best-practices）。
disable-model-invocation: true
user-invocable: false
---

# Agent Prompt 工程模式快速參考

> 來源：Anthropic 官方 `awattar/claude-code-best-practices`

## Prompt 結構模板

```markdown
---
name: agent-name
description: >
  一句話描述角色專長。使用範例（幫助 Claude 決定何時路由到此 agent）：
  - "幫我優化這個 API 端點"
  - "重構這段程式碼提升可維護性"
---

# 角色定義（Identity）
你是 [角色名稱]，擁有 [年資] 年 [領域] 經驗。

# 核心職責（Core Responsibilities）
## 領域 1: [職責名稱]
- 具體能力 1
- 具體能力 2

## 領域 2: [職責名稱]
...

# 工作方法論（Methodology）
每次任務遵循：
1. 分析 → 2. 規劃 → 3. 執行 → 4. 驗證

# 品質標準（Quality Standards）
- 標準 1
- 標準 2
```

## 六個設計要素

| 要素 | 說明 | 範例 |
|------|------|------|
| **Identity** | 明確角色定位 + 資歷 | 「Senior Solution Architect，15+ 年經驗」 |
| **Expertise** | 3-5 個專精領域 | API 設計、DB 優化、系統可靠性、監控 |
| **Methodology** | 結構化工作流程 | 分析 → 評估 → 設計 → 驗證 |
| **Standards** | 遵循的品質基線 | SOLID、OWASP、WCAG |
| **Context** | 專案特定技術棧 | Bun runtime、Alpine.js、SQLAlchemy |
| **Examples** | description 中的使用範例 | 幫助 Claude 路由到正確 agent |

## 官方 Agent 角色分類

### 基礎設施層
- **Solution Architect** — 分散式系統、技術選型、可擴展性、安全架構
- **DevOps/SRE** — IaC、CI/CD、容器編排、監控告警、chaos engineering

### 開發層
- **Backend Developer** — API 設計（REST/GraphQL）、DB 優化、系統可靠性（circuit breaker）
- **Frontend Developer** — 無障礙性（WCAG）、效能（Core Web Vitals）、CSS 架構
- **Fullstack Developer** — 端到端功能（DB → API → UI）、狀態管理、type safety

### 品質層
- **QA Specialist** — 測試策略、自動化架構、風險分析、品質門檻
- **Code Quality Debugger** — Code review、root cause analysis、重構策略、技術債
- **Technical Project Lead** — 效能/安全評估、KPI 決策、風險緩解

### 支援層
- **Technical Writer** — API doc、install guide、troubleshooting guide
- **Product Manager** — Issue 生命週期、Gherkin AC、Definition of Done

## Overtone 四模式 vs 官方模式對照

| Overtone 模式 | 說明 | 官方對應 |
|---------------|------|----------|
| 信心過濾 | 只在信心 > 閾值時報告 | 無（官方無過濾機制） |
| 邊界清單 | DO/DON'T 明確列表 | 有（Quality Standards 區段） |
| 誤判防護 | 易混淆場景的判斷指引 | 無（官方依賴 prompt 自然語言） |
| 停止條件 | 完成 / 需協助 / 超範圍 | 有（Methodology 包含終止步驟） |

## 通用品質標準清單

從官方 agent 中提煉的通用品質基線：

- **SOLID 原則** — 單一職責、開放封閉、依賴反轉
- **OWASP Top 10** — 注入、認證失效、敏感資料暴露、XSS
- **WCAG 2.1** — 可感知、可操作、可理解、穩健
- **12-Factor App** — 設定外部化、port binding、dev/prod 一致
- **Clean Architecture** — 依賴規則、邊界清晰、可測試
