# Overtone 現況

> 最後更新：2026-03-07 | Plugin 版本：0.28.78

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 4635 pass，0 fail。核心能力：BDD 工作流自動化（18 個 agent + 18 個模板）+ 守衛強化（11 個 hook + 20 項 health-check）+ 自我進化引擎（gap detection / auto-fix / skill forge / internalization）+ OS 控制能力（截圖 + 視窗 + 系統層 + TTS 語音通知）+ 心跳引擎（跨 session 任務自主執行）+ 深度 PM 多輪訪談（領域研究 + 5 面向訪談）|
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 18（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 4615 pass / 0 fail（195 個測試檔）|
| 測試檔案 | 195 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 24（15 knowledge domain + orchestrator + pm + specs + 4 utility-with-refs + instinct） |
| scripts/lib 模組 | 66（含 analyzers/ 7 + knowledge/ 9 + remote/ 4 + dashboard/ 2 子目錄模組 + tts 相關 2） |
| Knowledge Domain 數 | 15（testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording、debugging、architecture、build-system、os-control、autonomous-control、craft、claude-dev） |
| Command 數量 | 28（14 stage shortcut + 7 workflow pipeline + 7 utility） |
| Telegram 命令 | 6（/start、/status、/stop、/run、/sessions、/help） |
| Timeline Events | 30 個 |

## 近期變更（最近 3 筆）

- **[0.28.76] 2026-03-06**：全面品質盤點文件同步——handler 測試完整覆蓋（9 handler 共 +198 tests → 4615 pass）、8 agent 加入跨 session 記憶、10 agent 補 BDD 驗收範例、6 agent prompt 深度擴充、2 skill placeholder 消除，plugin 版本同步
- **[0.28.75] 2026-03-06**：fix(convergence)——並行收斂門 TOCTOU 修復：findActualStageKey 移入 updateStateAtomic callback 保證原子性，pre-task 觸發 mid-session sanitize 修復孤兒 stage，新增 7 個測試
- **[0.28.74] 2026-03-06**：docs(craft)——Design Taste 文件同步：新增 design-taste.md 設計品味評估參考指南（RETRO phase 使用），craft SKILL.md 加入 design-taste reference 索引

## Phase 3 規劃狀態（✅ 完成）

> Phase 2 完成 → Phase 3 規劃完成（2026-03-03 PM Discovery）→ Phase 3 完成（2026-03-05）

Phase 3 目標：Layer 2 完整 OS 能力，達到 Phase 4 Ready。
架構：Bun 腳本庫（`scripts/os/`）+ `os-control` knowledge domain（第 12 個）+ OS Guard。
桌面操控：AppleScript/JXA 優先 + Computer Use 兜底。

| 階段 | 名稱 | 內容 | 狀態 |
|:----:|------|------|:----:|
| P3.0 | 閉環基礎 | os-control Skill 骨架 + Agent frontmatter + pre-bash-guard + hooks.json | ✅ |
| P3.1 | 看得見 | 截圖（screenshot.js + 4 API）+ 視窗管理（window.js + 5 API）+ 視覺分析模板 | ✅ |
| P3.2 | 心跳引擎 | Heartbeat daemon（start/stop/status）+ session-spawner.js + autonomous-control Skill | ✅ |
| P3.3 | 管得住 | Process + 剪貼簿 + 系統資訊 + 通知 + 檔案監控 | ✅ |
| P3.4 | 動得了 | keyboard.js + mouse.js + applescript.js + computer-use.js | ⬜ |
| P3.5 | 聽說能力 | WebSocket ✅ + TTS ✅ + STT ❌（Claude Code /voice 覆蓋） | ✅ |
| P3.6 | 安全整合 | Guard 精鍊 + E2E 驗證 + health-check 擴展 | ✅ |

> 詳細計劃見 `docs/roadmap.md` Phase 3 章節。

## Phase 4 規劃狀態（開始中）

> Phase 3 完成 → Phase 4 開始（2026-03-05）

Phase 4 目標：Level 3 自我進化能力 + 第一個垂直切片（交易）。
架構：Evolution Engine（gap detection + auto-fix + feedback loop）+ 垂直切片示範。

| 階段 | 名稱 | 內容 | 狀態 |
|:----:|------|------|:----:|
| P4.1 | Gap Detection | gap-analyzer.js + evolution.js analyze CLI + 52 個測試 | ✅ |
| P4.2 | Auto-Fix | gap-fixer.js + evolution.js fix CLI + 修復策略 + 50 個測試 | ✅ |
| P4.3-5 | 垂直切片 + 泛化 | skill/agent 自主建構 + Acid Test + 做減法能力 | ⬜ |

> 詳細計劃見 `docs/roadmap.md` Phase 4 章節。

## 已知問題

- F2 Model Grader 需真實執行環境驗證（grader:score 事件）

## 文件索引

| 文件 | 路徑 | 說明 |
|------|------|------|
| 願景 | docs/vision.md | 五層同心圓架構、核心信念、設計原則、成熟度模型 |
| 路線圖 | docs/roadmap.md | Phase 計劃、S 系列技術路線、失真防護、歷史 |
| 主規格 | docs/spec/overtone.md | 設計索引 |
| 架構 | docs/spec/overtone-架構.md | 三層架構、Hook |
| 工作流 | docs/spec/overtone-工作流.md | 18 個 workflow 模板 |
| Agents | docs/spec/overtone-agents.md | 18 個 agent（含 grader + claude-developer） |
| 並行 | docs/spec/overtone-並行.md | Loop、Mul-Agent、D1-D4 |
| 子系統 | docs/spec/overtone-子系統.md | Specs、Dashboard |
| 驗證品質 | docs/spec/overtone-驗證品質.md | 三信號、pass@k |
| 決策點 | docs/spec/overtone-decision-points.md | 控制流決策點索引（User Gate / 自動決策 / Stage 轉場 / 狀態圖） |
