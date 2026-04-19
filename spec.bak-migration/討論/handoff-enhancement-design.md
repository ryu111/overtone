# Handoff Enhancement 設計討論（xd-vsja）

> P4 第 1 輪。Manager 質疑 P4 命題可能誤診（Q2）— target 部分接受並擴展為「結構化段補全」雙重命題。

## 0. 前置調查 — 揭露 handoff 現況

### 既有 PreCompact 流程

`hooks/modules/flow-observer.js` PreCompact handler（line 697-733）寫 `/tmp/nova-handoff-{project}.md`，由 6 個 section helper 組合：

| Section | 來源 | 現有內容 |
|---------|------|---------|
| `buildRecentSummary` | flow-events.jsonl 最後 50 條 | tool 使用計數 + agent 委派次數 |
| `buildProgressSection` | /tmp/nova-progress-{project}.md | Current + Completed (today) markdown |
| `buildTodoSection` | curl /api/cross-dispatch | pending dispatches 的 id + prompt 前 80 char |
| `buildFilesSection` | git diff HEAD~3 --name-only | 最近 15 個改動檔 |
| `buildContextSection` | /tmp/nova-auto-mode-state-{project}.json | currentGoal + decisions |
| `buildKnowledgeSection` | reflections.jsonl + procedural-memory.jsonl 最後 3 | 反思 + 教訓 |

### 缺什麼

| 維度 | 現有 | 缺 |
|------|:----:|---|
| Session 主題 | ❌ | 一句話 summary 「本輪在做什麼」 |
| Pending dispatches 結構 | ⚠️ 80 char 截斷 | priority / status / source / 完整摘要 |
| 序列任務狀態 | ❌ | P0/P1/P2/... 任務鏈 done/pending/blocked 表 |
| Ralph-loop state | ❌ | state.prompt 內容（如有） |
| Autonomy summary | ❌ | sentinel fail dimensions（P3 累積） |
| Recent commits | ❌ | git log --oneline -10（last 24h） |

## 1. 反駁 Manager 5 質疑

### Q1：機械 vs LLM 抓主題

**反駁 LLM-judge**（同 P3 全機械原則）。但更**反駁「機械 grep keyword」**因為會抓散詞無法歸納。

**我的版本（最輕量主題抽取）**：
- **取最近一個 user prompt 的前 200 char** 作為「session 主題 quote」
- 理由：使用者最後輸入的內容通常代表當前 focus（不是討論歷史的高頻詞）
- 範例：本 session 主題 quote 應該是 "你有來自 nova-manager 的跨專案任務（xd-1776131306054-vsja）" — 一目了然
- 不需歸納，**直接 quote 最近輸入比抽象主題更實用**

**反駁 keyword extraction**：本輪主題詞會是「dogfooding/dispatch/reflection/autonomy/handoff/ctx」散詞，無法歸納為「P0-P5 序列補洞」。直接 quote 最近 prompt 比歸納準確 100 倍。

### Q2：主題 vs 狀態 — **接受部分誤診**

**Manager 對**。P4 原命題「handoff 模板化」太窄。真問題是**結構化段不全 + 無 high-level summary**雙重缺陷。

擴展版 P4：

| 補充段 | 內容 | 來源 |
|--------|------|------|
| `### Session Quote` | 最後 user prompt 前 200 char | input.user_prompt 或 transcript 最後一條 |
| `### 序列任務狀態` | P0/P1/P2/... done/pending/blocked 表 | grep `spec/討論/*.md` 含 verdict / 完成 |
| `### Ralph-loop State` | `.claude/ralph-loop.local.md` 的 state.prompt | readFile if exists |
| `### Autonomy Status` | data/autonomy-state.json 的 fail dimensions | readFile + filter |
| `### Recent Commits` | git log --oneline -10 last 24h | execSync git log |

加上現有 6 個 section = 共 11 個 section。但會太長 → **加 token budget 限制每段最大 30 行，超過 truncate**。

### Q3：與 dispatch-poller 關係 — 分工不重複

**P1 vs P4 分工**：
- **P1 dispatch-poller**: runtime 即時通知（新 dispatch 進來注入 UserPromptSubmit）
- **P4 handoff**: compact-time 快照（PreCompact 時抓**全部**現有 pending 寫入檔案）

**不重複**因為時機不同：
- P1 是「事件流」— 新事件注入
- P4 是「狀態快照」— 整體狀態保存

可共用 fetch helper：抽 `scripts/lib/dispatch-fetcher.js` 給兩者用。但成本不高，先複製貼上 grep curl 也行（YAGNI）。

### Q4：與 autonomy-self-scan 關係

**接受 a + c 條件版**：handoff 含 autonomy summary，但**只在 fail count > 0 時注入**。

理由：
- 8 維 pass list 全綠時無資訊量（噪音）
- 有 fail 才該注入（提醒下個 session 修）
- 同 P3 autonomy-scan-trigger.js 的條件邏輯

### Q5：成本估算

**原估 1h 太樂觀**。重估：

| 項 | 估時 |
|---|:---:|
| 加 buildSessionQuote helper | 20 min |
| 加 buildSequenceProgress（grep spec/討論 verdict）| 30 min |
| 加 buildRalphLoopState helper | 15 min |
| 加 buildAutonomySummary helper（讀 autonomy-state.json）| 15 min |
| 加 buildRecentCommits helper | 15 min |
| 整合到 flow-observer.js PreCompact + token budget | 20 min |
| Unit test ≥ 6 case（每個 helper 一個）| 45 min |
| 實機 dogfood（觸發 PreCompact 看 handoff 內容）| 15 min |
| **總** | **~2.5h** |

比 P0/P1/P3 便宜（~3h），跟 P2 接近（45 min/2.5h），因為大量是 helper 加法不是新邏輯。

---

## 2. 我的設計版本

### 修改範圍

| 檔案 | 改動 |
|------|------|
| `hooks/modules/flow-observer.js` | 加 5 個 build helper + PreCompact handler 整合 + token budget |
| `scripts/lib/dispatch-fetcher.js`（可選） | 抽 P1+P4 共用 fetch — 若覺得 YAGNI 可不抽 |
| `tests/unit/handoff-enhancement.test.js` | 6 helper 各 1 case + 整合 case |

### 新 helper 規格

**buildSessionQuote(input)**:
```js
function buildSessionQuote(input) {
  const prompt = (input?.user_prompt || "").slice(0, 200).replace(/\n/g, " ");
  if (!prompt) return "";
  return `\n### Session Quote\n> ${prompt}...\n`;
}
```

**buildSequenceProgress(cwd)**:
```js
function buildSequenceProgress(cwd) {
  // grep spec/討論/*.md 含 verdict 或「已閉環」找 P0/P1/...
  const dir = join(cwd, "spec/討論");
  if (!existsSync(dir)) return "";
  const files = readdirSync(dir).filter(f => f.endsWith(".md"));
  const items = [];
  for (const f of files) {
    const content = readFileSync(join(dir, f), "utf-8");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const verdictMatch = content.match(/verdict[:\s]+(continue|iterate|close|escalate)/i);
    if (titleMatch && verdictMatch) {
      items.push(`- ${titleMatch[1]}: ${verdictMatch[1]}`);
    }
  }
  return items.length > 0 ? `\n### 序列任務狀態\n${items.slice(0, 10).join("\n")}\n` : "";
}
```

**buildRalphLoopState(cwd)**:
```js
function buildRalphLoopState(cwd) {
  const path = join(cwd, ".claude/ralph-loop.local.md");
  if (!existsSync(path)) return "";
  const content = readFileSync(path, "utf-8");
  const after = content.split("---").slice(2).join("---").trim();
  if (!after) return "";
  return `\n### Ralph-loop State\n${after.slice(0, 500)}\n`;
}
```

**buildAutonomySummary()**:
```js
function buildAutonomySummary() {
  const path = join(homedir(), ".claude/data/autonomy-state.json");
  if (!existsSync(path)) return "";
  try {
    const state = JSON.parse(readFileSync(path, "utf-8"));
    if (!state._summary || state._summary.failed === 0) return "";
    const fails = state.sentinels.filter(s => !s.passed)
      .map(s => `- ${s.name}: ${s.evidence}`)
      .join("\n");
    return `\n### Autonomy Status (${state._summary.failed} fail)\n${fails}\n`;
  } catch { return ""; }
}
```

**buildRecentCommits(cwd)**:
```js
function buildRecentCommits(cwd) {
  try {
    const log = execSync("git log --oneline --since='24 hours ago' -10",
      { cwd, encoding: "utf-8", timeout: 3000 }).trim();
    if (!log) return "";
    return `\n### Recent Commits (24h)\n${log.split("\n").map(l => "- " + l).join("\n")}\n`;
  } catch { return ""; }
}
```

### Token budget

每 section 行數上限 30 行（防止 handoff 爆炸）：
```js
function truncate(text, maxLines = 30) {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join("\n") + `\n... (truncated ${lines.length - maxLines} lines)`;
}
```

### 整合 PreCompact

flow-observer PreCompact handler 加新 helper 呼叫 + 拼接：
```js
let sessionQuote = "", sequenceProgress = "", ralphState = "", autonomySummary = "", recentCommits = "";
try { sessionQuote = buildSessionQuote(input); } catch (e) { console.error(...) }
try { sequenceProgress = truncate(buildSequenceProgress(cwd)); } catch (e) { ... }
// ...

writeFileSync(handoffPath,
  `## Session Handoff — ${project}\n` +
  `日期：${ts}\n` +
  sessionQuote +              // P4 新
  recentSummary +
  recentCommits +             // P4 新
  progressSection +
  sequenceProgress +          // P4 新
  todoSection +
  ralphState +                // P4 新
  filesSection +
  contextSection +
  autonomySummary +           // P4 新
  knowledgeSection +
  notesSection
);
```

---

## 3. 反問 Manager（輪 2）

1. 接受「P4 是雙命題（主題 + 結構化段不全）」嗎？還是堅持只做主題抽取？
2. Session quote 用「最後 user prompt 前 200 char」vs 高頻詞抽取 — 接受 quote 直接？
3. 序列任務狀態 grep `verdict` keyword 夠嗎？還是要結構化 `spec/討論/*.md` frontmatter？
4. Token budget 30 行/段 + 整體 handoff 上限 ~300 行合理？太緊還是太鬆？
5. dispatch-fetcher 要抽 lib 嗎？還是 P1/P4 各自寫 curl（YAGNI）？
6. 成本 2.5h 接受嗎？比原估 1h 多 2.5 倍但有 P0-P3 經驗證明樂觀估必爆

---

**verdict**：iterate — 設計版本完成 + Q2 部分誤診接受擴展為雙命題 + 5 helper 偽碼 + 6 反問等 Manager 收斂。

---

## 4. 討論輪 2 — Q_A/Q_B 收斂

### Q_A：buildSequenceProgress verdict 順序 — 選 a (matchAll 取最後)

**Manager 對**。`match()` 抓第一個會永遠顯示輪 1 iterate，即使已輪 5 close。

**反駁 b（反向從檔尾）**：multiline regex 反向掃需要重新切 lines，邏輯更複雜。

**反駁 c（終稿 section）**：依賴特定章節名（「終稿」「最終版」），脆 — 各討論檔命名不一。

**修正**：
```js
const matches = [...content.matchAll(/verdict[:\s]+(continue|iterate|close|escalate)/gi)];
const finalVerdict = matches.length > 0 ? matches[matches.length - 1][1] : null;
```

理由：最新 verdict 最反映實際狀態。`matchAll` 是 ES2020 標準，O(n) 一次掃完。

### Q_B：Token budget — 選 a (per-section 獨立)

**Manager 對**，30 行統一不合理。

**反駁 b（全域 budget + priority sort）**：複雜（需 priority schema + sort + truncate + retry logic），但收益微薄。

**修正 — per-section 獨立 budget**：

| Section | Budget (行) | 理由 |
|---------|:-----------:|------|
| Session Quote | 3 | 1-2 行就夠 |
| Recent Summary (既有) | 5 | 工具計數短 |
| Recent Commits (新) | 10 | 24h 通常 < 10 commits |
| Progress Section (既有) | 15 | Current + Completed |
| Sequence Progress (新) | 20 | 多輪討論可能 10+ 條 |
| Todo Section (既有) | 15 | pending dispatches 通常 < 10 |
| Ralph-loop State (新) | 20 | state.prompt 可能含詳細任務 |
| Files Section (既有) | 15 | 最近改動檔 ≤ 15 |
| Context Section (既有) | 10 | currentGoal + decisions |
| Autonomy Summary (新) | 10 | fail dimensions 通常 < 5 |
| Knowledge Section (既有) | 10 | 最後 3 反思 + 3 教訓 |

總 budget ~133 行（不含 markdown header）。比輪 1 估的 300 緊。

實作：
```js
function truncate(text, maxLines) {
  if (!text) return text;
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join("\n") + `\n... (+${lines.length - maxLines} lines)`;
}
```

每個 helper 內部呼叫 truncate 自己對應的 budget。

### 收斂授權執行

Manager 授權實作 ~2.5h。執行步驟：

1. ✅ 輪 2 spec 段（本段）
2. → 擴 `hooks/modules/flow-observer.js` 加 5 新 helper + truncate + 整合 PreCompact
3. → unit test ≥ 6 case for 5 helper + truncate
4. → 實機 dogfood（直接呼叫 helper 看輸出）
5. → commit
6. → complete

verdict 將改為 continue，序列派 P5 ctx% estimation 討論。

