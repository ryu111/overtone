# L2-L3 實作任務

> 5 個 R-level 模組的統一任務管理。Phase 劃分基於模組間依賴關係。

## 依賴關係圖

```
Phase 1（並行）: R2.2 Skill Lifecycle + R3.1 心跳引擎（無依賴）
Phase 2（並行）: R3.3 OS 腳本 + R3.4 操控層（R3.4 keyboard/mouse/applescript 獨立，computer-use 依賴 R3.3 screenshot）
Phase 3（串行）: R2.6 Acid Test（依賴 R2.2 Skill Lifecycle 完成）
```

---

## Phase 1：核心引擎（並行）

### T1: R2.2 Skill Lifecycle — D3

> 自我進化核心。Learner 觀察 → Forge → Judge → Deploy。

| # | 任務 | 檔案 | 行數 | 依賴 | 狀態 |
|---|------|------|:----:|------|:----:|
| T1.1 | Skill Forge 引擎 | `~/.claude/scripts/skill-forge.js` | ~200 | 無 | ✅ |
| T1.2 | Lifecycle Orchestrator | `~/.claude/scripts/lifecycle-orchestrator.js` | ~120 | T1.1 | ✅ |
| T1.3 | Maintainer 整合 | `~/.claude/scripts/maintainer.js`（修改） | +10 | T1.2 | ✅ |
| T1.4 | 單元測試 | `~/projects/overtone/tests/unit/skill-lifecycle.test.js` | ~200 | T1.2 | ✅ |

**執行方式**：T1.1 → T1.2 → T1.3 + T1.4（並行）
**深度**：D3（planner → executor → reviewer）
**測試策略**：
- forgeSkill 建立正確 SKILL.md 結構（frontmatter + 內容）
- Judge 品質閘門（B 級通過 / C 級修正 / 3 輪 draft）
- deploySkill 修改 agent skills[]
- 本地模型不可用 graceful degradation
- checkLifecycle 端到端

### T2: R3.1 心跳引擎 — D3

> 跨 session 自主執行。Notion 輪詢 → spawn session → 完成任務。

| # | 任務 | 檔案 | 行數 | 依賴 | 狀態 |
|---|------|------|:----:|------|:----:|
| T2.1 | Session Spawner | `~/.claude/scripts/session-spawner.js` | ~120 | 無 | ✅ |
| T2.2 | Heartbeat Daemon | `~/.claude/scripts/heartbeat.js` | ~280 | T2.1 | ✅ |
| T2.3 | 單元測試 | `~/projects/overtone/tests/unit/heartbeat.test.js` + `session-spawner.test.js` | ~300 | T2.2 | ✅ |

**執行方式**：T2.1 → T2.2 → T2.3
**深度**：D3（planner → executor → reviewer）
**測試策略**：
- spawnSession mock 模式（不真的呼叫 `claude -p`）
- stream-json 解析（success / error / timeout / crash）
- OVERTONE_SPAWNED 遞迴防護
- 敏感 env 過濾
- daemon start/stop/status CLI
- poll 邏輯（idle / execute / paused）
- 連續失敗 3 次暫停
- stale lockfile 清理

---

## Phase 2：OS 能力（並行，Phase 1 完成後開始）

### T3: R3.3 OS 腳本 — D4

> 6 個 OS 腳本全部並行。統一模式：平台守衛 + DI + 不 throw。

| # | 任務 | 檔案 | 行數 | 依賴 | 狀態 |
|---|------|------|:----:|------|:----:|
| T3.1 | screenshot.js | `~/.claude/scripts/os/screenshot.js` | ~100 | 無 | ✅ |
| T3.2 | window.js | `~/.claude/scripts/os/window.js` | ~120 | 無 | ✅ |
| T3.3 | process.js | `~/.claude/scripts/os/process.js` | ~90 | 無 | ✅ |
| T3.4 | clipboard.js | `~/.claude/scripts/os/clipboard.js` | ~40 | 無 | ✅ |
| T3.5 | system-info.js | `~/.claude/scripts/os/system-info.js` | ~130 | 無 | ✅ |
| T3.6 | tts.js | `~/.claude/scripts/os/tts.js` | ~60 | 無 | ✅ |
| T3.7 | 測試（6 個） | `~/projects/overtone/tests/unit/os-*.test.js` | ~400 | T3.1-T3.6 | ✅ |

**執行方式**：T3.1-T3.6 全部並行 → T3.7（6 個測試也並行）
**深度**：D4（planner → 多 executor 並行 → reviewer）
**測試策略**：每個腳本一個測試檔案
- `_deps` 注入 mock execSync
- 平台守衛（非 darwin → UNSUPPORTED_PLATFORM）
- 輸出解析（正常 + 異常格式）
- 安全邊界（killProcess PID 驗證）
- 權限檢查（checkPermission / checkAccessibility）

### T4: R3.4 操控層 — D4

> 4 個操控腳本。keyboard/mouse/applescript 並行，computer-use 依賴 screenshot。

| # | 任務 | 檔案 | 行數 | 依賴 | 狀態 |
|---|------|------|:----:|------|:----:|
| T4.1 | keyboard.js | `~/.claude/scripts/os/keyboard.js` | ~80 | 無 | ✅ |
| T4.2 | mouse.js | `~/.claude/scripts/os/mouse.js` | ~100 | 無 | ✅ |
| T4.3 | applescript.js | `~/.claude/scripts/os/applescript.js` | ~70 | 無 | ✅ |
| T4.4 | computer-use.js | `~/.claude/scripts/os/computer-use.js` | ~150 | T3.1 (screenshot) | ✅ |
| T4.5 | 測試（4 個） | `~/projects/overtone/tests/unit/control-*.test.js` | ~300 | T4.1-T4.4 | ✅ |

**執行方式**：T4.1-T4.3 並行 → T4.4 → T4.5（4 個測試並行）
**深度**：D4（planner → 多 executor 並行 → reviewer）
**測試策略**：
- keyboard：osascript 指令格式 + 特殊字元轉義
- mouse：cliclick 指令格式 + 負座標拒絕 + DEPENDENCY_MISSING
- applescript：stdin 傳遞 + 語法錯誤 + timeout
- computer-use：迴圈邏輯 + maxRounds + 第一輪截圖失敗

---

## Phase 3：端到端驗收（串行，Phase 1 完成後開始）

### T5: R2.6 Acid Test — D2

> L2 完成標準驗收。可重複執行的端到端測試。

| # | 任務 | 檔案 | 行數 | 依賴 | 狀態 |
|---|------|------|:----:|------|:----:|
| T5.1 | Acid Test 腳本 | `~/.claude/scripts/acid-test.js` | ~180 | T1（Skill Lifecycle） | ✅ |
| T5.2 | 單元測試 | `~/projects/overtone/tests/unit/acid-test.test.js` | ~100 | T5.1 | ✅ |

**執行方式**：T5.1 → T5.2
**深度**：D2（planner → executor）
**測試策略**：
- mock 模式下 6 phase 全通過
- 清理後無殘留產物
- 降級模式（本地模型不可用）

---

## 總覽

| Phase | 任務群 | 模組 | 深度 | 檔案數 | 估計行數 | 並行性 |
|:-----:|--------|------|:----:|:-----:|:-------:|:------:|
| 1 | T1 + T2 | Skill Lifecycle + 心跳引擎 | D3 | 5+3 | ~930 | T1 和 T2 並行 |
| 2 | T3 + T4 | OS 腳本 + 操控層 | D4 | 6+4 | ~1340 | T3 全並行 / T4.1-4.3 並行 |
| 3 | T5 | Acid Test | D2 | 2 | ~280 | 串行 |
| **合計** | | | | **20** | **~2550** | |

## 執行時序圖

```
         T1.1 → T1.2 → T1.3
Phase 1  ─────────────────────┐
         T2.1 → T2.2 → T2.3  │
                              ├──── Phase 3: T5.1 → T5.2
         T3.1 ┐              │
         T3.2 │              │
         T3.3 ├→ T3.7        │
Phase 2  T3.4 │   (並行)     │
         T3.5 │              │
         T3.6 ┘              │
         T4.1 ┐              │
         T4.2 ├→ T4.4 → T4.5│
         T4.3 ┘              │
         ─────────────────────┘
```

## 風險總表

| 風險 | 影響模組 | 機率 | 影響 | 緩解 |
|------|---------|:----:|:----:|------|
| 本地模型不可用 | T1, T5 | 中 | 中 | graceful degradation — 只做確定性部分 |
| `claude -p` 行為變更 | T2 | 中 | 高 | session-spawner 抽象化隔離 |
| macOS 權限未授予 | T3, T4 | 高 | 中 | 前置 checkPermission / checkAccessibility |
| cliclick 未安裝 | T4 | 高 | 中 | checkCliclick() + 安裝指引 |
| Notion API rate limit | T2 | 低 | 中 | 60s poll interval + 指數退避 |
| agent skills[] 格式解析錯誤 | T1 | 低 | 高 | YAML parser + 追加而非替換 |
