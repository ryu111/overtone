# 修復 hook error: PreToolUse:Bash:dispatch — 技術設計

## 深度路由：D2
**理由**：跨 3 個檔案修改 + 1 個新檔案建立，涉及 server 穩定性，但修改範圍明確且模式清晰，不需審查（D3）或多 executor 並行（D4）

---

## 技術摘要

- **方案**：外部檔案 + 指數退避 + process error handler + 自癒型標記擴充
- **理由**：4 個修復各解決一個獨立問題面向，根因（template literal）+ 防護（恢復/容錯/降噪）
- **取捨**：pollHealth 等待時間增加 ~2 秒（僅 server 重啟場景），可接受

## 方案比較

### Fix 1：消除 SELF_DRIVE_PROMPT 脆弱性

| 維度 | 方案 A：外部 .md 檔案（選擇） | 方案 B：heredoc 字串（單引號） |
|------|:----------------------------:|:----------------------------:|
| 複雜度 | 低（readFileSync 一行） | 低（改引號類型） |
| 根因解決 | 完全消除（Markdown 不需 escape） | 部分（仍在 JS 中，合併時可能改壞） |
| 可維護性 | 高（任何編輯者都能安全修改 .md） | 中（仍需了解 JS 字串規則） |
| 風險 | 檔案不存在需處理 | 無額外風險 |
| **結論** | ✅ 選擇：根因消除 | ❌ 治標不治本 |

### Fix 2：pollHealth 等待策略

| 維度 | 方案 A：指數退避（選擇） | 方案 B：增加 retry 次數 |
|------|:--------------------:|:--------------------:|
| 總等待 | ~3.1 秒（200+400+800+1600） | 2 秒（10 × 200ms） |
| 彈性 | 越等越久，適應不同啟動速度 | 固定間隔 |
| 複雜度 | 低 | 最低 |
| **結論** | ✅ 更適應實際啟動場景 | ❌ 啟動慢時仍不夠 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | self-drive-prompt.md | `~/.claude/data/` | ~25 | heartbeat self-drive 的 prompt 文字（純 Markdown） |

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/hooks/server.js` | 刪除 L53-78 的 `SELF_DRIVE_PROMPT` 常數，改為 `readFileSync` 讀 data/self-drive-prompt.md；檔尾加 process error handler |
| 2 | `~/.claude/hooks/hook-client.js` | `pollHealth` 改為指數退避（4 retries: 200/400/800/1600ms，共 3 秒） |
| 3 | `~/.claude/scripts/error-analyzer.js` | `isSelfHealingError` 新增 `dispatch` phase 的自癒判定 |

### API 設計

無新增 API，只修改內部實作。

## 資料模型

- 新增檔案：`~/.claude/data/self-drive-prompt.md`
- 格式：純 Markdown 文字
- 清理策略：不清理（靜態設定檔）

## 執行步驟

### Phase 1：根因修復 + 防護（parallel，3 個檔案互不依賴）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | `~/.claude/data/self-drive-prompt.md` | 建立外部 prompt 檔案（從 server.js L53-78 提取，去除 `\`` escape） |
| 1b | `~/.claude/hooks/server.js` | 刪除 `SELF_DRIVE_PROMPT` 常數 → 改 `readFileSync` + 加 process error handler |
| 1c | `~/.claude/hooks/hook-client.js` | `pollHealth` 改指數退避 |
| 1d | `~/.claude/scripts/error-analyzer.js` | `isSelfHealingError` 擴充 dispatch phase |

### Phase 2：測試驗收（sequential，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2a | 既有測試 | `bun test` 確認無回歸 |
| 2b | error-analyzer 測試 | 驗證 `isSelfHealingError('PreToolUse:Bash:dispatch')` === true |

## Pre-mortem

**假設這個功能上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | self-drive-prompt.md 路徑寫錯，server 啟動時 readFileSync 拋錯 crash | 中 | 高 | try-catch 包裹，失敗時 prompt = 空字串 + console.error |
| 2 | process error handler 吞掉應該 crash 的致命錯誤（如 OOM） | 低 | 中 | 只攔 uncaughtException（非 OOM），OOM 由 OS 直接 kill |
| 3 | pollHealth 指數退避仍不夠（server import 超過 3 秒） | 低 | 低 | 現有 fallback 兜底，功能不受影響 |
| 4 | error-analyzer 過度標記自癒，遮蔽真正的 dispatch 問題 | 低 | 中 | 只標記有 fallback 的事件，無 fallback 的 dispatch 失敗仍建任務 |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| `tests/error-analyzer.test.js` | `isSelfHealingError('PreToolUse:Bash:dispatch')` === true |
| `tests/error-analyzer.test.js` | `isSelfHealingError('SessionStart:dispatch')` === false（無 fallback 的事件不標自癒） |
| `bun test` | 全部通過，0 fail |

## 不做什麼

1. **不做 server.js 架構重構**：本次只解決 crash 根因和恢復速度，不改 dispatch/heartbeat 架構
2. **不做 hot-reload prompt**：self-drive-prompt.md 啟動時讀取一次即可，不需 watch 變化（修改後下次 server 重啟自動生效）
3. **不做 fallback 機制修改**：現有 fallback 運作正常，不在此次範圍
