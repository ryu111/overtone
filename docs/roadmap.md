# Overtone Roadmap

> 最後更新：2026-03-03 | 當前 Phase：Phase 2 完成（Level 2 持續學習全部完成）

## Phase 總覽

> 願景和架構定義見 `docs/vision.md`

| Phase | 名稱 | 目標 | 狀態 |
|:-----:|------|------|:----:|
| 0 | 地基穩固 | 核心 pipeline 穩定運作 | ✅ 完成 |
| 1 | 首次體驗 | 新使用者 5 分鐘上手 | ✅ 完成 |
| 2 | 核心穩固 | Level 1 完成 + Level 2 持續學習 | ✅ 完成 |
| 3 | 感知操控 | Layer 2 完整 OS 能力（5 階段：感知→操控→系統→通訊→守衛） | 📋 規劃完成 |
| 4 | 自我進化 | Level 3 + 第一個垂直切片（交易） | ⚪ 未開始 |

---

## Phase 2：核心穩固（✅ 完成）

### Level 1 完成項

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| 外部專案驗證 | 3 個不同類型專案各 5 個任務 | ❌ 取消 |
| Skill 化重構 | hook 核心邏輯抽出為獨立模組（26 個 lib 模組，P1-P3 完成） | ✅ |

### 系統強化（4-Phase）

> 基於 PM Discovery（2026-03-03）：Agent 專一化 × Skill 充實 × Hook 純化

| Phase | 名稱 | 說明 | 狀態 |
|:-----:|------|------|:----:|
| P1 | Skill 知識充實 | 新建 3 domain（debugging、architecture、build-system）+ 強化 8 既有 domain，共 11 domains + 17 新 reference 檔案 | ✅ |
| P2 | Agent 進化 | architect + retrospective 降級 opus → sonnet（v0.28.18）；S19 量化分析完成 | ✅ |
| P3 | Hook 純化 | SubagentStop 核心邏輯遷移到 agent+skill、hook 簡化為守衛（→ S20） | ✅ |
| P4 | 文件同步 | vision.md + roadmap.md + status.md + CLAUDE.md 全面對齊 | ✅ |

### Level 2：持續學習

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| 跨 session 長期記憶 | global-instinct.js（5 API + projectHash 隔離）| ✅ |
| 數值評分引擎 | score-engine.js（saveScore/queryScores/getScoreSummary 3 API）+ 趨勢分析（computeScoreTrend/formatScoreSummary）| ✅ v0.28.26 |
| 即時回饋迴路引擎 | score context 注入 pre-task + session decay on-session-end | ✅ v0.28.25-26 |
| 時間序列學習 | 觀察效果追蹤 + 品質反饋（adjustConfidenceByIds）| ✅ v0.28.28 |
| 自動識別卡點 | 重複失敗模式辨識 + 改進 | ✅ v0.28.27 |
| 學習衰減 | 過時知識自動淡化（instinct decay）| ✅ v0.28.25 |
| 效能基線追蹤 | baseline-tracker.js + execution-queue.js + 趨勢分析（computeBaselineTrend）完成 | ✅ v0.28.26 |

**完成標準**：系統能展示「第 10 次做同類任務比第 1 次更快更好」的量化數據。

---

## Phase 3：感知操控（Layer 2 完整 OS 能力）

> 目標：讓 agent 擁有完整的 OS 感知和操控能力，達到 Phase 4 Ready。
> 架構：Bun 腳本庫（`scripts/os/`）+ `os-control` knowledge domain skill（第 12 個）+ OS Guard
> 桌面操控策略：AppleScript/JXA 原生優先 + Computer Use（截圖→理解→操作→驗證）兜底
>
> **閉環交付模型**：每個 P3.x 交付 = 腳本（能力）+ Reference（知識）+ SKILL.md 索引更新 + Guard 擴充 + 測試。
> Agent 透過 frontmatter `skills: [os-control]` 宣告 → pre-task.js 自動注入知識。

### P3.0 閉環基礎（骨架層）

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| os-control SKILL.md | 建立第 12 個 knowledge domain 骨架（索引 + 各 reference 標記「待建」） | ⬜ |
| Agent frontmatter | 5 個 agent 加入 `skills: [os-control]`：developer, architect, tester, debugger, qa | ⬜ |
| pre-bash-guard.js | PreToolUse(Bash) 黑名單守衛骨架（危險命令攔截） | ⬜ |
| hooks.json | 新增 PreToolUse(Bash) matcher 指向 pre-bash-guard.js | ⬜ |
| Guard 測試 | pre-bash-guard 基礎測試（黑名單命中 deny + 正常命令 allow） | ⬜ |

### P3.1 看得見（感知層）

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| screenshot.js | 全螢幕/視窗/區域截圖（`screencapture` wrapper） | ⬜ |
| visual.js | 截圖 → Claude 多模態 → 結構化描述 pipeline | ⬜ |
| window.js | 視窗列表/聚焦/移動/調整大小（AppleScript） | ⬜ |
| Skill: perception ref | `skills/os-control/references/perception.md` | ⬜ |

### P3.2 動得了（操控層）

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| keyboard.js | 按鍵/快捷鍵/文字輸入（`osascript` System Events） | ⬜ |
| mouse.js | 點擊/雙擊/拖曳/滾動（`cliclick`） | ⬜ |
| applescript.js | AppleScript/JXA 執行引擎 | ⬜ |
| computer-use.js | 截圖→理解→操作→驗證 協調迴圈 | ⬜ |
| Skill: control ref | `skills/os-control/references/control.md` | ⬜ |

### P3.3 管得住（系統層）

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| process.js | 列出/啟動/終止 process（`ps`/`kill`/`open`） | ⬜ |
| clipboard.js | 讀/寫剪貼簿（`pbcopy`/`pbpaste`） | ⬜ |
| system-info.js | CPU/記憶體/磁碟/網路狀態 | ⬜ |
| notification.js | macOS 通知（`osascript` display notification） | ⬜ |
| fswatch.js | 檔案系統變更監控 | ⬜ |
| Skill: system ref | `skills/os-control/references/system.md` | ⬜ |

### P3.4 聽說能力（通訊層）

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| websocket.js | WebSocket client（Bun 原生 WebSocket API） | ⬜ |
| tts.js | 文字轉語音（macOS `say` command） | ⬜ |
| stt.js | 語音轉文字（macOS Dictation / Whisper） | ⬜ |
| Skill: realtime ref | `skills/os-control/references/realtime.md` | ⬜ |

### P3.5 安全整合（守衛層）

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| Guard 精鍊 | pre-bash-guard.js 黑名單完善 + 各階段累積的危險模式整合 | ⬜ |
| E2E 驗證 | 端到端測試：截圖→理解→操作→驗證 完整流程 | ⬜ |
| health-check 擴展 | 偵測 cliclick/fswatch 等外部依賴是否安裝 | ⬜ |
| Skill 完善 | os-control SKILL.md 正式版 + 所有 reference 完成度驗證 | ⬜ |

### Phase 3 完成標準（Phase 4 Ready）

> 給系統指令：「研究幣安 API，建立加密貨幣價格監控系統」
> 系統必須能自主完成：HTTP 研究 API → WebSocket 接收即時價格 → Process 啟動監控 → 截圖+視覺驗證顯示正確 → 通知價格異常 → 全程 OS Guard 保護

---

## Phase 4：自我進化 + 第一個垂直切片

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| 進化引擎 | 自主建立 skill/agent | ⬜ |
| Acid Test：自動交易 | 給「做自動交易」目標 → 核心自動建構能力 | ⬜ |
| 做減法能力 | 移除低效/未使用的能力 | ⬜ |

**完成標準**（Acid Test）：系統自主完成 Layer 3 + Layer 4 建構，無需人工編寫交易 skill 或 agent。

---

## 技術路線（S 系列）

> 與 Phase 平行推進的技術強化項目

| # | 名稱 | 說明 | 狀態 |
|---|------|------|:----:|
| S1 | 盤點遷移 + 效率優化 | disallowedTools + skills 預載 + updatedInput + SessionEnd + PostToolUseFailure（v0.20-0.21） | ✅ |
| S2 | 自動偵測機制 | health-check platform-drift 偵測 | ✅ |
| S3 | 平台差異追蹤 | platform.md adopted/evaluated/n-a 狀態 | ✅ |
| S4 | 全面能力評估 | 9 項能力 RICE 評估 | ✅ |
| S5 | Effort Level 分層 | haiku:low / sonnet:medium / opus:high | ✅ |
| S6 | Skill 動態注入 | `!command` 取代 hook 注入 | ✅ |
| S7 | TaskCompleted Hook | 品質門檻硬阻擋 | ✅ |
| S8 | Opusplan 混合模式 | Opus 規劃 + Sonnet 執行 | ✅ |
| S9a | Worktree Isolation | mul-agent 並行時獨立 worktree 避免衝突 | ⏳ 保留（衝突頻率 0，Phase 4 再評估） |
| S9b | prompt/agent hook | hook 新增 LLM 判斷類型 | ❌ 關閉（違反「Hook 做確定性守衛」設計哲學） |
| S9c | 1M Context | Sonnet 1M context window | ⏳ 保留（當前規模不需要，Phase 4 再評估） |
| S10 | Agent Memory | 5 個 opus agent 啟用 memory: local（v0.23） | ✅ |
| S11 | CLAUDE.md 精簡 | SoT 引用取代重複（198→121 行）+ argument-hint | ✅ |
| S12 | 音效通知 | sound.js + Notification hook（v0.24） | ✅ |
| S13 | Status Line | 雙行即時顯示 + ANSI 變色警告（v0.25） | ✅ |
| S14 | Strategic Compact | SubagentStop 自動建議壓縮（v0.26） | ✅ |
| S15 | CBP 最佳實踐對齊 | code-review skill 四維度 + commit-convention skill 已覆蓋 | ✅ 間接完成 |
| S15b | 組件正規化 | 38 skills → 16 skills + 27 commands（v0.27.3-0.27.8） | ✅ |
| S16 | Agent Prompt 強化 | description 已結構化，路由由 PreToolUse hook 確定性保證 | ✅ 間接完成 |
| S17 | 測試覆蓋率分析 | 驗證完成：`bun test --coverage` 可用（94% Funcs / 89% Lines） | ✅ |
| S18 | CI 環境感知 | 個人 dogfooding 無 PR 流程，workflow agent 審查已覆蓋 | ❌ 不需要 |
| S19 | Agent 專一化精鍊 | 評估 agent 拆分機會 + Model 降級空間 + skill 完善度與 model 需求的關係量化 | ✅ |
| S20 | Hook → Agent 遷移 | SubagentStop 核心邏輯（知識歸檔、docs sync）抽出為專職 agent，hook 純化為守衛 | ✅ v0.28.20 |

---

## 失真防護

### 檢測清單

| 檢查項 | 問題 | 失真信號 |
|--------|------|----------|
| 動機測試 | 因為有人需要，還是因為我可以做？ | 答不出使用場景 |
| 複雜度測試 | 會讓 SKILL.md 變長嗎？ | 超過 120 行 |
| 外部驗證 | 有非我本人要求過嗎？ | 所有功能都是自己想的 |
| 10 次測試 | 連跑 10 次成功幾次？ | 低於 80% |

### 量化上限

| 指標 | 當前值 | 上限 |
|------|--------|------|
| auto/SKILL.md 行數 | 105 行 | ≤ 120 行 |
| Workflow 模板數 | 18 個 | ≤ 20 個 |
| Agent 數量 | 17 個 | 按需增減（需佐證） |

---

## 歷史記錄

<details>
<summary>Phase 0: Foundation（地基穩固）— ✅ 完成</summary>

**目標**：核心 pipeline 穩定運作。15 次真實任務驗證，100% 完成率，0 次人工介入。

| # | Workflow | 任務 | 結果 |
|---|----------|------|:----:|
| 1 | standard | dashboard-duplicate-spawn-fix | ✅ |
| 2 | standard | instinct-observation-quality | ✅ |
| 3 | quick | specs-auto-archive-fix | ✅ |
| 4 | single | cleanup-残留 | ✅ |
| 5 | quick | jsonl-perf-optimization | ✅ |
| 6 | standard | hook-error-handling | ✅ |
| 7 | single | skill-md-cognitive-load | ✅ |
| 8 | quick | spec-docs-sync | ✅ |
| 9 | standard | precompact-hook | ✅ |
| 10 | single | timeline-count | ✅ |
| 11 | single | wording-module-extraction | ✅ |
| 12 | quick | instinct-getbyid | ✅ |
| 13 | quick | arch-doc-line-count-fix | ✅ |
| 14 | standard | readme-rewrite | ✅ |
| 15 | standard | status-skill | ✅ |

</details>

<details>
<summary>Phase 1: Onboarding（首次體驗）— ✅ 完成</summary>

**目標**：新使用者 5 分鐘內上手。

- [x] README 重寫（3 分鐘上手）
- [x] SessionStart banner 優化
- [x] plugin.json description 更新
- [x] 規格文件同步

</details>

<details>
<summary>初版 Product Brief（2026-02-28）— 已歸檔</summary>

初版 PM Discovery 產出，定位為「Claude Code 開發工具」。
2026-03-03 PM Discovery 後願景升級為「通用自主代理核心」，Brief 已歸檔至 `docs/archive/2026-02-28_product-brief.md`。

</details>
