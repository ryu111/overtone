# ECC Hooks 與 Rules 架構

> 來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code)

## 關鍵發現：ECC 沒有 Hooks

ECC 主要為 Cursor IDE 設計，Cursor **不支援 Hook 系統**。

> MIGRATION.md: "Hooks (PreToolUse/PostToolUse/Stop) | **No equivalent**"

替代方案：
- **Rules 規則檔案** → 取代 Hook 的引導功能
- **格式化 on Save** → 取代 post-edit hook
- **Pre-commit hooks** → 取代 pipeline-guard
- **CI/CD** → 取代品質門

## Rules 系統架構

### 27 個規則檔案

```
.cursor/rules/
├── 通用規則（8 個，alwaysApply: true）
│   ├── common-coding-style.md    # 不可變性、組織
│   ├── common-git-workflow.md    # commit 格式、PR
│   ├── common-testing.md         # TDD、80% 覆蓋率
│   ├── common-performance.md     # model 選擇、context 管理
│   ├── common-patterns.md        # 設計模式、骨架
│   ├── common-hooks.md           # hook 架構原則
│   ├── common-agents.md          # agent 委派規則
│   └── common-security.md        # 安全檢查
│
├── 語言規則（基於 glob 自動啟動）
│   ├── typescript-*.md (5 個)    # *.ts/*.tsx 時載入
│   ├── python-*.md (5 個)        # *.py 時載入
│   └── golang-*.md (5 個)        # *.go 時載入
│
└── 上下文規則（alwaysApply: false，手動啟動）
    ├── context-dev.md            # 開發模式
    ├── context-research.md       # 研究模式
    └── context-review.md         # 審查模式
```

### 加載機制

```yaml
# Frontmatter 控制加載時機
---
description: "描述"
alwaysApply: true       # 全局：每次都注入
globs: ["**/*.ts"]      # 條件：匹配檔案時注入
alwaysApply: false      # 手動：@context-dev 啟動
---
```

## 指令強度分析

### ECC Rules 的用詞分佈

| 強度 | 用詞 | 頻率 | 場景 |
|:----:|------|:----:|------|
| ⛔ 100% | MANDATORY, NEVER | 15+ | 安全、測試覆蓋率 |
| 📋 95% | MUST, CRITICAL, ALWAYS | 40+ | 程式碼風格、工作流 |
| 💡 60% | should, prefer, consider | 10+ | 最佳實踐 |
| 🔧 40% | may, use with caution | 5+ | 可選功能 |

### 核心規則範例

**common-security.md**（MANDATORY）：
```
Before ANY commit:
- NEVER hardcode secrets
- ALWAYS use environment variables
- Security is not optional
```

**common-testing.md**（MANDATORY）：
```
Minimum Test Coverage: 80%
MANDATORY workflow: RED → GREEN → REFACTOR
```

**common-coding-style.md**（CRITICAL）：
```
ALWAYS create new objects, NEVER mutate existing ones
```

**common-agents.md**（ALWAYS）：
```
ALWAYS use parallel Task execution for independent operations
```

## Hooks vs Rules 架構比較

| 面向 | Vibe Hooks | ECC Rules |
|------|-----------|-----------|
| 執行強度 | 系統層級強制（`decision: "block"`） | 文化層級建議（model 遵從） |
| 加載方式 | hooks.json 固定配置 | Frontmatter glob/alwaysApply |
| 新增方式 | 改 hooks.json + 寫腳本 | 直接加 .md 檔案 |
| 即時生效 | 需重啟 session | 即時（每次請求讀取） |
| 可繞過 | 只有 `/vibe:cancel` | model 可忽略（概率低） |
| 適用平台 | Claude Code 限定 | Cursor / OpenCode / 任何 |

## Vibe Hook 功能在 ECC 的對應

| Vibe Hook | ECC 替代 | 替代程度 |
|-----------|---------|:--------:|
| pipeline-guard（⛔ 阻擋寫碼） | common-security.md 建議 | 70% |
| post-edit（自動 lint/format） | 編輯器 format-on-save | 50% |
| task-guard（檢查任務完成） | tdd-guide agent + CI/CD | 60% |
| stage-transition（流程轉換） | **無對應** | 0% |
| dashboard-refresh（儀表板同步） | **無對應** | 0% |
| remote-hub（Telegram 推播） | **無對應** | 0% |

## 對 Overtone 的啟示

### 雙層設計（已驗證的最佳模式）

```
Layer 1: Rules / Skills（引導層）
  ├─ 告訴 Claude 該怎麼做
  ├─ 用 MUST/should/consider 分級
  └─ 90%+ 情境下 Claude 會遵守

Layer 2: Hooks（守衛層）
  ├─ 萬一 Claude 沒照做，硬擋
  ├─ decision: "block" 不留餘地
  └─ 只用於安全紅線和流程強制
```

### 具體建議

1. **Rules 即 Skills** — Overtone 可以把 ECC 的 common-*.md 概念融入 Skills
2. **glob 條件載入** — 值得借鏡：編輯 .py 時自動載入 Python 規則
3. **上下文模式** — context-dev / context-research / context-review 切換
4. **Hook 最小化** — 只保留真正需要硬擋的（pipeline-guard 等級）
5. **擴充友好** — 新增規則 = 加一個 .md 檔案，不需改配置
