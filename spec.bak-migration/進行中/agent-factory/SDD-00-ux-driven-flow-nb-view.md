# SDD-00 UX-Driven Flow — nb 視角貢獻

> **Status**: nb view contribution (Round 5, xd-tozj)
> **Main owner**: nc (menu_bar UI 專家)
> **nb 貢獻範圍**: rule / hook / harness 層對應 UX
> **Final consolidation**: nc 主寫完整版 SDD-00，本檔供 nc 吸收

## 逆推原則

「使用者看到什麼 → 背後 rule/hook 怎麼守」。從 nb scope 列關鍵 UX moment + 背後守護機制對應。

## 1. 使用者情境（nb scope）

### 1.1 使用者觸發 Edit canonical 檔案

**Screen**: Claude Code terminal
**Before nb hook**: 使用者 edit `~/.claude/config/event-types/dispatch.json` 無感
**After staging-classifier-guard**:
```
⛔ Staging Classifier Block
路徑 ~/.claude/config/event-types/dispatch.json 屬 Contract-only
請 commit message 加 "stage: 🔵 peer_accept: <xd-id>"
或 escape: NOVA_STAGING_OVERRIDE=1（需使用者明示）
詳見 SDD-01 §6
```

**UX acceptance criteria**:
- 紅燈 block 訊息在同一 Edit tool 結果顯示，不需額外查 log
- systemMessage 直接含修復路徑（教使用者怎麼補 stage 標記）
- 豁免 env var 名稱可 copy-paste 直接生效

### 1.2 使用者看 spec 切割 dispatch 被 block

**Screen**: Bash 發 `curl /complete` 送 summary 只含 M1
**Background hook**: `spec-milestone-guard.js`（已實作 xd-gbgv）
**Critical moment**:
```
⛔ Spec 切割防護 (rules/品質/完成與閉環.md)
summary 只提 M1 未含其他 milestone, 且無量化拆分理由
若完整交付請 summary 列 M1+M2+M3
若真需拆分請加「量化理由：>1500 行 / 多 session / LLM >2h」
若使用者/Manager 明示授權請含「使用者明示」或「Manager 明示」
```

**UX acceptance criteria**:
- block 訊息點明三條出路（完整交付 / 量化理由 / 明示授權），不是單純 no
- 錯誤訊息含 rule path（可直接 read 查詳情）

### 1.3 SessionStart 看 core_objective reminder

**Screen**: 新 session 啟動 SessionStart hook 注入
**Critical moment**:
```
💡 CLAUDE.md 缺 core_objective 宣告（rules/協作/討論式派發.md）
建議補入 one-liner + 3-5 條 non_negotiables，供跨 session 討論式派發用
```

**UX acceptance criteria**:
- 💡 SUGGEST 級不 block，僅提醒
- 出現在 SessionStart additional context 開頭，使用者一進就看到
- 若已有 core_objective 完全不打擾

### 1.4 使用者看 reviewer-enforcer Stop block

**Screen**: Stop hook 觸發後顯示
**Pain point（已修）**: v0.5 期 cross-session SSE echo 誤記 Manager 為驗收責任方 → permanent block
**After xd-xfzn + xd-qfhe fix**:
- `cross_session_observation` 自動標 reviewed=true
- `missing_discussion_file` 豁免 cross-session dispatch
- Manager session Stop 不再被其他 project 的 dispatch block

**UX acceptance criteria**:
- 非本 session 責任的 dispatch 不該在 Stop 冒出紅字
- 真正需要 reviewer 時 block 訊息含 `spawn reviewer agent` 具體指令

### 1.5 使用者觸發 AskUserQuestion 選擇

**Screen**: CLI 原生 AskUserQuestion 選項 UI + NC 即時通知
**Chain**（已實作）: AskUserQuestion → PermissionRequest hook → Bun.spawnSync curl → NC SSE → 使用者手機/menu_bar 看到

**UX acceptance criteria**:
- CLI 選項正常渲染（不被 hook 干擾）
- NC 通知延遲 ≤ 500ms
- 使用者從任一裝置（CLI 或 NC）回答，其他裝置同步看到

## 2. 從 UX 逆推出的 nb hook 設計原則

### 2.1 Block 訊息三件套

每個 nb hook block 訊息必含：
1. **違反條款引用**（rule path + 章節）
2. **三條出路**（修復 / 量化豁免 / 明示授權）
3. **可 copy-paste 的具體 fix**（命令 / commit message template / env var）

### 2.2 Notify vs Block 分級

| UX 信號 | 對應 hook decision | 何時用 |
|---|---|---|
| 💡 SUGGEST | `{decision: "allow", systemMessage}` | reminder（core_objective 缺） |
| ⚠️ WARN | `{decision: "allow", systemMessage}` + 可 commit | 非阻斷提示（dedup 警告） |
| ⛔ BLOCK | `{decision: "block", systemMessage}` | Contract-only / spec 切割 |
| 🚫 CRITICAL | `{decision: "block"}` + audit log | global element write 非授權 |

### 2.3 豁免可觀測

所有 block 必有 env var 豁免 + debug log 記 override：
- `NOVA_<HOOK_NAME>_OVERRIDE=1` → 放行但 log
- SSE broadcast override event 給 Manager（accountability）

## 3. nc SDD-00 整合建議

建議 nc 整合 SDD-00 時：
- 本檔 §1 五情境可直接吸收進 "nb-layer UX flows" 章
- 本檔 §2 三原則可升級為全域 Block message standard
- 不需複製全文，grep-reference 即可（`nb SDD-00 contribution §1.x`）

---

*本檔非正式 SDD-00，是 nb 向 nc 提交的 scope input。nc 主寫正式版。*

---

## 4. Vertical Slicing 驗證（xd-gw4z 要求）

5 情境 × nb 層 check（SDD-01 rule/hook + SDD-03 protocol 是否支撐）：

| # | 情境 | rule 支撐 | hook 實作 | protocol 支撐 | Gap / follow-up |
|:-:|---|---|---|---|---|
| 1 | Edit canonical block | SDD-01 §6 三層 ✓ | `staging-classifier-guard.js` (設計 ready, SDD-01 §12 milestone 待實作) | 無需 event emit | **Gap**: hook 尚未實作，SDD-01 通過後立即啟動 |
| 2 | Spec 切割 block | `rules/品質/完成與閉環.md` ✓ | `spec-milestone-guard.js` ✓ 已落地 claude 17c3d9a | 無需 | 無 gap |
| 3 | SessionStart core_objective reminder | `rules/協作/討論式派發.md` ✓ | `core-objective-reminder.js` ✓ 已落地 claude 17c3d9a | 無需 | 無 gap |
| 4 | reviewer-enforcer cross-session 豁免 | `rules/協作/討論式派發持久化.md` ✓ | `reviewer-enforcer.js` ✓ 已擴 xd-qfhe fix | 無需 | 無 gap |
| 5 | AskUserQuestion → NC SSE chain | `rules/元件/AskUserQuestion全鏈路.md` ✓ | `hook-client.js` PermissionRequest ✓ | **ns SSE `/events` broadcast + NC subscribe schema** | **Gap**: 需 ns 在 SDD-02 §6.2 擴 ask_question / ask_answer event type（當前只有 hook.* + session.* + dispatch.*），或復用既有 `/api/ask` 路徑 |

### Vertical slice 閉環狀態

- **閉環**: 情境 2/3/4（rule + hook + no protocol 需求）— 3/5
- **半閉環**: 情境 1（rule ✓ / hook 設計 ready 待實作）— 1/5
- **跨層 gap**: 情境 5（nb 已備 rule + hook, 需 ns event schema 擴充或 endpoint 確認）— 1/5

### nb 向 ns 的 follow-up 要求（情境 5）

請 ns 確認：`/api/ask` endpoint 當前是否已足以支援 NC subscribe？若否：
- Option A: 新增 `ask.requested` / `ask.answered` event types 到 `nova-server/config/event-types/session.json`（🔵 Contract-only, producer+consumer 同步 commit）
- Option B: 沿用現有 `/api/ask` POST + SSE channel（既有路徑）→ 情境 5 protocol gap close

### nb 向 nc 的 follow-up 要求（情境 1）

情境 1 UI 體驗 nc 若要做 menu_bar 通知「某 session 被 staging guard block」，需 hook.blocked event type 含 `hook_name: "staging-classifier-guard"` payload（已在 canonical 白名單 schema 支援）。nc 若要顯示，考慮 SDD-05 derived view 加 `/api/alerts/unresolved?type=staging` filter。
