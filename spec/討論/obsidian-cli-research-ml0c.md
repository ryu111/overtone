# Obsidian CLI 研究報告 — Nova 整合可行性

**日期**：2026-04-16  
**xd 來源**：xd-1776340750353-ml0c  
**目的**：研究 Obsidian 官方 CLI 是否應整合進 nova 工作流

---

## 一、Obsidian 官方 CLI 現狀

### 1.1 基本資訊

| 項目 | 內容 |
|------|------|
| 版本 | v1.12.4 GA（2026-02-27，含 Early Access 自 v1.12.0 2026-02-10） |
| 安裝方式 | 內建於 Obsidian 桌面 app，無需另行安裝 |
| 狀態 | 官方正式發布，所有用戶可用 |

### 1.2 主要指令

```bash
obsidian search query="meeting notes"   # 搜尋 vault
obsidian read <note-path>               # 讀取筆記
obsidian create <note-path>             # 建立筆記
obsidian daily                          # 開啟每日筆記
```

### 1.3 關鍵限制（對 Nova 最重要的發現）

**⚠️ CLI 不是 headless 工具，而是 running Obsidian app 的 remote control。**

> The CLI operates as a "remote control" for a running Obsidian app. It is not a standalone headless tool. If Obsidian is not running when you execute a CLI command, it will launch automatically.

這意味著：
- 每次 CLI 指令執行時，Obsidian GUI app 必須在運行（或被自動啟動）
- 在自動化腳本中使用 CLI → 觸發 GUI app 啟動
- 無 GUI 環境（伺服器、headless CI）→ 不可用

---

## 二、Nova 三個整合問題的答案

### Q1：nova session dispatch / note read 能否用 Obsidian CLI 更高效讀寫 vault？

**結論：不建議。直接 Claude Read/Write 優於 Obsidian CLI。**

| 維度 | Claude Read/Write | Obsidian CLI |
|------|-------------------|--------------|
| 可用性 | 隨時，無依賴 | 需 Obsidian app 運行 |
| 速度 | 直接 file I/O | RPC 到 Obsidian 進程 |
| 自動化 | ✅ 腳本安全 | ❌ 觸發 GUI app |
| 搜尋 | 需 grep/glob | ✅ Obsidian semantic search |
| Tags/Backlinks | 需自己解析 | ✅ 原生支援 |

對 nova 的 use case（讀寫 incident records、synthesis reports），markdown 檔案直接 I/O 已足夠。Obsidian CLI 的優勢（semantic search、backlinks、dataview）只在複雜 vault 查詢時才有價值。

### Q2：Claude Read/Write 直接讀寫 markdown vs Obsidian CLI 哪個更好？

**結論：Claude Read/Write 適合 nova 自動化，Obsidian CLI 適合人工互動使用。**

| 場景 | 推薦 |
|------|------|
| 蒸餾循環（週日 02:00 cron job）| Claude Write（無 GUI 依賴） |
| Session wrapup 自動建 working/ 檔案 | Claude Write |
| AI agent 讀取 incident records | Claude Read（vault pointer 已驗證有效） |
| 人工在 Obsidian 中搜尋/整理筆記 | Obsidian CLI + GUI |
| 需要 backlink/tag 查詢 | Obsidian CLI（未來 Phase N 考慮） |

### Q3：obsidian-git 外掛 vs git CLI 備份哪個適合 nova？

**結論：git CLI 更適合 nova 自動化。**

| 維度 | obsidian-git 外掛 | git CLI |
|------|------------------|---------|
| 觸發時機 | 只在 Obsidian 打開時 | 任何時候 |
| 自動化腳本可用 | ❌（需 GUI） | ✅ |
| 整合 nova scripts | 複雜 | 簡單 |
| commit message 控制 | 有限（外掛設定） | 完全控制 |
| 現有 nova 工作流相容 | 需額外設定 | 直接使用 |

Phase 0 已使用 git CLI + `~/.gitignore_global` 方式，這是正確選擇。

---

## 三、是否安裝 Obsidian CLI？

**結論：Phase 0-5 MVP 不需要安裝，維持現有直接 file I/O 方案。**

理由：
1. CLI 需要 Obsidian app 運行 → 自動化腳本不可靠
2. Phase 0 的 vault 設計（純 markdown 目錄）天然與 Claude Read/Write 相容
3. 加入 CLI 依賴只增加複雜度，無明顯收益

**未來可考慮的場景（Phase N+）**：
- 如果 nova 需要在 Obsidian vault 中做 semantic search（跨 incident 找 pattern）
- 如果需要 dataview 查詢（如找所有 trigger_type=correction 的 incidents）
- 屆時可評估 Obsidian CLI 的 search 指令是否值得引入 GUI 依賴

---

## 四、同族工具備查

| 工具 | 性質 | Nova 相關性 |
|------|------|------------|
| Obsidian 官方 CLI | GUI remote control | ❌ 自動化不適合 |
| obsidian-headless | Obsidian Sync 同步用 | ❌ 不需要 Sync |
| notesmd-cli / obsidian-vault-cli | 社群工具，直接 file I/O | ⚠️ 等同 Claude Read/Write，無額外價值 |
| obsidian-git 外掛 | GUI 內 git 備份 | ❌ 被 git CLI 取代 |

---

## 五、建議

Phase 0 的 vault 建設路線正確，無需調整：

- **vault 讀寫**：Claude Read/Write（已驗證 behavioral eval pass）
- **備份**：git CLI（已設定，vault commit `f3c555c`）
- **搜尋**：grep 或 Claude glob（現階段足夠）
- **Obsidian CLI**：留作「人工互動工具」選項，暫不整合進自動化流程

Phase 0 完成，可立即進入 Phase 1 + Phase 4 + Phase 5 並行。
