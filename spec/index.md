# Nova 產品規格

> 最後更新：2026-03-14 | 規格管理：`nova-spec` skill

## 導覽

| 目錄 | 用途 |
|------|------|
| [`roadmap.md`](./roadmap.md) | 路線圖（R0-R5 + 執行優先序） |
| `docs/` | 章文件（功能歸檔後從 change/ 整理而來） |
| `change/` | 進行中的 spec / design |
| `archive/` | 已歸檔（原始文件完整保留） |

## 系統架構

**使命**：推進 `~/.claude/` 達到 Layer 1-4 能力，打造通用自主代理核心。

**架構模式**：單腦 + D0-D4 深度路由 + Worker（planner / executor / reviewer）

### Layer 總覽

| Layer | 名稱 | 目標 | 狀態 |
|:-----:|------|------|:----:|
| 1 | 核心大腦 | 守衛 + 任務引擎 + 學習/評分/收斂/回饋 | 🔴 重建中 |
| 2 | 感知操控 | OS 腳本 + 心跳引擎 + 佇列系統 | 🔴 重建中 |
| 3 | 自我進化 | Gap 偵測 + Skill Forge + PM + Orchestrator | 🔴 重建中 |
| 4 | 通用代理人 | 動態 MCP 工具 + 跨領域自主運作 | ⬜ 待開始 |
| 5 | 產品 | 使用者面向產品（開放集合） | ⬜ 待開始 |

### 現有基礎

- **Rules** 12 個 — 全域行為規範
- **Skills** 28 個 — 知識庫（SKILL.md + references 完整）
- **Agents** 3 個 — planner / executor / reviewer
- **Flow Visualizer** — hooks 事件 → SSE → 即時顯示
- **Guards** 2 個 — pre-bash-guard + pre-edit-guard

## 章文件索引

> 章文件在功能歸檔時自動產生，初始為空。
> 歸檔流程見 `~/.claude/skills/nova-spec/references/archive-protocol.md`

## 相關文件

| 文件 | 位置 | 說明 |
|------|------|------|
| 架構重設計 | `docs/spec/架構重設計.md` | Pipeline → 深度路由分析 |
| L1-L2 實作計劃 | `docs/spec/L1-L2-守衛與閉環-實作計劃.md` | R1 詳細設計 |
| Hook Dispatcher | `docs/spec/hook-dispatcher-架構.md` | Dispatcher 架構規格 |
| 五層願景 | `docs/vision.md` | L1-L5 定義 |
