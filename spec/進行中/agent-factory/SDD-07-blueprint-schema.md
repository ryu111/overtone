# SDD-07 Agent Blueprint Schema

> **Status**: Draft (Round 9-10 canonical, 拆自 SDD-01 §5)
> **Owner (draft)**: nb（protocol + config owner）
> **Peer reviewers**: nc (UI 消費) / ns (event schema 擴充) / nm (L3 incubator 實作)
> **Source rounds**: R7 (MA 四大物件) / R8 (Blueprint 五欄盤點) / R9 (ns 三確認 accept + nc 三問答) / R10 (9 Screen PNG + nc Round 10-reply)
> **Final location (on approval)**: `~/.claude/docs/protocols/agent-blueprint-schema.md` + 本檔作為 SDD 存檔

## 1. 動機

R7 接 Anthropic MA 官方示範（@boxaaron 2min demo）+ R8 nb 盤點揭露 Nova 當前 blueprint 缺 canonical schema 形式化。Nova 雖有擴充欄（role / core_objective / non_negotiables / pipeline 等 Nova 差異化）但缺官方對齊的 `model` / `mcp_servers` / 結構化 `tools` 欄，無法 machine-parse、無法 UI 驅動配置、無法 L3 孵化器 spawn 時校驗。本 SDD 定義 **two-tier schema**：tier 1 對齊官方 canonical、tier 2 保留 Nova 差異化。

## 2. Two-tier Schema 總覽

```yaml
# ==== Tier 1: canonical (對齊 Anthropic MA agent.yaml) ====
model: claude-sonnet-4-6          # 必填
system: |                         # 必填
  <agent-specific system prompt>
mcp_servers:                      # optional
  - name: <id>
    url: <url-or-stdio-path>
    type: url | stdio
tools:                            # optional
  - type: bash | edit_write | mcp_toolset | agent_toolset_YYYYMMDD
    permission_policy:
      type: always_allow | ask_user | deny
    scope: <path-glob>            # Nova 獨有擴充（比官方 type-based 更細）
skills: [<skill-ref>, ...]        # optional

# ==== Tier 2: nova_extensions (Nova 差異化, 非官方 canonical) ====
agent_id: <id>                    # 必填
version: <int>                    # 必填
schema_version: <int>             # 必填（當前 1）
role: <role>                      # 必填
core_objective: <one-liner>       # 必填
non_negotiables: [...]            # 必填（3-5 條）
tools_denied:                     # 必填（自然語言版 + 結構化版）
  - <human-readable-entry>
pipeline: [...]                   # optional
inter_agent_protocol:             # optional
  reference: <protocol-path>
  role_in_discussion: <role>
  discussion_persistence_path: <path>
output_contract:                  # optional（R10 nb 新增，對應 Screen 1.5）
  format: markdown | json | yaml
  destination: <path-or-template>
  metadata_fields: [bytes, generated_at, agent_id, session_id, ...]
blueprint_derived_from:            # optional（追溯來源）
  <field>: <source-path>
blueprint_stability_metric:        # optional
  week_0_baseline: <date>
  success_criterion: <text>
  measurement: <method>
```

### UI 對應（nc Round 10 Screen 1.1b）

- Tier 1：右側 Blueprint Preview pane **預設展開**，對齊 MA 新人學習曲線
- Tier 2：折疊 `▶ Nova Extensions` 按鈕，需要時展開查看
- 編輯：`Edit in IDE` 按鈕導向對應 yaml 檔，不做 in-app 編輯（符合「編輯必 persist to git」blueprint constraint）

## 3. Tier 1 各欄細節

### 3.1 `model`

當前 Nova 隱式走 `rules/核心/深度路由.md` D 維度（g4/haiku/sonnet/opus）。Blueprint 層級需顯式宣告以利 L3 孵化器 spawn 選 model。

允許兩種宣告方式：
```yaml
model: claude-sonnet-4-6          # 顯式單一 model
# 或
model_policy: depth-routed         # Nova 獨有：路由決定
```

### 3.2 `system`

Agent 專屬 system prompt。**不混 rule 注入**（rule 注入由 Claude Code 全局機制處理，非 blueprint 欄位）。L3 孵化器 spawn 時以此欄為 agent system prompt base。

### 3.3 `mcp_servers`（nc Screen 1.2 UI 對應）

陣列形式：
```yaml
mcp_servers:
  - name: pencil
    url: stdio:///usr/local/bin/pencil-mcp
    type: stdio
  - name: context7
    url: https://mcp.context7.com
    type: url
```

**UI 編輯 → `.mcp.json` persist**。`.mcp.json` 是 SDD-01 §5 canonical 白名單新增路徑（R10 nb 派生）。

### 3.4 `tools`（nc Screen 1.3 UI 對應 + §5.1 🟣 sandbox enforce）

官方 MA type-based + Nova 擴充 `scope` path glob：
```yaml
tools:
  - type: bash
    permission_policy:
      type: ask_user
    scope: scripts/*               # Nova 擴充：限制到 scripts/ 下
  - type: edit_write
    permission_policy:
      type: always_allow
    scope:
      - Sources/**
      - Tests/**
  - type: mcp_toolset
    mcp_server_name: pencil
    permission_policy:
      type: always_allow
  - type: edit_write
    permission_policy:
      type: deny
    scope: ~/.claude/**           # §5.1 🟣 sandbox 對應
```

**permission_policy enum（對齊官方 MA + Nova 細化）**：
- `always_allow`：自動放行（官方）
- `ask_user`：彈出 permission modal（Nova 擴充，對應 AskUserQuestion）
- `deny`：block + 觸發 hook.blocked（Nova 擴充）

### 3.5 `skills`（nc Screen 1.4 UI 對應）

```yaml
skills:
  - closed-loop
  - feedback-loop
  - nova-eval
```

UI 編輯：左列 `~/.claude/skills/` available → 拖到右列 `blueprint.skills[]` bound。SKILL.md preview from disk（fetch on hover）。

## 4. Tier 2 nova_extensions 細節

### 4.1 必填欄（當前 Nova session-agent 共通）

`agent_id` / `version` / `schema_version` / `role` / `core_objective` / `non_negotiables` / `tools_denied`

### 4.2 `output_contract`（R10 nb 新增，Screen 1.5 消費）

Agent 結束時的 output schema。producer hook 寫入指定 destination 後 emit `agent.output_written` event，Screen 1.5 complete 畫面顯示「Output written: <path>」。

```yaml
output_contract:
  format: markdown
  destination: ./output/{agent_id}-report.md
  metadata_fields: [bytes, generated_at, agent_id, session_id]
```

**對應 event**：
```json
{
  "event_type": "agent.output_written",
  "payload": {
    "agent_id": "<id>",
    "session_id": "<id>",
    "output_path": "<absolute-path>",
    "bytes": <int>,
    "format": "markdown",
    "generated_at": "<iso8601>"
  }
}
```

此 event 落地時機：R9 後獨立 dispatch commit `~/.claude/config/event-types/agent.json`（🔵 Contract-only）。

## 5. Incubation namespace（nc Screen 3.x 消費）

新增 `~/.claude/config/event-types/incubation.json` canonical，含 2 events：

### 5.1 `incubation.spawn_failed`

```json
{
  "event_type": "incubation.spawn_failed",
  "payload_fields": ["blueprint_id", "parent_session", "layer", "reason_code", "reason", "reason_full", "ts"],
  "payload_enums": {
    "reason_code_ref": "~/.claude/config/hook-block-reason-codes.json",
    "layer": ["L3", "L4", "L5"]
  }
}
```

### 5.2 `incubation.non_negotiable_violated`

```json
{
  "event_type": "incubation.non_negotiable_violated",
  "payload_fields": ["blueprint_id", "violation_tool", "target_path", "hook_name", "tools_denied_entry", "ts"],
  "correlation_id_source": "blueprint_id"
}
```

**Producer**：`hooks/modules/incubation-guardrail.js`（SDD-01 §5.1 提及，S7 milestone by nm）。

## 6. reason_code enum 擴充（nc Q1 採納）

`~/.claude/config/hook-block-reason-codes.json` 新增 6 enum（R10 nc 提議）：

| reason_code | 定義 | 對應 Retry 語意（nc Q2）|
|-------------|------|------------------------|
| `non-negotiable-violated` | Blueprint non_negotiables 被違反 | B: 開 Screen 1.x 改 blueprint |
| `tools-denied-path` | Tool 試圖寫入 blueprint.tools_denied 路徑 | B: 開 Screen 1.3 |
| `permission-policy-denied` | Permission policy = deny | B: 開 Screen 1.3 |
| `blueprint-schema-invalid` | Blueprint yaml schema 驗證失敗（tier 1 canonical 5 欄缺）| B: 開 Screen 1.x |
| `mcp-server-unreachable` | Blueprint 宣告的 MCP server 連不上 | A: 重 spawn blueprint 不變（瞬時錯誤）|
| `incubation-guardrail-block` | L3 孵化器 sandbox guardrail block | B: 開 Screen 1.3 |

## 7. Retry 與 Dismiss 語意（nc Q2/Q3 採納）

### 7.1 Retry 按鈕（nc Q2）

A+B 並存，依 reason_code 路由：
- **A 路徑**（瞬時錯誤，如 `mcp-server-unreachable`）：重 spawn blueprint 不變，hook state **不 reset**
- **B 路徑**（結構性錯誤，其餘 5 種）：開 Screen 1.x 讓使用者改 blueprint，hook state **必 reset**（blueprint 變更後舊 state 失效）

**Hook 介面要求**：incubation-guardrail.js 需暴露 `reset_on_blueprint_change=true` 語意。

### 7.2 Dismiss 按鈕（nc Q3）

**mark event acknowledged**（非單純關 UI）：
- `ns event log schema` 加 `acknowledged_at: <timestamp | null>` 欄（ns scope）
- `POST /api/events/:id/acknowledge` endpoint（ns scope）
- SSE broadcast `event_acknowledged`（ns scope）
- UI 關 modal + 事件 acknowledged 綁定，所有 nc 視窗同步

**Audit trail 動機**：non_negotiable violation 級別必留使用者「看過 + 決定不處理」紀錄，reviewer-enforcer 後續可查詢「未處理 forced_alert」。

## 8. Deploy / Integrate 三 surface（nc Screen 1.5）

Blueprint 完成後的 deploy 路徑：

| # | Surface | 用途 |
|:-:|---------|------|
| 1 | CLI `claude -p --blueprint <id> --session-id <uuid>` | 本地互動 spawn |
| 2 | `POST /api/agents/spawn` via nova-server | 程式化 spawn（nm L3 孵化器用）|
| 3 | cross-dispatch（agent-to-agent integration surface） | 跨 agent 協作入口 |

**Nova 不做 cURL export**（MA 獨有），理由：Nova 非雲端 API-first 架構，cross-dispatch 即 canonical 跨 agent 協定。

## 9. 實作里程碑（SDD 通過後）

1. 寫 `~/.claude/docs/protocols/agent-blueprint-schema.md`（本 SDD 最終版）
2. 擴 `~/.claude/config/hook-block-reason-codes.json` 加 6 enum（§6）
3. 寫 `~/.claude/config/event-types/incubation.json`（§5，🔵 Contract-only）
4. 寫 `~/.claude/config/event-types/agent.json` 加 `agent.output_written`（§4.2，🔵 Contract-only）
5. ns SDD-02 §3 白名單 15 → 18 types（加 incubation.* 2 + agent.output_written 1）
6. ns event log schema 加 `acknowledged_at` 欄 + `/api/events/:id/acknowledge` endpoint + SSE `event_acknowledged`
7. nm S7 producer `hooks/modules/incubation-guardrail.js`（SDD-01 §5.1 提及）
8. nc Swift SwiftUI 9 Screen 逐一實作（Round 10 mockup 已備）
9. BDD-02 unit test 鎖定 tier 1/tier 2 schema validator + retry 路由 + dismiss acknowledge

## 10. 未決議題

- **§3.1 `model_policy: depth-routed`** — L3 孵化器 spawn L4 agent 時若走路由決定，如何 deterministic？需 nm 定義
- **§3.4 `permission_policy.type=ask_user`** vs AskUserQuestion 工具的語意對齊（都彈 modal 但觸發路徑不同）
- **§4.2 `output_contract.destination` template 語法** — `{agent_id}` / `{session_id}` placeholder 是否需限制允許 token 集，避免路徑注入

## 11. 與既有 SDD 關係

- SDD-01 §5 canonical 白名單 — 本 SDD 派生 `.mcp.json` 加入
- SDD-01 §5.1 🟣 sandbox — 本 SDD §3.4 tools deny scope 對應 enforce 機制
- SDD-02 §3 白名單 — 本 SDD 新增 3 event types 擴充（incubation.* 2 + agent.output_written 1）
- SDD-03 §7 canonical event 總表 — 本 SDD namespace 擴充紀錄
- SDD-05 derived view — 本 SDD 不涉（nc 另行主寫 transcript view）
