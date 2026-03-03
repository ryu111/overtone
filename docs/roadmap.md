# Overtone Roadmap

> 最後更新：2026-03-03 | 當前 Phase：核心穩固（Level 1 → Level 2，P4 完成）

## Phase 總覽

> 願景和架構定義見 `docs/vision.md`

| Phase | 名稱 | 目標 | 狀態 |
|:-----:|------|------|:----:|
| 0 | 地基穩固 | 核心 pipeline 穩定運作 | ✅ 完成 |
| 1 | 首次體驗 | 新使用者 5 分鐘上手 | ✅ 完成 |
| 2 | 核心穩固 | Level 1 完成 + Level 2 持續學習 | 🔵 進行中 |
| 3 | 感知操控 | Layer 2 基礎能力 | ⚪ 未開始 |
| 4 | 自我進化 | Level 3 + 第一個垂直切片（交易） | ⚪ 未開始 |

---

## Phase 2：核心穩固（進行中）

### Level 1 完成項

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| 外部專案驗證 | 3 個不同類型專案各 5 個任務 | ⬜ |
| Skill 化重構 | hook 核心邏輯抽出為獨立模組 | ⬜ |

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
| 跨 session 長期記憶 | Instinct → 真正的長期學習系統 | ⬜ |
| 數值評分引擎 | 通用多維度評估（取代 pass/fail 二元判斷） | ⬜ |
| 即時回饋迴路引擎 | 接收外部信號並調整行為 | ⬜ |
| 時間序列學習 | Pattern 效果隨時間的變化 | ⬜ |
| 自動識別卡點 | 重複失敗模式辨識 + 改進 | ⬜ |
| 學習衰減 | 過時知識自動淡化 | ⬜ |
| 效能基線追蹤 | 量化「系統有沒有在進步」 | ⬜ |

**完成標準**：系統能展示「第 10 次做同類任務比第 1 次更快更好」的量化數據。

---

## Phase 3：感知操控（Layer 2 基礎）

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| 瀏覽器自主操控 | 已有 Chrome MCP 基礎，強化為自主操作 | ⬜ |
| API 精準呼叫 | 通用 HTTP/WebSocket client | ⬜ |
| 視覺理解 | 螢幕截圖 → 結構化數據 | ⬜ |
| 操控精準度守衛 | 確保動作正確的守衛模組 | ⬜ |

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
| S9 | 保留項目 | Worktree isolation、prompt/agent hook、1M context | ⏳ |
| S10 | Agent Memory | 5 個 opus agent 啟用 memory: local（v0.23） | ✅ |
| S11 | CLAUDE.md 精簡 | SoT 引用取代重複（198→121 行）+ argument-hint | ✅ |
| S12 | 音效通知 | sound.js + Notification hook（v0.24） | ✅ |
| S13 | Status Line | 雙行即時顯示 + ANSI 變色警告（v0.25） | ✅ |
| S14 | Strategic Compact | SubagentStop 自動建議壓縮（v0.26） | ✅ |
| S15 | CBP 最佳實踐對齊 | /ot:commit + code-reviewer 四維度 | ⚪ |
| S15b | 組件正規化 | 38 skills → 16 skills + 27 commands（v0.27.3-0.27.8） | ✅ |
| S16 | Agent Prompt 強化 | description frontmatter + `<example>` 路由範例 | ⚪ |
| S17 | 測試覆蓋率分析 | Bun 覆蓋率工具鏈成熟度驗證 | ⏳ |
| S18 | CI 環境感知 | isCI() + PR Auto-Review/Security Scan yaml | ⚪ |
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
