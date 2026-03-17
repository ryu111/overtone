# CLAUDE.md

# Overtone — 開發 Repo

**使命**：推進 `~/.claude/` 達到 Layer 1-4 能力，打造通用自主代理核心。

此 repo 提供 tests、docs、specs 支撐開發品質。實際程式碼存放在 `~/.claude/`（唯一 SoT）。

## 雙 Repo 管理

| Repo         | 路徑                   | GitHub            | 內容                         |
| ------------ | ---------------------- | ----------------- | ---------------------------- |
| **nova**     | `~/.claude/`           | `ryu111/nova`     | nova 全域專案 SoT            |
| **overtone** | `~/projects/overtone/` | `ryu111/overtone` | 開發輔助（tests/docs/specs） |

每次迭代完成後，📋 MUST commit 並 push 兩個 repo 的變更。

> 定位、架構概要、工作流觸發、常用管理指令詳見全域 `~/.claude/CLAUDE.md`。

## 文件生命週期

- `spec/`：產品規格（主文件 index.md + roadmap + change/ 進行中 + archive/ 歸檔）
- `docs/archive/`：歷史參考（已完成的設計規格）

## 常用指令

```bash
bun test                         # 多核並行 unit（預設，~1s）
bun test:all                     # 多核 unit + integration（CI 用，~11s）
bun test:seq                     # 單執行緒 unit（出問題時縮小範圍）
bun test:random                  # 洗牌順序（確認無隱藏依賴）
```

## 開發規範

- **文件位置**：設計文件寫在 `docs/`，⚠️ 不要寫在 `~/.claude/` 下
- **元件閉環**：見 `~/.claude/rules/閉環規範.md` → `~/.claude/skills/closed-loop/`

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
| `spec/index.md`                              | 產品規格主文件（架構地圖）  |
| `spec/roadmap.md`                            | 重建路線圖（R0-R5）        |
| `docs/vision.md`                             | 五層願景定義               |
| `docs/archive/L1-L2-守衛與閉環-實作計劃.md`   | R1 詳細實作設計（已歸檔）    |
