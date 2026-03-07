# Overtone 現況

> 最後更新：2026-03-08 | Plugin 版本：0.28.89 | Build：4748 pass
> **使命**：推進 `~/.claude/` 達到 Layer 1-4（通用自主代理核心）。願景詳見 `docs/vision.md`。

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 4748 pass，0 fail。核心能力：BDD 工作流自動化（18 個 agent + 18 個模板）+ 守衛強化（11 個 hook + 25 項 health-check）+ 自我進化引擎（gap detection / auto-fix / skill forge / internalization）+ OS 控制能力（截圖 + 視窗 + 系統層 + TTS 語音通知）+ 心跳引擎（跨 session 任務自主執行）+ 深度 PM 多輪訪談（領域研究 + 5 面向訪談）+ DEV 並行任務拆分 + CAS 壓力測試 + compact 品質偵測 + postdev 並行群組|
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 18（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 4748 pass / 0 fail（200 個測試檔）|
| 測試檔案 | 200 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 26（15 knowledge domain + thinking + orchestrator + pm + specs + 4 utility-with-refs + instinct + skill-judge） |
| scripts/lib 模組 | 68（含 analyzers/ 7 + knowledge/ 9 + remote/ 4 + dashboard/ 2 子目錄模組 + tts 相關 2） |
| Knowledge Domain 數 | 15（testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording、debugging、architecture、build-system、os-control、autonomous-control、craft、claude-dev） |
| Command 數量 | 29（14 stage shortcut + 7 workflow pipeline + 8 utility） |
| Telegram 命令 | 6（/start、/status、/stop、/run、/sessions、/help） |
| Timeline Events | 32 個（14 分類） |

## 近期變更（最近 3 筆）

- **[0.28.89] 2026-03-08**：infra(pm-multi-project-isolation)——PM 多專案隔離修復：paths.js 新增 resolveProjectRoot() 統一 7 個 handler 的 projectRoot fallback、per-project session ID 隔離（`~/.overtone/global/{projectHash}/.current-session-id`）、pre-task-handler.js pluginRoot 改用全域路徑 + 8 個靜默 catch 改為 hookError，全域規則新增錯誤零容忍 + 禁止靜默失敗，E2E 測試佇列隔離 + @sequential 補全，4748 pass / 0 fail
- **[0.28.88] 2026-03-08**：fix(queue+config+guards)——三項 bug 修復：execution-queue.js completeCurrent pending fallback 解決 statusline 佇列卡住，config-api.js updateAgent/updateSkill 拒絕未知欄位，health-check.js 過濾 test_ 開頭 session 消除假陽性 orphan 警告
- **[0.28.87] 2026-03-08**：feat(skills)——Skill 生態系升級（25 → 26 個 Skill）：新增 thinking Skill + 7 個 reference 檔案，security-kb/code-review/testing/claude-dev 四個 SKILL.md 內容擴展，developer/architect/code-reviewer/tester/planner 五個 agent 加入 thinking skill 呼叫

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
