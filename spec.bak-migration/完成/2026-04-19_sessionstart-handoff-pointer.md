---
status: draft
owner: nova
created: 2026-04-19
topic: SessionStart 注入 handoff pointer 可行性分析
related: scripts/self-compact.js, hooks/modules/context-injector.js, CLAUDE.md §自壓縮
---

# SessionStart 注入 handoff pointer 可行性分析

## 問題

使用者觀察（2026-04-19）：self-compact 完成後，新 session AI 靠 continuation prompt + 自行 Read `/tmp/nova-handoff-*.md` 接手。SessionStart hook 明明會觸發，那時注入 handoff 是否更好？

## 量測數據

| 項目 | bytes |
|---|---|
| SessionStart 當前注入總和（7 段 inject-functions） | 2380 |
| handoff 最大（nova-control） | 2679 |
| handoff 最小（nova-server） | 451 |
| handoff nova-brain 當前 | 1403 |
| `additionalContext` CAP（cf54782 防衛網） | 5000 |

**結論**：完整 handoff 注入 → **nova-control 案 5.1KB 剛好爆 cap**；多數 session（2.85-3.8KB）舒適。

## 現況架構不對稱

| Mode | handoff 檔 | pointer 檔 | SessionStart 注入 | UserPromptSubmit 注入 |
|---|---|---|---|---|
| compact（舊） | ✓ 寫 | ✓ `compact-recovery-*.md` ~130B | ✗ | ✓ pointer 讀+unlink |
| clear（2026-04-19 起預設） | ✓ 寫 | ✗ **不寫 pointer** | ✗ | ✗ |

clear mode 完全依賴 self-compact.js 送 continuation prompt：
```
[Session 接續 handoff-new] context 已清空，handoff 已寫入 /tmp/nova-handoff-X.md。
請先讀取 handoff 確認工作狀態再繼續。
```
若 AI 漏讀或 continuation prompt 被吃掉，沒有第二道防線。

## 三方案比較

### A. 現況（保持不動）
- 優：零改動，continuation prompt 明確
- 缺：clear mode 單點故障；AI 多一次 Read tool call（~2KB）

### B. SessionStart 注入 handoff pointer（推薦）
- 做法：`detectHandoffPointer(input)` 讀 handoff 前 5 行 + 完整路徑，約 400B
- 優：冗餘安全網（continuation 漏掉仍有 SessionStart 副本）；不爆 cap（2.4 + 0.4 = 2.8KB 舒適）；compact/clear mode 對稱
- 缺：需條件判斷 `input?.source === 'compact' || source === 'clear'`；重複小幅度資訊（前 5 行會跟 continuation prompt 重疊）

### C. SessionStart 注入完整 handoff
- 優：完全免 Read tool call
- 缺：**爆 cap 風險**（nova-control 5.1KB）；所有 session 都吃 2-3KB 即使不需要；現有 5 inject 可能被截斷

## 推薦：方案 B

理由：
1. 安全邊界最大（cap 舒適 + 冗餘防線）
2. 對稱性：compact mode 有 recovery pointer，clear mode 也該有
3. 改動面最小：`context-injector.js` SessionStart handler 加一個 `detect*` 函式

## PoC 代碼（草案）

```javascript
function detectHandoffPointer(input) {
	try {
		if (input?.source !== "compact" && input?.source !== "clear") return null;
		const project = cwdToProject(input?.cwd);
		const handoffPath = `/tmp/nova-handoff-${project}.md`;
		if (!existsSync(handoffPath)) return null;
		const content = readFileSync(handoffPath, "utf-8");
		const head5 = content.split("\n").slice(0, 5).join("\n");
		return `\n📄 handoff 檔：${handoffPath}\n前 5 行摘要：\n${head5}\n（完整內容請 Read tool 取得）\n`;
	} catch { return null; }
}
```

注入位置：`buildSessionContext` 第一位（優先級最高）或 `injectRestartNotice` 後。

## 驗證計畫

1. unit test：`tests/unit/context-injector.test.js` 加 case — source=compact/clear 時含 handoff 內容
2. 實機測試：手動觸發 `bun self-compact.js` → 觀察新 session `/tmp/nova-ctx-measure.log` 含多一段（~400B）
3. 爆 cap 守護：加測 case 模擬 nova-control handoff 3KB + SessionStart 2.4KB + pointer 0.4KB = 5.2KB 超 cap 時 pointer 是否被截斷（應保留，因注入順序調整成 pointer 優先）

## 決策權與時程

- 決策：**使用者**（涉及所有 session 啟動 context 預算微幅上升 400B）
- 若核可 → nova 實作 + architecture.test.js 鎖 pointer 存在性
- 若不核可 → 保留此檔作為未來參考

## 附帶發現：routing file 命名 bug

本輪自驅測試時遇到：`echo D2 > /tmp/nova-routing-level-.claude.txt` 被 guards.js HARD GATE 擋下，因為 `cwdToProject('/Users/sbu/.claude') = 'nova-brain'`，不是 basename(`.claude`)。應 `echo D2 > /tmp/nova-routing-level-nova-brain.txt`。

**教訓**：rules/核心/深度路由.md 寫 `echo DX > /tmp/nova-routing-level-$(basename $PWD).txt` — 對 nova session（cwd=~/.claude）會寫錯檔名。建議 rule 改為 `$(bun ~/.claude/hooks/lib/cwd-to-project.js basename)` 或明示 nova 特例。已記 reflection，下輪考慮升級 rule 或給 cwd-to-project helper CLI 入口。

## 相關

- ADR-011 7/24 Self-Driving Closure 3-Track（handoff 是 Track 1 state-handoff 的一環）
- `rules/環境/自壓縮.md` § **讀**：壓後第一動作 Read handoff — 本方案不取代規則，只加冗餘副本
- commit `cf54782`：SessionStart 5KB cap 防衛網（本方案前提）
- commit `b713c7c`：self-compact clear mode Bug B（本方案起源）
