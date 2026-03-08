# CLAUDE.md

# Overtone — 開發 Repo

**使命**：推進 `~/.claude/` 達到 Layer 1-4 能力，打造通用自主代理核心。

此 repo 提供 tests、docs、specs 支撐開發品質。實際程式碼存放在 `~/.claude/`（唯一 SoT）。

## 雙 Repo 管理

| Repo | 路徑 | GitHub | 內容 |
|------|------|--------|------|
| **nova** | `~/.claude/` | `ryu111/nova` | Plugin 元件 SoT |
| **overtone** | `~/projects/overtone/` | `ryu111/overtone` | 開發輔助（tests/docs/specs） |

每次迭代完成後，📋 MUST commit 並 push 兩個 repo 的變更。

當前進度：L1 ✅ L2 ✅ L3 🟡（L3.6 Acid Test 待執行）L4 ⬜

> 定位、架構概要、工作流觸發、常用管理指令詳見全域 `~/.claude/CLAUDE.md`。

## 設計原則

1. **狀態最小化**：只記必要的 — 誰做了什麼、結果是什麼
2. **BDD 驅動**：先定義行為（GIVEN/WHEN/THEN）再寫碼
3. **Loop 預設**：任務完成自動繼續下一個

## 並行委派

委派 subagent 前，📋 MUST 評估是否可拆分：
- **可拆分**（操作不同檔案 + 無邏輯依賴）→ 並行委派
- **不可拆分**（修改同檔案 / B 需要 A 的輸出）→ 依序委派

## 常用指令

```bash
bun scripts/test-parallel.js    # 並行測試（~21s）
bun test                         # 單進程測試（~53s）
```

> 其他管理指令（health-check、manage-component、queue 等）見全域 CLAUDE.md。

## 開發規範

- **文件位置**：設計文件寫在 `docs/`，⚠️ 不要寫在 `~/.claude/` 下
- commit 涉及 plugin 變更時更新 plugin.json version
- **不做向後相容**：舊 API 直接改新的，沒用到的直接刪除
- **元件閉環**：新增/修改 Skill、Agent、Hook 時檢查三者依賴
  > 詳見 `~/.claude/skills/claude-dev/references/overtone-conventions.md`

## 關鍵文件

| 文件 | 用途 |
|------|------|
| `docs/spec/overtone.md` | 完整規格索引 |
| `docs/spec/overtone-decision-points.md` | 控制流決策點快查 |
| `~/.claude/scripts/lib/registry.js` | SoT — 所有映射定義 |
