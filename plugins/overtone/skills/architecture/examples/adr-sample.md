# ADR-001. 使用 Bun 作為 Runtime

**狀態**：Accepted
**日期**：2024-08-15
**決策者**：Overtone 核心團隊

## 背景與問題陳述

Overtone plugin 需要一個 JavaScript runtime 來執行 hook scripts、dashboard server、以及測試。當時考慮的選項是 Node.js（v20 LTS）和 Bun（v1.x）。專案需求：
- 快速的腳本啟動時間（hook 每次 Claude Code 事件都觸發，延遲要低）
- 原生 TypeScript 支援（無需 ts-node 或 esbuild 前置步驟）
- 內建測試框架（減少外部依賴）
- 與 npm ecosystem 相容

## 考慮的方案

### 方案 A：Node.js v20 LTS

Node.js 成熟的 LTS 版本，廣泛使用。

**優點**：
- 生態系統最成熟
- 企業支援有保障
- 社群資源豐富
- 大多數開發者熟悉

**缺點**：
- 腳本啟動時間 ~150-300ms（hook 每次都需啟動）
- TypeScript 需要額外工具（ts-node 或預編譯）
- 測試需要 Jest/Vitest 等外部框架

### 方案 B：Bun v1.x

新興的 JavaScript runtime，強調效能和 DX。

**優點**：
- 腳本啟動時間 ~10-30ms（比 Node.js 快 10x）
- 原生 TypeScript + JSX 支援
- 內建測試框架（bun:test）
- 內建打包器和套件管理器

**缺點**：
- 相對較新（穩定性存疑）
- 部分 Node.js API 尚未完全相容
- 較少企業採用案例

## 決策

**選擇方案 B（Bun）**，因為 hook scripts 的啟動延遲直接影響使用者體驗 — 每個 Claude Code 事件都要啟動一個新的 Node 進程，150ms+ 的延遲會讓使用者感到 UI 卡頓。Bun 的 10-30ms 啟動時間在用戶互動密集的場景有決定性優勢。

## 結果

**正面影響**：
- Hook 啟動延遲降低 90%，使用者幾乎感覺不到 hook 執行
- 零設定即可執行 TypeScript
- 統一的工具鏈（runtime + bundler + test runner）

**負面影響**：
- 偶爾遇到 Bun 的 Node.js 相容性問題（需要繞過）
- 部分 npm 套件在 Bun 下有邊界行為差異
- 開發者需要安裝 Bun（不能直接用系統 Node.js）

## 實作注意事項

- 使用 `bun run` 執行腳本，不是 `node`
- `package.json` 中的 `scripts` 用 `bun` 呼叫
- 測試框架改用 `bun:test` API（兼容 Jest API）
- 如遇到 Bun 不支援的 API，在 `scripts/lib/utils.js` 加入 polyfill
