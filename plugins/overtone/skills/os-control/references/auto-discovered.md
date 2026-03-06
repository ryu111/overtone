---
## 2026-03-05 | developer:DEV Findings
- 三個 domain 各新增 15 個關鍵詞，均超過 BDD 要求的 10 個下限
- os-control：涵蓋 process/clipboard/screenshot/window/notification/applescript 等系統操控概念及中文詞（截圖、視窗、剪貼簿、通知）
- autonomous-control：涵蓋 heartbeat/daemon/spawn/queue/execution-queue/scheduled 等自主控制概念及中文詞（自主、常駐、佇列、排程）
- craft：涵蓋 principle/invariant/guard/closed-loop/health-check/validate 等製作規範概念及中文詞（製作規範、閉環、守衛、自癒、不變量、品質）
- 測試計數斷言同步更新：`DOMAIN_KEYWORDS 有 12 個 domain` → `DOMAIN_KEYWORDS 有 15 個 domain`
- 模組 JSDoc 中的 `12/15` 說明更新為 `15`，移除「留待後續迭代」備注
Keywords: domain, control, process, clipboard, screenshot, window, notification, applescript, autonomous, heartbeat
---
## 2026-03-06 | architect:ARCH Context
TTS Voice System 採三層模組架構：OS 封裝層（tts.js）、模板層（tts-templates.js）、策略層（tts-strategy.js），再整合至三個 Hook 觸發點。全面對齊現有 OS 腳本慣例（notification.js、screenshot.js 的 `_deps` 注入 + `{ ok, error, message }` 回傳）。
Keywords: voice, system, templates, strategy, hook, notification, screenshot, error, message
---
## 2026-03-06 | product-manager:PM Findings
**目標用戶**：個人 dogfooding（Product Owner 即使用者），驗證通用自主代理核心的可行性。

**現狀診斷**：

| 維度 | 狀態 | 證據等級 |
|------|------|----------|
| 系統健康度 | 極佳（0 error, 0 warning, 1 info） | codebase 佐證 |
| 元件一致性 | 零缺口 | codebase 佐證 |
| 測試覆蓋 | 4381 pass / 194 檔案 | codebase 佐證 |
| L3 完成度 | 6/7（僅 Acid Test 未執行） | codebase 佐證 |
| L2 操控層缺口 | 鍵盤/滑鼠/AppleScript/Computer Use 未實作 | codebase 佐證 |
| 技術債 | 極低（已完成 24/25 優化項） | codebase 佐證 |

**策略建議（按優先序）**：

| # | 建議 | What | Why | RICE | 建議 Workflow |
|---|------|------|-----|------|---------------|
| 1 | **先完成 L3.6 Acid Test** | 執行 md-blog CLI 端到端場景：PM 訪談 → Skill Forge → Orchestrator → 產品完成 → 經驗內化 | L3 的完成標準就是 Acid Test。不跑這一步，L3 永遠停在「理論上完成」。這是唯一能驗證「自我進化能力真正可用」的方式。投入低（場景已設計好），回報高（驗證整個 L3 pipeline）。 | R:10 I:3 C:100% E:3 = **10.0** | standard |
| 2 | **L2.5 操控層補齊** | 實作 keyboard.js / mouse.js / applescript.js（Computer Use 延後） | L4 通用代理人的核心前提是「能直接操控電腦」。鍵盤和滑鼠是最基礎的操控能力。AppleScript/JXA 是 macOS 原生操控的首選路徑（vision.md 已明確「AppleScript/JXA 原生優先」）。不補齊就跳 L4，等於用半殘的手腳去做通用代理人。 | R:8 I:2 C:80% E:5 = **2.56** | quick |
| 3 | **L4 最小切片：單一領域通用代理人** | 選一個非開發領域（建議：個人任務自動化），讓系統從零建構出該領域的 skill/agent/workflow，驗證 L4 核心能力 | L4 的本質是「跨領域」，但不需要一次做三個領域。先在一個簡單領域驗證「收到高層目標 → 運用 L1-3 完成」的完整鏈路。個人任務自動化（排程提醒、檔案整理、資訊彙整）最貼近現有能力，風險最低。 | R:6 I:2 C:50% E:10 = **0.6** | standard |

**推薦路徑**：**1 → 2 → 3，嚴格序列**

理由（證據等級：codebase 佐證 + 業界慣例）：

1. **Acid Test 是 L3 的畢業考**。場景已設計完成（`specs/features/archive/2026-03-06_acid-test-scenario-design/proposal.md`），只差執行。不考試就宣布畢業，違反 BDD 驅動的核心哲學。而且 Acid Test 的成功會直接產出兩個新 skill（`static-site-generation` + `cli-tooling`），這些經驗會被 L3.7 內化，為後續 L4 提供「系統確實能自主建構能力」的硬證據。

2. **操控層是 L4 的硬依賴**。vision.md 明確定義 L4 = 「通用介面 + 直接操控電腦」。沒有鍵盤/滑鼠操控，L4 的「直接操控電腦」就是空話。AppleScript 三件套（keyboard + mouse + applescript engine）是 5 人天左右的投入，ROI 極高。

3. **L4 切片需要 1 和 2 的基礎**。沒有 Acid Test 驗證過的自我進化能力 + 沒有操控層 = L4 起步就會卡住。

**MVP 範圍（MoSCoW）-- 近期 2-3 周**：

- **Must**:
  - L3.6 Acid Test 執行（md-blog CLI 端到端）
  - keyboard.js 鍵盤模擬
  - mouse.js 滑鼠模擬
  - applescript.js JXA 執行引擎
- **Should**:
  - Acid Test 完成後的經驗內化驗證（L3.7 閉環）
  - os-control skill reference 更新（加入操控層知識）
- **Could**:
  - computer-use.js（截圖→理解→操作→驗證迴圈）
  - STT 語音轉文字
  - L4 最小切片的 PM 訪談（提前探索）
- **Won't**:
  - L4 完整實作（太早）
  - L5 產品開發（依賴 L4）
  - 多領域同時驗證（先專注一個）

**驗收標準（BDD）**：

- Given L3.6 Acid Test 場景已設計 When 系統收到 md-blog 高層目標 Then 自主完成 PM 訪談 → Skill Forge → Orchestrator → 產品交付，全程無需人工編寫 skill 或 agent
- Given Acid Test 完成 When 執行 `evolution.js internalize` Then 至少一個新 skill 被內化為永久能力
- Given keyboard.js 實作完成 When agent 執行鍵盤操作指令 Then 能模擬按鍵、快捷鍵、文字輸入
- Given mouse.js 實作完成 When agent
Keywords: dogfooding, product, owner, error, warning, info, codebase, pass, acid, test
---
## 2026-03-06 | developer:DEV Findings
- instinct README.md 涵蓋：系統架構流程圖（ASCII）、三個評估維度和門檻值、通用化規則、CLI 使用方式、相關模組對照表
- os-control control.md 涵蓋：L2.5 ⬜ 待開始狀態說明、預計涵蓋的四項能力（keyboard/mouse/applescript/computer-use）、當前可用的 osascript 替代方案
Keywords: instinct, readme, ascii, control, keyboard, mouse, applescript, computer, osascript
