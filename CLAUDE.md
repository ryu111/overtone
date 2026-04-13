# CLAUDE.md

# Overtone — 開發 Repo

**使命**：推進 `~/.claude/` 達到 Layer 1-4 能力，打造通用自主代理核心。

此 repo 提供 tests、docs、specs 支撐開發品質。實際程式碼存放在 `~/.claude/`（唯一 SoT）。

## 核心目標（討論式派發用）

- **core_objective**：推進 `~/.claude/` 達 L1-L4，打造通用自主代理核心。本質是 **Agent Harness**（Guide + Sensor + Closed-Loop 三支柱）— 用 rules/skills/commands 引導 AI 行為、用 hooks 偵測實際執行、用 feedback loop 自我修正。**Feedback Loop 是做事守則**：每個行動必須閉環（觀察 → 驗證 → 改善），不做完就停。
- **non_negotiables**（不可協商底線）：
  - 測試零容忍（全域元件改動必先跑測試，失敗不放行）
  - 治本優先（結構性缺陷 > 末端修補，不接受 workaround）
  - `~/.claude/` 唯一 SoT（禁止 fork / 禁止另建全域元件）
  - Feedback Loop 閉環（每個產出必須有驗證證據，觀察 → 驗證 → 改善，半途而廢或靜默失敗均不接受）

> 詳見 `~/.claude/rules/協作/討論式派發.md`。

## 雙 Repo 管理

| Repo         | 路徑                   | GitHub            | 內容                         |
| ------------ | ---------------------- | ----------------- | ---------------------------- |
| **nova**     | `~/.claude/`           | `ryu111/nova`     | nova 全域專案 SoT            |
| **nova-brain** | `~/projects/nova-brain/` | `ryu111/nova-brain` | 開發輔助（tests/docs/specs） |

每次迭代完成後，📋 MUST commit 並 push 兩個 repo 的變更。

> 定位、架構概要、工作流觸發、常用管理指令詳見全域 `~/.claude/CLAUDE.md`。

## 技術棧

| 模組 | 技術 |
|------|------|
| Runtime | Bun |
| 測試 | bun:test（多核並行） |
| 文件 | VitePress |
| Lint | Biome |

## 目錄結構

```
nova-brain/
├── tests/          # 單元 + 整合測試（1354 pass）
├── spec/           # 三狀態任務管理（待做/進行中/完成）
├── docs/           # 設計文件 + 願景
├── dashboard/      # Flow Visualizer 前端
└── scripts/        # 測試輔助腳本
```

## 常用指令

```bash
# 測試
bun test                         # 多核並行 unit（預設，~1s）
bun test:all                     # 多核 unit + integration（CI 用，~11s）
bun test:seq                     # 單執行緒 unit（出問題時縮小範圍）
bun test:random                  # 洗牌順序（確認無隱藏依賴）

# 任務管理
bun ~/.claude/scripts/spec-tasks.js list          # 查看待做任務
bun ~/.claude/scripts/spec-tasks.js create <名稱> # 建立任務
bun ~/.claude/scripts/spec-tasks.js index         # 更新 spec/index.md
```

## 開發規範

- **文件位置**：設計文件寫在 `docs/`，⚠️ 不要寫在 `~/.claude/` 下
- **元件閉環**：見 `~/.claude/rules/品質/閉環規範.md` → `~/.claude/skills/closed-loop/`

## Hook 改動驗收

Hook 腳本修改和 settings.json 設定變更皆在同一 session 即時生效（無需重啟）。驗收方式：

- **單元測試**：`require()` handler 驗證 output 格式
- **Hook stdout 驗收**：pipe stdin 到 hook 腳本，檢查 JSON 有 `hookSpecificOutput.additionalContext`

```bash
echo '{"prompt":"test","cwd":"'$PWD'"}' | bun ~/.claude/hooks/scripts/prompt/on-submit-flow.js
```

## 關鍵文件

| 文件                                         | 用途                       |
| -------------------------------------------- | -------------------------- |
| `spec/index.md`                              | 專案索引（元件目錄 + 任務狀態）|
| `spec/roadmap.md`                            | 路線圖                     |
| `docs/vision.md`                             | 五層願景定義               |
| `docs/目標場景.md`                            | 5 個端到端驗收場景          |
