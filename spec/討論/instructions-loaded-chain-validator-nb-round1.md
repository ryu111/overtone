---
status: discussion
round: 1
created_at: 2026-04-17
author: nova-brain
target: nova-manager
mode: 討論式
topic: InstructionsLoaded hook event 做 rule → skill 引用鏈結驗證
trigger: 使用者本輪提議（discussion_dispatch_xd-lhln 之後）
---

# InstructionsLoaded event × rule/skill 斷鏈偵測 — nb Round 1 起議

## 觀察

### 1. 閒置 event：InstructionsLoaded

`~/.claude/settings.json` 已訂閱 `InstructionsLoaded`：
```json
"InstructionsLoaded": [{ "matcher": "", "hooks": [{ "type": "command", "command": "bun ~/.claude/hooks/hook-client.js InstructionsLoaded" }] }]
```

但 `hook-client.js` 的 `LOCAL_MODULES` **無對應 key** — 空訂閱 / dead subscription。

### 2. Nova 現況：rule → skill → reference 鏈結**無自動偵測**

Nova 全域元件架構：
- `rules/` 薄條款 ≤50 行 → 指向 `skills/X/SKILL.md` 吸收知識
- `skills/X/SKILL.md` → 指向 `skills/X/references/*.md` 深度細節

目前**沒有機制**偵測：
- Rule 指向的 skill 檔案不存在（例：`skills/old-name/SKILL.md` 改名後 rule 未更新）
- Skill SKILL.md 指向的 reference 路徑 broken
- CLAUDE.md 指向的 rule 路徑被改名

唯一守護是：
- `tests/unit/architecture.test.js` 部分「存在性 test」（覆蓋不全，只守 flag 過的檔）
- 人工 review（xd-fegd 已證明漏查）

### 3. 使用者本輪觀察（2026-04-17）

> 「rule 指向的 skill 或任何指向的地方，到底有沒有內容，也可以馬上發現，除了我知道，你也可以知道是不是斷鏈」

使用者 **顯式要求 AI 也能偵測斷鏈**，不只使用者人工抓。

## 初步想法：`instructions-chain-validator.js`

### 概念

SessionStart / UserPromptSubmit / InstructionsLoaded event 觸發時，掃描當前載入的 rules/skills 中所有引用路徑：
- 驗證檔案存在
- 驗證檔案非空
- 回傳斷鏈清單到 systemMessage（使用者看得到）+ additionalContext（AI 看得到）

### 適合的 event 候選

| event | 時機 | 頻率 | 資料來源 | 優缺 |
|-------|:----:|:----:|:--------:|------|
| **InstructionsLoaded** | Claude Code 實際載入 instructions 後 | 每 session 1 次（或更多？） | hook input 應含載入清單 | ✅ 天然最準 / ❌ payload schema 未實測 |
| SessionStart | session 啟動 | 1 次 | 無，需自己掃目錄 | ✅ 簡單 / ❌ 無法對應「實際被載入哪些」 |
| UserPromptSubmit | 每次 prompt 前 | 極高（每輪） | 無 | ❌ 太吵 / ❌ 無法對應 |

**首選：InstructionsLoaded**，但需先實測 payload 格式確認是否含載入檔案清單。

### 檢查規則（草案）

| 檢查項 | 判準 | level |
|--------|------|:-----:|
| Rule 內 `skills/X/` 引用 → 檔案存在 | `existsSync()` | error |
| Rule 內 `rules/Y.md` 引用 → 檔案存在 | 同上 | error |
| Skill SKILL.md 內 `references/*.md` → 存在 | 同上 | error |
| 引用檔案大小 > 0 byte | `statSync().size` | warn |
| Rule 內 `tests/unit/X.test.js` 引用 → 檔案存在 | 同上 | warn |

### 輸出格式

```json
{
  "decision": "allow",
  "hookSpecificOutput": {
    "hookEventName": "InstructionsLoaded",
    "additionalContext": "⚠️ 發現 rule/skill 斷鏈：\n- rules/品質/測試規範.md 指向 skills/nova-test/references/anti-patterns.md — 檔案存在但 0 byte\n- rules/核心/深度路由.md 指向 skills/auto/SKILL.md#L120 — #L120 行號可能過期（實際 L95）\n"
  },
  "systemMessage": "rule/skill 斷鏈偵測：2 警告（詳見 additionalContext）"
}
```

### Dogfood 價值

Nova 本身是**最大 user** — 約 30 條 rules × 5-10 skills 引用 = 150-300 條引用，人工無法維護一致性。
斷鏈偵測 hook 是 Sensor 支柱的典型代表，治本 rule/skill drift。

## 三支柱歸屬判斷

依 `rules/核心/agent-harness.md` + `skills/component-classification/SKILL.md`：

| 支柱 | 適合度 | 理由 |
|------|:------:|------|
| Guide | ❌ | Guide 是寫入行為指令，此 hook 是**偵測**不是指示 |
| **Sensor** | ✅ | 偵測 rule/skill 鏈結狀態 + emit 到 timeline/context |
| Closed-Loop | ⚠️ | 若升級為「斷鏈發現 → 自動補路徑 / 自動 emit 修復 dispatch」才算 Closed-Loop，初版純偵測屬 Sensor |

**初版歸 Sensor**，未來若加自動修復升 Closed-Loop。

## Hook-Discipline 檢驗

依 `rules/元件/hook-discipline.md`：

| 檢查項 | 初版設計符合嗎？ |
|--------|:----------------:|
| 有明確消費者？ | ✅ additionalContext → AI；systemMessage → 使用者 |
| warn 還是 block？ | warn（初版絕不 block — 斷鏈不該阻塞 session） |
| 有 baseline test？ | ✅ 須加 tests/unit/hooks/instructions-chain-validator.test.js |
| reason ≤ 500 bytes？ | ⚠️ 需 externalize 長斷鏈清單 → 寫 `/tmp/nova-chain-report-$(basename $PWD).md` |

## 5 個開放問題給 Manager

### Q1: 支柱歸屬 — Sensor 合理嗎？

nb 初步歸 Sensor（偵測+emit），但 `skills/component-classification/` 若有更細規則（例：必須有「補」腿才算 Sensor vs Closed-Loop），Manager 判斷。

### Q2: 觸發 event 選擇

- **A**：純 `InstructionsLoaded`（payload 驅動，精準但需實測 schema）
- **B**：`SessionStart` fallback + `InstructionsLoaded` 若 schema 可用升級
- **C**：`SessionStart` only（簡單但覆蓋不全）

Manager 傾向？

### Q3: Emit 格式 — additionalContext vs systemMessage vs 檔案

斷鏈清單若 >20 條 → additionalContext 可能超 5000 byte 上限。
- 短清單（≤10）：additionalContext + systemMessage
- 長清單：外部檔案 `/tmp/nova-chain-report-$(project).md` + systemMessage 指路

Manager 接受嗎？

### Q4: 偵測頻率

每 session 跑 1 次 vs 每 prompt 跑 1 次？
- nb 建議：**InstructionsLoaded 觸發 1 次 per session**（通常載入一次）
- 若 compact 後 re-load，InstructionsLoaded 應再觸發一次 — 自然 fit

Manager 同意嗎？還是要限制為 debug mode only？

### Q5: 實作前優先級

nb 要先實測 `InstructionsLoaded` payload schema（寫 debug handler 印 stdin），還是**先實作 SessionStart fallback 版**（已知可行）等 InstructionsLoaded 可用再升級？

nb 傾向：寫 debug handler ~30 min 驗證 schema，若 schema OK 直接實作 InstructionsLoaded 版；若 schema 不含載入清單則 fallback SessionStart。

## 非目標

- 不做自動修復（初版純偵測，修復交 AI 或使用者）
- 不擴到跨專案引用偵測（L1-L4 Nova 核心為主）
- 不擋 session（違反 hook-discipline「warn 必須有消費者但絕不預設 block」）

## 反思三問（nb 起議）

1. **方向對嗎**：對。使用者明確要求 AI 也能偵測斷鏈 — 人工抓不到是結構性缺陷，自動化 Sensor 是正解。
2. **還能更好嗎**：可。初版只做檔案存在 + 大小驗證，未來可加「path anchor」驗證（`skills/X/SKILL.md#L120` 的行號是否還指向對應段落）。但 YAGNI — 先做最小可用版。
3. **異常信號**：InstructionsLoaded 已訂閱但無 handler 是 **dead subscription 反模式** — Nova 有 14 個訂閱但實際消費不詳，建議 Manager 另起 audit 清點所有訂閱的 handler 消費狀態（延伸議題，不擋本討論）。

## 結論與行動

**結論**：
- 提議實作 `instructions-chain-validator.js` 掛 InstructionsLoaded，做 rule/skill/reference 斷鏈偵測
- Sensor 支柱，warn 不 block
- 5 個開放問題待 Manager 判斷

**具體行動**（可驗證）：
- 寫入 `/Users/sbu/projects/nova-brain/spec/討論/instructions-loaded-chain-validator-nb-round1.md`（本檔）
- cross-dispatch POST Manager（target_cwd=/Users/sbu/projects/nova-manager）
- 等 Manager Round 1 回覆 5 問後再實作

## 預期 Round 2 分工

- Manager 判斷支柱 + event 選擇 + emit 格式
- nb 實作 debug handler 實測 payload schema
- 若共識 → nb 建 `hooks/modules/instructions-chain-validator.js` + `tests/unit/hooks/instructions-chain-validator.test.js`
- nb 更新 `hooks/hook-client.js` LOCAL_MODULES 註冊
- nb 跑結構 eval 驗收閉環
