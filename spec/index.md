# Nova 產品規格

> 最後更新：2026-03-15 | 規格管理：`nova-spec` skill

## 導覽

| 目錄 | 用途 |
|------|------|
| [`roadmap.md`](./roadmap.md) | 路線圖（R0-R5 + 執行優先序） |
| `docs/` | 章文件（功能歸檔後從 change/ 整理而來） |
| `change/` | 進行中的 spec / design |
| `archive/` | 已歸檔（原始文件完整保留） |

## 系統架構

**使命**：推進 `~/.claude/` 達到 Layer 1-4 能力，打造通用自主代理核心。

**架構模式**：單腦 + D0-D4 深度路由 + Worker + 本地模型背景 agent

### Layer 總覽

| Layer | 名稱 | 模組（9 個） | 狀態 |
|:-----:|------|------------|:----:|
| 1 | 核心大腦 | Guards ✅ + Maintainer ✅ + Learner ✅ + Judge ✅ | ✅ 4/4 |
| 2 | 自我進化 | Skill Lifecycle ⬜ + Acid Test ⬜ | 🔴 0/2 |
| 3 | 感知操控 | 心跳 ⬜ + OS 腳本 ⬜ + 操控層 ⬜ | 🔴 0/3 |
| 4 | 通用代理人 | 動態 MCP + 跨領域自主運作 | ⬜ |
| 5 | 產品 | 開放集合 | ⬜ |

### 現有基礎

- **Rules** 14 個 — 全域行為規範（含 paths 觸發的元件閉環）
- **Skills** 29 個 — 知識庫（含 nova-spec、closed-loop、nova-test）
- **Agents** 3 個 — planner / executor / reviewer
- **Nova Server** — hook dispatch + Flow Visualizer + SSE + metrics
- **Guards** — `guards.js` 統一模組（Bash 黑名單 + 元件保護）
- **背景 Agent** — maintainer.js + learner.js（SessionEnd 本地模型，零 API token）
- **Notion** — Nova Roadmap database + 雙向同步

## 章文件索引

> 歸檔流程見 `~/.claude/skills/nova-spec/references/archive-protocol.md`

| 領域 | 摘要 | 章文件 | 更新日期 |
|------|------|--------|---------|
| 常駐服務 | Nova Server daemon + hook-client 防呆 + 可觀測層 + Hook Error 閉環 | `docs/常駐服務.md` | 2026-03-15 |
| 架構演進 | Pipeline → 深度路由、Agent 18 → Worker 3 | `docs/架構演進.md` | 2026-03-15 |
| 製作規範 | 完全閉環 + 自動修復 + 補全能力 | `docs/製作規範.md` | 2026-03-15 |

## 相關文件

| 文件 | 位置 | 說明 |
|------|------|------|
| 五層願景 | `docs/vision.md` | L1-L5 定義 + 設計原則 |
| L1-L2 實作計劃 | `docs/spec/L1-L2-守衛與閉環-實作計劃.md` | R1 詳細設計（backlog） |
| Flow Visualizer v3 | `docs/spec/flow-visualizer-ui-v3.md` | UI 改善規格（backlog） |
