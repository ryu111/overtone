# Overtone 現況

> 最後更新：2026-03-04 | Plugin 版本：0.28.33（P3.3 系統層完成）

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 3015 pass，0 fail，核心功能完整 + 守衛強化 11/11 + Knowledge Engine + 跨 Session 長期記憶 + 效能基線追蹤 + 數值評分引擎 + 趨勢分析 + 回饋閉環 + 卡點識別 + 時間序列學習（Level 2 完成）+ 核心穩固清理 + mul-agent 泛化 + P3.0 閉環基礎 + P3.1 感知層（screenshot.js + window.js + perception.md）+ P3.2 心跳引擎（heartbeat.js + session-spawner.js）+ P3.3 系統層（process.js + clipboard.js + system-info.js + notification.js + fswatch.js）+ 並行收斂門|
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 3015 pass / 0 fail（127 個測試檔） |
| 測試檔案 | 127 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 21（13 knowledge domain + orchestrator + pm + specs + 5 utility-with-refs） |
| Knowledge Domain 數 | 13（testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording、debugging、architecture、build-system、os-control、autonomous-control） |
| Command 數量 | 27（14 stage shortcut + 7 workflow pipeline + 6 utility） |
| Timeline Events | 26 個 |

## 近期變更（最近 3 筆）

- **[0.28.33] 2026-03-04**：P3.3 系統層完成 + 並行收斂門 — (1) 系統層 5 腳本：process.js（listProcesses/startProcess/killProcess）、clipboard.js（readClipboard/writeClipboard）、system-info.js（getCpuUsage/getMemoryInfo/getDiskInfo/getNetworkInfo）、notification.js（sendNotification）、fswatch.js（watchPath/stopWatch/listWatchers）+ 60 tests；(2) 並行收斂門：checkSameStageConvergence() 佇列去重、active-agent 延遲刪除、instanceId 適配；(3) health-check 第 8 項（checkOsTools）→ 3015 pass / 127 files
- **[0.28.32] 2026-03-04**：P3.2 心跳引擎完成 — (1) heartbeat.js（daemon start/stop/status/_daemon + PID 管理 + polling loop + SIGTERM 清理）；(2) session-spawner.js（spawn + stream-json 完成偵測 + timeout + _buildArgs）；(3) autonomous-control SKILL（第 13 個 knowledge domain）；(4) 41 + 9 tests → 2858 pass / 120 files
- **[0.28.31] 2026-03-03**：P3.1 感知層完成 — (1) screenshot.js（4 API：captureFullScreen/captureRegion/captureWindow/checkPermission）+ 22 tests；(2) window.js（5 API：listProcesses/listWindows/focusApp/getFrontApp/checkAccessibility）+ 27 tests；(3) perception.md 完整 reference → 2808 pass / 116 files

## Phase 3 規劃狀態

> Phase 2 完成 → Phase 3 規劃完成（2026-03-03 PM Discovery）

Phase 3 目標：Layer 2 完整 OS 能力，達到 Phase 4 Ready。
架構：Bun 腳本庫（`scripts/os/`）+ `os-control` knowledge domain（第 12 個）+ OS Guard。
桌面操控：AppleScript/JXA 優先 + Computer Use 兜底。

| 階段 | 名稱 | 內容 | 狀態 |
|:----:|------|------|:----:|
| P3.0 | 閉環基礎 | os-control Skill 骨架 + Agent frontmatter + pre-bash-guard + hooks.json | ✅ |
| P3.1 | 看得見 | 截圖（screenshot.js + 4 API）+ 視窗管理（window.js + 5 API）+ 視覺分析模板 | ✅ |
| P3.2 | 心跳引擎 | Heartbeat daemon（start/stop/status）+ session-spawner.js + autonomous-control Skill | ✅ |
| P3.3 | 管得住 | Process + 剪貼簿 + 系統資訊 + 通知 + 檔案監控 | ✅ |
| P3.4 | 聽說能力 | WebSocket + TTS + STT | ⬜ |
| P3.5 | 安全整合 | Guard 精鍊 + E2E 驗證 + health-check 擴展 | ⬜ |

> 詳細計劃見 `docs/roadmap.md` Phase 3 章節。

## 已知問題

- F2 Model Grader 需真實執行環境驗證（grader:score 事件）

## 文件索引

| 文件 | 路徑 | 說明 |
|------|------|------|
| 願景 | docs/vision.md | 四層同心圓架構、核心信念、設計原則、成熟度模型 |
| 路線圖 | docs/roadmap.md | Phase 計劃、S 系列技術路線、失真防護、歷史 |
| 主規格 | docs/spec/overtone.md | 設計索引 |
| 架構 | docs/spec/overtone-架構.md | 三層架構、Hook |
| 工作流 | docs/spec/overtone-工作流.md | 18 個 workflow 模板 |
| Agents | docs/spec/overtone-agents.md | 17 個 agent（含 grader） |
| 並行 | docs/spec/overtone-並行.md | Loop、Mul-Agent、D1-D4 |
| 子系統 | docs/spec/overtone-子系統.md | Specs、Dashboard |
| 驗證品質 | docs/spec/overtone-驗證品質.md | 三信號、pass@k |
