---
spec: statusline-redesign
status: 規劃中
owner: nova (cwd=~/.claude)
created: 2026-04-19
trigger: 使用者糾正本 iter 多次「治本而非補強」+「了解 statusline 實際作法」+「換方法舊的要刪」
priority: high
estimated_effort: spec ~30min（本 commit 已交）/ phase 2 重寫 ~4-6h（下 session）
related_commits: [1eb1f9e (Stop hook fix), 239a10b (emoji stopgap)]
related_specs: [ralph-loop-activation-fix.md]
---

# Statusline Redesign — 治本重寫方案

## 為什麼治本（vs 繼續 patch）

本 iter 對 statusline 做的 4 個 patch（commit 88b9c1c / 239a10b 等）暴露**結構缺陷**：

| 缺陷 | 證據 | 治本方向 |
|:--|:--|:--|
| emoji 散落無 SoT | 10 個 indicator 各自 if/grep/cat 散落 268 行 | indicator array of objects + 統一 emit |
| 「自驅」概念分裂 | line 70 ⚡（service heartbeat）+ line 244 ⚡（session ralph）同 emoji 不同條件源 | emoji 語意 SoT 表，⚡ = session 自驅 only，service 健康用顏色不用 emoji |
| 資料源 IPC 不一致 | 4 種混雜：/tmp/ 檔 + .claude/ PWD 相對 + curl + input JSON | indicator config 明示來源類型 + reader function pattern |
| PWD-based session 識別 | line 70 `*nova-manager*` 等限定 | 統一走 `cwdToProject(cwd)` SoT（hooks/lib/cwd-to-project.js） |
| bash 不能 import 共用 lib | statusline 與 hooks 跨類型 lib 重複實作 | bash → JS 重寫，import hooks/lib/cwd-to-project.js 等 |

## Phase 2 重寫方案（statusline.sh → statusline.js）

### 設計原則

1. **Indicator 統一 schema** — array of objects，每個 indicator 一個 config 物件
2. **Emoji 語意 SoT** — 一張表定義 emoji 對應概念，禁止散落
3. **Reader function pattern** — 4 種資料源各有 reader（ipc-file / pwd-relative / curl / input-json），新增 indicator 不需手寫 fs/spawn
4. **共用 lib import** — 走 hooks/lib/cwd-to-project.js / hooks/lib/local-model.js 等
5. **fail-open** — 任何 indicator 失敗只 swallow（log stderr）不影響其他
6. **3 秒快取** — 既有設計保留，但統一在 cache layer

### Indicator schema (草案)

```typescript
interface Indicator {
  name: string;           // 'context-pct' / 'ralph-loop' / 'pivot' ...
  source: 'ipc-file' | 'pwd-relative' | 'curl' | 'input-json';
  read: (ctx) => string | null;  // null = 不顯
  format: (val) => string;       // emoji + color + value
  position: 'nova-prefix' | 'after-model' | 'third-col' | 'second-line-suffix';
}
```

### Emoji 語意 SoT (草案)

| emoji | 概念 | 觸發 | 位置 |
|:---:|:--|:--|:--|
| ⚡ | session-level 自驅授權 | ralph-loop.local.md `active: true` | second-line suffix（含 N/100 counter） |
| ⚠️ | pivot-mandatory 警告 | /tmp/nova-pivot-mandatory-${proj}.txt | second-line suffix |
| 📝 | 單次任務模式（不顯 emoji 留白即可） | active=false | banner only（statusline 不顯） |
| ✗ | service unhealthy | nova-server health DOWN | nova prefix RED |
| (色) | service healthy | nova-server health UP | nova prefix GREEN（無 emoji） |

⛔ 廢用：🔁（被 ⚡ 取代，stopgap commit 239a10b）；nova prefix ⚡（service-level autonomy 視覺重複，棄用）

### 資料源 reader pattern (草案)

```js
const readers = {
  'ipc-file': (path) => safeRead(path),
  'pwd-relative': (path) => safeRead(join(process.cwd(), path)),
  'curl': async (url) => safeFetch(url, { timeout: 1000 }),
  'input-json': (jsonpath, input) => jp.value(input, jsonpath),
};
```

### 改動範圍

| 檔案 | 動作 |
|:--|:--|
| `statusline.sh` | **刪除** |
| `statusline.js` | 新建（~150 行 JS，indicator array 配置 + reader/format/emit）|
| `~/.claude/settings.json` | `statusLine.command` 改 `bun ~/.claude/statusline.js` |
| `tests/unit/architecture.test.js` | 加 statusline indicator schema 守護 + emoji SoT 表存在性 + 9 個 indicator 完整性 |
| `obsidian/semantic/external-references/statusline-multi-driver-icons-2026.md` | 加 nova-redesign 章節記錄治本決策 |
| `rules/環境/ralph-loop.md` | 條款引 statusline.js（路徑更新）|

### Migration / Rollback

- pre-redesign git tag: `pre-statusline-redesign-2026-04-19`
- 雙鍵相容期：保留 statusline.sh 為 fallback（settings.json 改回 .sh 即可 rollback）
- 跨 session：所有 session 共用 ~/.claude/statusline.js，無需各自 sync

## 風險與緩解

| 風險 | 緩解 |
|:----|:----|
| Claude Code statusline 是否支援 `bun` runtime command | 實機驗證 (應該 OK，已有 `bun ~/.claude/scripts/...` 案例) |
| JS 啟動 cold start 慢於 bash（每 prompt 跑一次）| Bun 啟動 ~50ms 可接受，cache layer 仍 3 秒快取 |
| 跨 session emoji 不對齊（部分 session 還在用舊 statusline.sh）| 全 session 共用 ~/.claude/statusline.js，自動跟 |
| 重寫期間 statusline 暫時不可用 | 雙鍵相容期 + git tag rollback 點 |

## 驗收條件（Phase 2 重寫）

- ✅ statusline.js 跑 < 100ms（與 statusline.sh 接近）
- ✅ 9 個 indicator 全顯示對齊（model/effort/pct/limits/nova/llm/routing/domain/delegate/ralph/pivot）
- ✅ ⚡ 只在 active=true session 顯（單一 SoT，不重複）
- ✅ nm/nb/nc 三 session 實機驗 statusline 一致
- ✅ nb arch test 580 pass + 新加 statusline schema 守護 pass
- ✅ rollback 演練：settings.json 改回 .sh 即可恢復舊版

## Phase 2 啟動時機

待 user 審 spec 後拍板（建議下 session 排，本 session ctx 已高 + 多次糾正後該收束）。

## Sources

- 本 iter 使用者糾正 (2026-04-19): "了解 stateline 實際作法用治本做法不是補強"+"換方法舊的要刪"+"閃電 emoji 比較好看"+"nc 是自驅但 statusline 沒看到"
- statusline.sh 268 行盤點 (本 iter)
- commit 1eb1f9e (Stop hook active 治本斷鏈)
- commit 239a10b (emoji ⚡ stopgap)
- spec/進行中/ralph-loop-activation-fix.md
- obsidian/semantic/external-references/statusline-multi-driver-icons-2026.md (業界 Warp/Copilot 對照)
- obsidian/semantic/external-references/stopgap-fix-visibility-2026.md (stopgap → 治本紀律)
