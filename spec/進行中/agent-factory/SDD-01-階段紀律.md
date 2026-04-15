# SDD-01 階段紀律 (Staging Discipline)

> **Status**: Draft (Round 4 initial canonical)
> **Owner (draft)**: nb（全域元件守門人）
> **Peer reviewers**: ns / nc / nm
> **Source rounds**: xd-u7jo R1 / xd-r3it R2 / xd-yitw R3 / xd-rv3l R4
> **Final location (on approval)**: `~/.claude/rules/協作/階段紀律.md`（rule） + 本檔作為 SDD 存檔

## 1. 動機

v0.5 event log 期間三方（nb/ns/nc）各踩紀律 bug：
- nb 把 🔵 Contract-only（canonical §7 擴充）誤當 🟢 Additive 搶先 commit
- ns writer 無 consumer 時被 nb/nc 誤稱 🟡 Parallel（實為 🟢 Additive 無 diff compare 對象）
- nc v0.5 Docs 含 decision 本應升 🟢 Additive 卻當 ⚪ Docs-only 處理

這些 bug 共根因：**缺乏統一六類階段分類 + 驗收門檻 + 回滾策略**。本 SDD 將 Manager 原三類擴為六類並形式化。

## 2. 六類判準（Truth Table）

| 類 | emoji | 定義 | 判準 | 驗收門檻 | 回滾策略 |
|---|:---:|---|---|---|---|
| Additive | 🟢 | 新增元件不取代不改接口 | 新檔案 / 新 LOCAL_MODULES entry / 新 skill，既有路徑 diff = 0 | 結構（schema / architecture test） | `git revert` + 移除接線 |
| Parallel | 🟡 | 新舊並存 + shadow mode + diff compare | 有 consumer 能比對新舊輸出 + `shadow-diff-*.jsonl` 持續寫入 | 結構 + 行為（shadow ≥ N 天 + diff rate < 1% 或 LLM-judge 評分新 ≥ 舊） | 關 shadow env flag `NOVA_<GAP>_SHADOW=0` |
| Swap | 🔴 | 新版驗證 ≥ 舊版 + N 天 0 regression 後切 default，舊版 legacy/ 保留至 M+2 | Parallel 累積達標 + 使用者明示 + 三方 peer accept | 結構 + 行為 + 效能（p50/p95/p99 不退步 + memory RSS ≤ 舊 1.5x + 0 regression test fail） | 三層：kill-switch env var + git revert + reverse migration script |
| Experiment | 🟣 | 純探索不進 production path | 產物住 `spec/實驗/` / feature branch / feature flag default off | 無紀律（觀察期結束必須 promote 或砍，不可永久 off） | 直接刪 |
| Contract-only | 🔵 | 只改 schema / canonical 契約 producer 端 | 路徑符合 canonical 白名單（見 §5） | producer + consumer 同步 commit OR spec `status: draft` 兩階段 promote | `git revert` 雙邊同步 |
| Docs-only | ⚪ | 純文件不動 runtime 也不改契約 | `spec/討論/*.md` / `docs/*.md` / CLAUDE.md 非 blueprint 部分 | 無 | `git revert`（trivial） |

**例外升級**：⚪ Docs-only 若含 decision（blueprint / rule / non_negotiable 變更）自動升 🟢 Additive（需 architecture test 鎖定）。

## 3. Shadow 二義（Round 3 澄清）

**「shadow」有兩義必須區分**：
- (a) **資料層並存** — 新實作寫 side-channel 檔案/store，舊實作照舊運作，**無比對邏輯**
- (b) **有 diff compare** — consumer 讀雙源輸出並寫 `shadow-diff-*.jsonl`，人工/LLM review diff 分類

**嚴格 🟡 Parallel 必須達 (b)。僅達 (a) = 🟢 Additive（無 compare 對象 = 無 parallel）**。

例：v0.5 event log writer 寫 `agent-events.jsonl` 但無 reviewer/UI consumer 讀 → 當下 🟢 Additive，非 🟡 Parallel。等 reviewer 接入讀 event log 對比 git log 後才升 🟡。

## 4. §8 Gap A/B/C 生命週期分類

| Gap | 當前狀態 | 下階段 | 終態 | 依賴 |
|---|---|---|---|---|
| **Gap A — L3 孵化器** | 容器 🟢 Additive / 內容物（孵化出的 L4 agent）無 | 容器已就位 → 內容物 🟣 Experiment → 🟡 Parallel → 🔴 Swap | 內容物 🔴（L4 進全域池取代手動 dispatch） | **硬依賴 Gap B stable**（vision §8.1 明示 + Gap B 提供 tools_denied 違規追蹤） |
| **Gap B — Event log** | 🟢 Additive（writer 運行但無 consumer 故無 shadow compare） | 🟡 Parallel（reviewer 接讀 / nc UI derived view / recovery 任一完成） | 🔴 Swap（handoff 廢止） | 無依賴（地基） |
| **Gap C — Memstore** | 🟢 Additive（若新增 memstore layer 不改既有 md） | 🟡 Parallel（雙寫 md + memstore，14d diff = 0 sample ≥ 1000） | 🔴 Swap（memstore 取代 md，需 reverse migration + 使用者授權） | **獨立可並行**（memstore vs event log 正交） |

## 5. Canonical 白名單（Contract-only 範圍）

寫入 `~/.claude/config/staging-canonical.json`，受本身守（自引用）：

```json
{
  "canonical_paths": [
    "~/.claude/config/event-types/*.json",
    "~/.claude/config/hook-block-reason-codes.json",
    "~/.claude/config/staging-canonical.json",
    "~/.claude/docs/protocols/*.md"
  ],
  "excluded": [
    "~/.claude/rules/*.md",
    "~/.claude/CLAUDE.md",
    "spec/討論/*.md",
    "docs/*.md"
  ]
}
```

**為何排除 rules/**：rule 獨立治理（季度 Manager review，非 runtime contract）。
**為何排除 CLAUDE.md**：描述文非 runtime 載入（blueprint yaml 段是例外，未來可獨立白名單）。

### 5.1 🟣 Experiment 階段 side-effect 邊界（nc Round 4 補強）

🟣 Experiment 階段的孵化器 spawn 行為**視為 canonical write**，需走 §6 三層落地守護。禁寫範圍（sandbox）：

- ⛔ `~/.claude/`（全域元件池）
- ⛔ nova-core repos（nova-brain / nova-server / nova-control / nova-manager）
- ⛔ 全域 memory store（`memory/` / 未來 memstore_*）

允許寫範圍：
- ✅ `spec/實驗/` / feature branch workspace
- ✅ 孵化器自身 workspace（隔離 scratch area）
- ✅ L5 專案目錄（孵化產物的 target）

**孵化器 spawn 後的 L4 agent**（內容物 🟣）其 tools_denied 必須包含上述禁寫範圍，由 `hooks/modules/incubation-guardrail.js`（S7 產出）enforce。

## 6. Contract-only 三層落地（Round 3 擴寫）

**第 1 層 — PreToolUse:Edit/Write `staging-classifier-guard.js`**
偵測 target path ∈ canonical_paths 且 diff 非空，檢查 session 是否有 `stage: 🔵` + `peer_accept: <id>` 或 escape env，缺則 block。

**第 2 層 — pre-commit hook**
`.git/hooks/pre-commit` → `bun ~/.claude/hooks/scripts/staging-precommit.js`：掃 staged diff 對 canonical_paths，若改動則要求 commit message 含 stage 標記。

**第 3 層 — reviewer-enforcer 抽樣**
reviewer agent 驗收時若 complete summary 的 `files_changed` 含 canonical path 但無 stage 標記 / peer_accept → findings 補.

## 7. N 天分層（ns R2 採納）

| 範圍 | Shadow N 天 | M+2 刪除 |
|---|:---:|:---:|
| infra (`core/*.js` / `services/*.js`) | ≥ 7 | ✅ |
| protocol schema (event types / cross-dispatch spec) | ≥ 14 | ✅ |
| critical hook (guards / reviewer-enforcer / owner-commit) | ≥ 30 | ✅ |
| memstore 雙寫 | ≥ 14 + sample ≥ 1000 diff=0 | ✅ |

## 8. Gap 升級判準（ns R3 採納）

**🟡 → 🔴 Swap 五件套**（缺一不可）：
1. Shadow ≥ N 天（按 §7 分層）
2. diff = 0 sample ≥ 1000
3. Reverse migration script dry-run pass
4. 三方 peer accept
5. 使用者明示授權

## 9. Commit message 必標 stage + peer dispatch 決策同步

### 9.1 Commit message stage 標記

每個 commit 的 message 需含 `stage: 🟢/🟡/🔴/🟣/🔵/⚪`（單標籤或多標籤 e.g. `stage: 🟢+🔵`），便於事後 git log 軌跡。

### 9.2 Peer dispatch 決策同步（nc Round 4 補）

📋 MUST peer dispatch prompt 內含決策（accept / reject / 立場修正 / enum 擴充）時，**必同步 append 至自身 spec 檔案**（通常是 `spec/討論/<topic>.md` Round N 段），否則他方匯整時會漏取此決策源，造成單方擴充誤判。

派生來源：nc xd-mmbv 6-enum accept 寫於 peer prompt 未同步 spec → ns R3 匯整誤判 → xd-x9gt moderator 補洞事件。

## 10. 與 v0.5 踩坑映射（Round 2 nc 提出 + ns R2 採納）

| v0.5 事件 | 當時誤分類 | 正確分類 | 本 SDD 守護條款 |
|---|---|---|---|
| nb 搶先 commit §7 canonical | 🟢 Additive | 🔵 Contract-only | §6 三層落地 + §9 stage 標記 |
| ns writer 無 consumer 被誤稱 🟡 | 🟡 Parallel | 🟢 Additive（shadow 二義 (a)） | §3 嚴格區分 |
| nc v0.5 Docs 含 decision | ⚪ Docs-only | 🟢 Additive（升級例外） | §2 例外條款 |

### 10.5 非分類錯的紀律 bug（nc Round 4 補）

除了分類誤判，v0.5 還踩兩個**流程紀律**bug，本 SDD 以 cross-reference 形式記錄：

| 事件 | 根因 | 對應守護 rule / 條款 |
|---|---|---|
| Manager xd-qfhe 直接通知 nc close 繞過 ns/nb peer visibility → xd-pl01 撤銷 | hub-and-spoke 裁決 bypass peer 可見性 | 由 `rules/協作/peer-discussion-visibility.md` 守護。本 SDD 不重複規則只 cross-reference |
| nc xd-mmbv 6-enum accept 寫 peer dispatch prompt 但未 append 自身 spec → ns R3 匯整誤判單方擴充 → xd-x9gt moderator 補洞 | peer dispatch 內含決策但未同步 persist 到自身 spec | §9 新增條款：**peer dispatch prompt 內含決策（accept / reject / 立場修正）時必同步 append 至自身 spec 檔案**，否則他方匯整時會漏取 |

## 11. 未決議題

- **§2 `N 天` 具體天數** — §7 已分層但 critical hook ≥ 30d 是否太長/太短，待三方投票
- **§6 第 1 層 hook 是否涵蓋 Bash 寫（sed/tee）** — 全局 hooks 對 Bash 寫檔守護待 Round 5 決
- **§9 multi-tag 是否限制最多 2 tag** — 避免「🟢+🟡+🔵」混淆語意

## 12. 實作里程碑（SDD 通過後）

1. 寫入 `~/.claude/config/staging-canonical.json`
2. 寫 `hooks/modules/staging-classifier-guard.js` + LOCAL_MODULES 接線
3. 寫 `.git/hooks/pre-commit` + `hooks/scripts/staging-precommit.js`
4. reviewer-enforcer 加 staging 抽樣邏輯
5. BDD-01 unit test 鎖定
6. `rules/協作/階段紀律.md` 落地（≤ 50 行 rule + 指向本 SDD）
