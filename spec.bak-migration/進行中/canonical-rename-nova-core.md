---
spec: canonical-rename-nova-core
status: 規劃中
owner: nova (cwd=~/.claude)
created: 2026-04-19
trigger: 使用者 ralph-loop iter 14 收尾糾正「handoff 還用舊的 nb，不能一直用舊的 nb 吧」+ 確認方向「nb 改 nova-core 你覺得怎麼樣」
priority: normal
estimated_effort: Phase A 30-60 min / Phase B 半天 / Phase C 後續
---

# Canonical Rename: nova-brain → nova-core

## 動機

1. **命名一致性** — `nova-{角色}` 系列：nova-server (常駐) / nova-manager (協調) / nova-control (UI) / nova-core (基建/SoT)。`brain` 隱喻不直觀，`core` 字面就是「Nova 核心基建」對齊 cwd=~/.claude 的 SoT 本質。
2. **使用者糾正觸發** — iter 14 handoff 後綴 `nova-handoff-nova-brain.md` 顯老舊，使用者認知 nb 是「舊命名」需升級。
3. **與 ADR-008 Phase 1 對齊** — Phase 1 已搬 cwd=~/.claude，name 應同步升級反映「core」角色而非「brain」legacy。

## 影響面盤點（2026-04-19 grep 結果）

| 範圍 | nova-brain 引用數 | 處置 |
|:----|:----:|:----|
| `data/projects.json` | 1 | 直接改 name |
| `rules/` | 1 | 取代 |
| `skills/` | 15 | 取代 |
| `hooks/` | 6 | 取代（含 cwd-to-project.js 註解） |
| `scripts/` | 36 | 取代 |
| `docs/` | 2 | 取代 |
| `obsidian/` | 43 | 取代 |
| `CLAUDE.md` / `statusline.sh` / 根目錄 | TBD | 取代 |
| **Source 小計** | **~104+** | sed 批次 + spot check |
| `tasks/`, `plans/`, `state/`, `projects/.../*.json` | ~46 | runtime state，**不改** |
| 跨 session：nm/ns/nc/L5 | TBD | Phase B cross-dispatch |
| `~/projects/nova-brain/` 目錄 | scope path | Phase C（D3，慎重） |

## Phase 拆分

### Phase A — nova session 內部改名（D2，本 session 可做）

1. 改 `data/projects.json`: `name: "nova-brain"` → `"nova-core"`
2. sed 批次替換 `~/.claude/{rules,skills,hooks,scripts,docs,obsidian}/` 下所有 `nova-brain` → `nova-core`
3. spot check：narrative 段落（如「nova-brain（大腦 session）」）需同步改文字
4. 跑 architecture.test.js 驗證 580 pass 不退步
5. 驗 statusline 用新 canonical name 找到 routing-level / pivot-mandatory 檔
6. commit 含 nova-brain → nova-core 全鏈路 diff
7. 寫 reflection 紀錄此次 rename 決策

### Phase B — 跨 session 通知（D2 跨 session）

1. cross-dispatch 通知 nm/ns/nc 各自 grep 自家 nova-brain 引用 + 更新
2. 各 session 改完回 complete + commit hash
3. nb 驗收 4 session 都閉環後 mark Phase B done
4. 期間保留雙鍵相容期（statusline canonical lookup 已 fallback 到 transcript-derived）

### Phase C — 目錄改名 ~/projects/nova-brain → ~/projects/nova-core（D3，後續）

1. 評估：是否值得改目錄（git history / submodules / IDE bookmarks 全部會斷鏈）
2. 若改：mv 目錄 + 更新 projects.json cwd path + 更新所有 hardcoded path 引用
3. 若不改：保留目錄名為 legacy alias，scope path 不動

⚠️ Phase C 預設**不執行**，等 Phase A/B 穩定後再評估 cost/benefit。

## 風險與緩解

| 風險 | 緩解 |
|:----|:----|
| sed 誤替換（如 `nova-brain-archives` 字串） | 改前 grep -c 估算 + 改後 diff review + arch test |
| 跨 session 暫時不一致（nm 還用 nova-brain，nb 已改 nova-core） | server side `cwdToProject(target_cwd)` 動態算 → name 變 routing 自動跟，dispatch path 不破 |
| 歷史 commit / PR / docs 引用 nova-brain | 不可逆但可接受（git blame/log 仍可查） |
| ~/projects/nova-brain/ 目錄保留導致命名混淆 | Phase A 不改目錄，docs 註明「目錄為 legacy path alias，canonical name 已升 nova-core」 |
| stale /tmp/nova-*-nova-brain.txt 檔殘留 | Phase A 結束後手動清 + cron 7 日清理 stale tmp 檔 |

## 驗收條件（Phase A）

- ✅ `data/projects.json` name 改 nova-core
- ✅ source code 104+ 處 grep -c 為 0（除歷史 commit message / 此 spec 自身）
- ✅ `bun test ~/projects/nova-brain/tests/unit/architecture.test.js` 580 pass / 0 fail
- ✅ statusline 顯示 routing-level / pivot icon 走 nova-core 名稱（cwd-to-project.js canonical lookup 自動跟）
- ✅ commit 訊息明示「BREAKING: canonical name nova-brain → nova-core; legacy path alias 保留」
- ✅ 反思 entry 含 `external_references` 指向本 spec

## Sources

- 使用者 prompt iter 14 (2026-04-19): "nb 改 nova-core 你覺得怎麼樣"
- ADR-008 Phase 1 cwd 搬家紀錄
- hooks/lib/cwd-to-project.js (canonical lookup SoT)
- statusline.sh canonical lookup 改動 (commit 88b9c1c)
