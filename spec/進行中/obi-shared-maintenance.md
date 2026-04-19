---
spec: obi-shared-maintenance
status: 提案（待使用者決定 A/B/C 方案）
owner: nova (cwd=~/.claude)
created: 2026-04-19
trigger: 使用者訴求「是不是該讓所有 session 都可以使用 ~/.claude/obi/ 的內容，應該是共同維護使用。今天 nc 想寫但因為沒權限，就寫在自己的 session claude 中，這樣變 obi 只有你一個在用，變成進化長久記憶跟知識庫等等功能其他 session 都無法使用」
priority: high
estimated_effort: spec ~30min（本 draft 已交）/ 實作 2-4h（方案 B）/ 遷移 1-2h（70 檔 fragmented memory）
depth: D3（架構決策，ADR-007 Q1 修訂）
related_adr: [ADR-007-nb-to-nova-migration Q1-A, ADR-010-external-references]
---

# Obi 共享維護架構 Spec

## 現狀（Agent 2 調查確認 2026-04-19）

### 權限設計

| 機制 | 檔案 | 擋什麼 |
|:--|:--|:--|
| global-element-guard.js | hooks/modules/global-element-guard.js L18 | AUTHORIZED_AGENTS = `{"nova", "nova-brain"}` |
| PROTECTED_PATHS | hooks/modules/guards.js L380-394 | `~/.claude/{agents,skills,hooks,commands,data,rules,scripts,config,settings.json,CLAUDE.md,obsidian,...}` |
| nova bypass | guards.js L503-510 | 只 nb 豁免 |

**結果**：nc/nm/nq/novaplay 寫 `~/.claude/obsidian/` 全被擋，錯誤訊息：
> 全域元件修改需透過 nova session (agent_id: nova / nova-brain)。規則：~/.claude/rules/協作/跨專案協作.md

### 症狀 — Fragmented Memory

| Session | 寫入位置 | 檔數 | 問題 |
|:--|:--|:--:|:--|
| nm | `~/.claude/projects/-Users-sbu-projects-nova-manager/memory/` | 70+ | feedback/project/reference flat 檔，無法被其他 session 讀 |
| nc | `~/.claude/projects/-Users-sbu-projects-nova-control/` | ? | 同上（今日事件 user 觀察到） |
| nq/novaplay | 同模式 | ? | 推測同上 |
| **nb** | `~/.claude/obsidian/`（canonical SoT） | ~200+ | 只 nb 維護 |

### 結構問題（使用者直指）

1. **obi 變單腦系統** — ADR-007 Q1-A 定義 canonical SoT = nb monopoly，其他 session 寫不進就各自造記憶庫
2. **長久記憶 / 知識庫失效** — nc 遇到的業界研究、踩坑教訓寫在自己 session memory，下次其他 session 遇到同問題時搜不到
3. **進化協作斷裂** — 反思四步的「外部研究」產出只 nb 能寫 obsidian/semantic/external-references/，其他 session 貢獻零

## 三方案對比

### 方案 A：完全開放 obi 寫權

所有 session 可寫 `~/.claude/obsidian/` 全域。

| 維度 | 評估 |
|:--|:--|
| 實作成本 | 低（改 2 hook 的 AUTHORIZED 白名單） |
| canonical 權威 | ✗ 消失（ADR 可被任何 session 覆寫） |
| 衝突風險 | 高（兩 session 同時改同檔，無 merge 策略） |
| 共享效益 | 最高 |

**評**：太激進，canonical SoT 失守。

### 方案 B：分區授權（推薦 ⭐）

按 obsidian/ 子目錄分 ownership：

| 分區 | ownership | 理由 |
|:--|:--|:--|
| `semantic/` | nb 獨占 | ADR / agent-identity / architecture decisions — canonical 權威 |
| `semantic/external-references/` | **所有 session 可寫**（新增分區） | 業界研究對所有 session 都需積累 |
| `episodic/incidents/` | **所有 session 可寫** | 踩坑事件各 session 各自記自己遇到的 |
| `raw/sessions/` | **所有 session 可寫** | 活動紀錄本就 per-session |
| `raw/reflections/` | **所有 session 可寫** | 反思 persistence 各 session 獨立 |
| `raw/dispatches/` | **所有 session 可寫** | cross-dispatch 紀錄 per-session |
| `wiki/` | **所有 session 可寫** | 編譯知識協作貢獻 |
| `working/{session}/` | **所有 session 可寫** 限自己 subdirectory | drafts 各 session 各自 |
| `CLAUDE.md` | nb 獨占 | vault 入口規範 |
| `.obsidian/` | nb 獨占 | vault 配置 |

**權限實作**：
```js
// hooks/modules/guards.js 新增
const OBSIDIAN_SHARED_PATHS = [
  /\/\.claude\/obsidian\/semantic\/external-references\/.+\.md$/,
  /\/\.claude\/obsidian\/episodic\/incidents\/.+\.md$/,
  /\/\.claude\/obsidian\/raw\/(sessions|reflections|dispatches)\/.+/,
  /\/\.claude\/obsidian\/wiki\/.+/,
  /\/\.claude\/obsidian\/working\/[^/]+\/.+/,  // per-session subdir only
];

const OBSIDIAN_CANONICAL_PATHS = [
  /\/\.claude\/obsidian\/semantic\/(architecture-decisions|agent-identity|rules-background)\/.+/,
  /\/\.claude\/obsidian\/CLAUDE\.md$/,
  /\/\.claude\/obsidian\/\.obsidian\/.+/,
];

// 邏輯：OBSIDIAN_SHARED 命中 → 放行；OBSIDIAN_CANONICAL 命中 → 只 nb；其他 obsidian/ → 只 nb
```

**frontmatter 歸屬要求**：所有 shared 寫入必含：
```yaml
authored_by: <session_name>  # nm / nc / nq / novaplay
created: <date>
```
方便 review 追溯來源。

| 維度 | 評估 |
|:--|:--|
| 實作成本 | 中（2 hook regex 擴充 + 新 rule + ADR 修訂） |
| canonical 權威 | ✓ 保留（semantic/ADR 仍 nb 守護） |
| 衝突風險 | 低（分區隔離，working/{session}/ 物理分 dir） |
| 共享效益 | 高（external-references / episodic / raw / wiki 全共享） |

**評**：平衡點，canonical 不失守同時開放協作。

### 方案 C：Federated writes + nb merge review

所有 session 先寫 `obsidian/working/incoming/{session}/`，nb 定期 review 後 merge 到 canonical。

| 維度 | 評估 |
|:--|:--|
| 實作成本 | 高（需 merge script / review workflow / nb 主動 polling） |
| canonical 權威 | ✓ 最強（nb 完全把關） |
| 衝突風險 | 零 |
| 共享效益 | 中（有延遲，等 nb merge） |
| 複雜度 | 高（類似 PR workflow，需 tooling 支援） |

**評**：理想但 overkill，70 檔 fragmented 先 unblock 比完美 workflow 重要。

## 推薦：方案 B（分區授權）

### 實作步驟

1. **hook 修改**（~30min）
   - `hooks/modules/guards.js`：新增 OBSIDIAN_SHARED_PATHS / OBSIDIAN_CANONICAL_PATHS 兩正規陣列，修改 PROTECTED_PATHS 判斷邏輯
   - `hooks/modules/global-element-guard.js`：同步豁免 shared 分區
   - 新增 baseline test（lock 規則）

2. **新 rule**（~20min）
   - `rules/協作/obi-共享維護.md`：定義分區 ownership + frontmatter 要求 + canonical 邊界
   - `rules/協作/跨專案協作.md` 補「obi 共享寫入」段指向新 rule

3. **ADR 修訂**（~15min）
   - `obsidian/semantic/architecture-decisions/ADR-007-nb-to-nova-migration.md` 加 Q1-A' revision section
   - 說明從「nb monopoly」→「canonical nb + shared 分區」的演進理由

4. **Fragmented memory 遷移**（~1-2h，可分輪）
   - nm `memory/` 70 檔盤點分類：
     - cross-session lesson → `obsidian/episodic/incidents/`
     - session 私有 project 狀態 → 留原位
     - 外部研究 → `obsidian/semantic/external-references/`
   - 各 session 自主遷移（cross-dispatch notification）
   - nb 定期 review 確保 canonical 邊界守住

5. **架構測試**（~15min）
   - `tests/unit/architecture.test.js` 新增 obi 分區測試：
     - nova 可寫 canonical + shared ✓
     - 其他 session 可寫 shared ✓
     - 其他 session 寫 canonical → block ✓

### 風險與防護

| 風險 | 防護 |
|:--|:--|
| 其他 session 意外寫到 canonical | hook regex + baseline test lock |
| shared 區 frontmatter 品質不一 | 新 rule 規範 + 可選 hook warn |
| ADR-007 canonical SoT 被誤解為「被推翻」 | ADR revision 明示「canonical 仍 nb、shared 是 additive 協作」 |
| working/{session}/ 膨脹難清 | age_grace_days 機制 + Manager 季度 review |

## 決策點

請選擇方案：

- [ ] **方案 A** — 完全開放（最快解但失 canonical）
- [x] **方案 B** — 分區授權（推薦 ⭐，平衡點）
- [ ] **方案 C** — Federated merge（overkill 暫不推薦）
- [ ] 其他（請補充）

**推薦理由**：方案 B 以最小 hook 改動解 70 檔 fragmented memory 問題，同時保留 canonical ADR/agent-identity 的權威。方案 C 的 merge workflow 可作為 Phase 2 未來升級（若方案 B 運作後出現 canonical 邊界爭議）。

## 使用者選定方案後的實作順序

決定 → nb 實作 hook + rule + ADR revision（此 session 內可完成）→ cross-dispatch 通知 nc/nm/nq/novaplay「obi shared 開放」→ 各 session 自主 migrate memory → 下輪審視遷移結果

## Sources

- Agent 2 現狀調查（2026-04-19）
- ADR-007 Q1-A 原決策（2026-04-18）
- `obsidian/semantic/external-references/2026-04-agent-memory-architectures.md`（MIRIX 6 類記憶分離）
- `obsidian/semantic/external-references/peer-to-peer-agent-coordination-2026.md`（若存在，新 untracked 檔）
