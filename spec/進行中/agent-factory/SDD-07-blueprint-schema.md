# SDD-07 Agent Blueprint Schema

> **Status**: Draft (Round 9-10 canonical, 拆自 SDD-01 §5)
> **Owner (draft)**: nb（protocol + config owner）
> **Peer reviewers**: nc (UI 消費) / ns (event schema 擴充) / nm (L3 incubator 實作)
> **Source rounds**: R7 (MA 四大物件) / R8 (Blueprint 五欄盤點) / R9 (ns 三確認 accept + nc 三問答) / R10 (9 Screen PNG + nc Round 10-reply)
> **Final location (on approval)**: `~/.claude/docs/protocols/agent-blueprint-schema.md` + 本檔作為 SDD 存檔

## 1. 動機

R7 接 Anthropic MA 官方示範（@boxaaron 2min demo）+ R8 nb 盤點揭露 Nova 當前 blueprint 缺 canonical schema 形式化。Nova 雖有擴充欄（role / core_objective / non_negotiables / pipeline 等 Nova 差異化）但缺官方對齊的 `model` / `mcp_servers` / 結構化 `tools` 欄，無法 machine-parse、無法 UI 驅動配置、無法 L3 孵化器 spawn 時校驗。本 SDD 定義 **two-tier schema**：tier 1 對齊官方 canonical、tier 2 保留 Nova 差異化。

## 1.5 Four-Object Model（R10+ 使用者補料，MA 側邊欄 5-section 對應）

使用者 2026-04-16 補料 MA 側邊欄截圖 → IA 非線性 stepper，而是 **4 個獨立物件 + 1 入口**：

| Object | Nova 對應 | 關係 |
|--------|-----------|------|
| **Agent** (Blueprint) | 本 SDD-07 定義的 yaml | `environment_id` + `credential_refs[]` 引用其他物件 |
| **Session** | 執行實例 + Transcript/Debug | `agent_id` + `environment_id` 執行時 resolve |
| **Environment** | MCP servers + sandbox + 配置 | 一份 Environment 可被多 Agent 共用 |
| **Credential Vault** | API keys / OAuth tokens | 獨立物件，workspace 級共用（MA demo Frame 8 驗證）|
| Quickstart（入口）| 範本庫 + 「What do you want to build?」| 非物件，只是 entry point |

**Blueprint schema 重大修正**（從本 Round 生效）：
- `mcp_servers` **移出 tier 1**，改為 Environment 物件屬性
- Blueprint tier 1 改放 `environment_id`（reference）
- Credentials **永不放 Blueprint**，另建 Credential Vault 物件，Blueprint 用 `credential_refs: [vault://<vault_id>/<key>]` 引用

此修正比官方 MA agent.yaml 更結構化（官方 demo 也把 credential 拉出但 agent.yaml schema 未明示）。

### UI 對應（R13 nc accept：Env-Vault 合併 tab）

Canonical schema 維持 Environment / Vault 獨立物件，但 **UI 層允許合併呈現** — nc Screen U Detail pane 的 `Env-Vault` tab 將 Environment subsection + Vault subsection 合併在同 tab，理由：
- 使用者 mental model 把「agent 的外部配置」視為一類（UX convenience）
- CRUD 流程實際獨立（Env 設定 vs Vault 授權各有獨立表單）
- canonical 不受 UI 合併影響，SDD-02 event namespace 仍分 `environment.*` 與 `credential.*` 各自 CRUD

## 2. Two-tier Schema 總覽

```yaml
# ==== Tier 1: canonical (對齊 Anthropic MA agent.yaml) ====
model: claude-sonnet-4-6          # 必填
system: |                         # 必填
  <agent-specific system prompt>
environment_id: <id>              # 必填（R10+ 修正：mcp_servers 移至 Environment 物件）
credential_refs:                  # optional（R10+ 新增：引用 Credential Vault）
  - vault://<vault_id>/<key>
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

### 3.3 `environment_id` + Environment 物件（R10+ 修正，原 `mcp_servers` 移至此）

Blueprint 只存 reference，Environment 物件獨立：

```yaml
# Blueprint (Agent 物件)
environment_id: env-default-001

# Environment 物件（nc Screen 1.2 + Environments 列表頁）
# 存放位置: ~/.claude/environments/<env_id>.yaml
environment_id: env-default-001
mcp_servers:
  - name: pencil
    url: stdio:///usr/local/bin/pencil-mcp
    type: stdio
  - name: context7
    url: https://mcp.context7.com
    type: url
sandbox:
  allowed_write: [...]
  denied_write: [~/.claude/**, nova-core/**]
```

**UI 編輯 → `.mcp.json` persist**（當 Environment 為 default）+ `~/.claude/environments/<id>.yaml`（具名 Environment）。`.mcp.json` 是 SDD-01 §5 canonical 白名單路徑（R10 nb 派生）。

**動機**（R10+ 使用者補料）：MA demo 一份 Environment 可多 Agent 共用，與 agent 生命週期解耦。強制獨立物件避免 environment 配置散落每個 blueprint。

#### 3.3.1 Environment 物件完整 schema（xd-xa8y 補齊）

```yaml
# ~/.claude/environments/<env_id>.yaml
environment_id: <id>                # 必填，slug format [a-z0-9-]+
version: <int>                      # 必填，schema_version
created_at: <iso8601>
updated_at: <iso8601>
description: <text>                 # optional human-readable
mcp_servers:
  - name: <slug>
    url: <url | stdio path>
    type: url | stdio
    timeout_ms: <int>               # optional，default 30000
    health_check_interval_s: <int>  # optional，default 30
sandbox:
  allowed_write: [<path-glob>, ...]  # 必填，empty=全 deny
  denied_write: [<path-glob>, ...]   # 必填，higher priority than allowed
  allowed_read: [<path-glob>, ...]   # optional，default 全 allow
  denied_read: [<path-glob>, ...]    # optional
  network:
    allowed_hosts: [<host-pattern>]  # optional，default 全 allow
    denied_hosts: [<host-pattern>]   # optional
binding_rules:
  max_concurrent_agents: <int>       # optional，default unlimited
  require_credential_refs: [<vault_id>, ...]  # optional，binding 時必有這些 vault
```

**敏感域紀律**：Environment **不含任何 secret**。OAuth tokens / API keys / passwords 一律放 Credential Vault（§3.4.5）。Environment 僅描述「配置結構」不含「配置值」。

#### 3.3.2 Environment CRUD API

| Method | Endpoint | 用途 | SSE event |
|--------|----------|------|-----------|
| `POST` | `/api/environments` | 建 | `environment.created` |
| `GET` | `/api/environments` | 列表 | — |
| `GET` | `/api/environments/:id` | 單筆 | — |
| `PATCH` | `/api/environments/:id` | 更新 | `environment.updated` |
| `DELETE` | `/api/environments/:id` | 刪 | `environment.destroyed` |
| `POST` | `/api/environments/:id/bind` | 綁 agent | `environment.bound` |
| `POST` | `/api/environments/:id/unbind` | 解綁 | `environment.unbound` |

**owner**：nova-server ns scope。**authorization**：使用者身份直接，無需額外 credential（Environment 不含 secret）。

#### 3.3.3 Binding 規則（Agent ↔ Environment）

- Blueprint `environment_id` 若指向不存在 Environment → `blueprint-schema-invalid` reason_code（§6）
- Environment 刪除前若仍有 Agent binding → 422 reject + 列受影響 blueprint_id 清單
- Environment `binding_rules.require_credential_refs` 定義的 vault 若 Agent blueprint `credential_refs` 缺 → `non-negotiable-violated`（§6）

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

### 3.4.5 Credential Vault 物件（R10+ 新增，R13 補充）

Blueprint 永不內嵌 credentials，用 `credential_refs[]` 複合路徑引用 Vault（R13 nc accept）：

```yaml
# Blueprint
credential_refs:
  - vault://box-oauth/access_token
  - vault://box-oauth/refresh_token
  - vault://github-pat/read          # 支援一 Vault 多 key (least-privilege)
```

**命名選定**：`credential_refs: [vault://<vault_id>/<key>]` 複合路徑（R13 定案，取代早期 `credential_vault_refs` 僅 vault_id 版本）。理由：一 Vault 可多 key（如 github-pat 同時含 read/write token）+ least-privilege（agent 只取需要 key）+ UI 可簡化只顯 `vault_id` 作 label 隱藏 `:<key>` 尾綴。

#### 儲存策略（R13 nc accept）

**Primary — macOS Keychain + Touch ID**（OS-native，比 MA 雲端 vault 更安全）：
- Keychain service: `com.nova.vault.<vault_id>`
- Touch ID 授權綁定（每次 agent runtime read 時觸發）
- 加密由 macOS 原語負責（Secure Enclave 協助）

**Fallback — 檔案加密**（Keychain 不可用時）：
- 存放：`~/.claude/credentials/<vault_id>.enc`
- 加密算法：**AES-256-GCM**（業界標準，authenticated encryption）
- KDF：**argon2id**（password-based key derivation，抗 GPU 暴力破解）
- master password 來源：使用者首次建 vault 輸入（不 persist，每次 session 重輸）
- `.gitignore` 雙保險：`~/.claude/credentials/` 整目錄 gitignored

#### 取值機制

Agent runtime 取 credential 方式（UI 永不顯示明文，nc R12b 要求）：
- env var 注入：`NOVA_VAULT_<VAULT_ID>_<KEY>=<decrypted>`（subprocess scope，session 結束銷毀）
- file handle：臨時 `/tmp/nova-vault-<uuid>` 檔，agent exit 時刪除

#### Event 觸發時機（對齊 ns R12 redactor）

每次 runtime 取 credential 時 emit `credential.accessed`（§5.3）— audit trail 留 session_id / agent_id / vault_id / key_name / ts（**無明文值**，ns writer 強制 `redactCredentialPayload()` 再把關）。

#### UI 對應

nc Credential Vaults 頁（reference/06，MA demo Frame 8 對應）：
- 列表顯示 vault_id / type / scope / last access（**永不顯示 value**）
- Audit Log 按鈕 → 跳 `credential.accessed` event log filter view
- 紅色安全警告：「Vault 值永不顯示在 UI — 僅在 agent runtime 透過 env var / file handle 注入」

#### 3.4.5.1 Vault CRUD API（xd-xa8y 補齊）

| Method | Endpoint | 用途 | SSE event | 安全紀律 |
|--------|----------|------|-----------|---------|
| `POST` | `/api/vaults` | 建 Vault（使用者輸入 secret → Keychain 或加密檔）| `credential.created` | request body `value` 欄立即 redact，event payload 不含 |
| `GET` | `/api/vaults` | 列表（metadata only，**無 value**） | — | 永不回 value |
| `GET` | `/api/vaults/:id` | 單筆 metadata | — | 永不回 value |
| `PATCH` | `/api/vaults/:id/rotate` | 換 secret | `credential.rotated` | 同 POST |
| `DELETE` | `/api/vaults/:id` | 刪 | `credential.deleted`（待定）| — |
| `POST` | `/api/vaults/:id/access` | agent runtime 取值內部 call | `credential.accessed` | 僅 agent runtime 可呼叫，走 mTLS / unix socket |
| `GET` | `/api/vaults/:id/audit` | 查 access 歷史 | — | `credential.accessed` event log filter |

**authorization**：
- 公開 endpoint（建/列/刪/rotate）需使用者身份 + Touch ID（若 Keychain primary）
- 內部 access endpoint 僅 agent runtime process 可呼叫（Unix socket `/tmp/nova-vault.sock` + peer creds check）

**敏感域紀律**（ns R12/R13 強制）：
- `payload_forbidden_fields`: `[access_token, refresh_token, client_secret, api_key, password, bearer]`
- writer `redactCredentialPayload()` 8 pattern regex 強制 sanitize
- value length ≤ 500 char 上限
- 5 分鐘 de-bounce `credential.accessed`（同 session_id + vault_id + key_name tuple 去重）

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

---

## 12. Four-Object Lifecycle Event Catalog（xd-xa8y 補齊）

本節列 4 物件完整 lifecycle events，對應 SDD-02 §3 canonical 白名單擴充。

### 12.1 Agent namespace（`~/.claude/config/event-types/agent.json` 待 commit）

| event_type | trigger | payload_fields | correlation_id |
|------------|---------|----------------|----------------|
| `agent.created` | `POST /api/agents` | `agent_id, blueprint_version, created_by, ts` | `agent_id` |
| `agent.updated` | `PATCH /api/agents/:id` | `agent_id, blueprint_version, updated_by, changed_fields[], ts` | `agent_id` |
| `agent.deleted` | `DELETE /api/agents/:id` | `agent_id, deleted_by, ts` | `agent_id` |
| `agent.output_written` | agent runtime 寫 output_contract destination 後（§4.2） | `agent_id, session_id, output_path, bytes, format, generated_at` | `session_id` |

### 12.2 Session namespace（`~/.claude/config/event-types/session.json` 當前已有，檢查補齊）

| event_type | trigger | payload_fields | correlation_id |
|------------|---------|----------------|----------------|
| `session.started` | `POST /api/sessions`（含 `agent_id` + `environment_id` resolve） | `session_id, agent_id, environment_id, started_by, ts` | `session_id` |
| `session.ended` | `PATCH /api/sessions/:id/end` 或 agent runtime exit | `session_id, end_reason, duration_ms, ts` | `session_id` |

**end_reason enum**: `normal | timeout | error | user_stop | crash | idle_timeout`

### 12.3 Environment namespace（`~/.claude/config/event-types/environment.json` 待 commit）

| event_type | trigger | payload_fields | correlation_id |
|------------|---------|----------------|----------------|
| `environment.created` | `POST /api/environments` | `environment_id, version, created_by, ts` | `environment_id` |
| `environment.updated` | `PATCH /api/environments/:id` | `environment_id, version, changed_fields[], ts` | `environment_id` |
| `environment.destroyed` | `DELETE /api/environments/:id` | `environment_id, deleted_by, ts` | `environment_id` |
| `environment.bound` | `POST /api/environments/:id/bind` | `environment_id, agent_id, bound_by, ts` | `environment_id` |
| `environment.unbound` | `POST /api/environments/:id/unbind` | `environment_id, agent_id, unbound_by, reason, ts` | `environment_id` |

**reason enum (unbound)**: `agent_deleted | user_action | env_deleted | rebind`

### 12.4 Credential namespace（`~/.claude/config/event-types/credential.json` ✅ R13 已 commit 712d436）

| event_type | trigger | payload_fields | correlation_id | 敏感紀律 |
|------------|---------|----------------|----------------|---------|
| `credential.created` | `POST /api/vaults` | `vault_id, type, scope, created_by, ts` | `vault_id` | forbidden 6 fields / redactor |
| `credential.accessed` | agent runtime 取值（5min de-bounce） | `vault_id, key_name, agent_id, session_id, access_method, ts` | `session_id` | 永無明文 value |
| `credential.rotated` | `PATCH /api/vaults/:id/rotate` | `vault_id, key_name, rotated_by, ts` | `vault_id` | 同 created |
| `credential.deleted` | `DELETE /api/vaults/:id` | `vault_id, deleted_by, ts` | `vault_id` | — |

### 12.5 Incubation namespace（`~/.claude/config/event-types/incubation.json` 待 commit）

見 §5.1 / §5.2（已定義）。

### 12.6 SDD-02 §3 白名單最終預估

當前 19 types（R15 後）→ **最終 35 types**（R14 Reviewer 校正）：
- dispatch.* 8 types（既有 §7 canonical）
- hook.* 2 types（既有 hook.json）
- session.* 2 types（既有 session.json）
- model.* 2 types（R9 model.json）
- credential.* 4 types（R13+R15 credential.json）
- agent.* 4 types（R14 agent.json §12.1）
- environment.* 7 types（nm 07e4f27: created/updated/destroyed/bound/unbound/mcp_health/quota_breach）
- environment_template.* 3 types（nm 07e4f27: created/instantiated/deleted）
- incubation.* 2 types（R14 incubation.json §5）
- agent.output_written 1 type（含於 agent.* 計數內）

**R14 batch commit 順序**（nb owned，ns accept order）：
1. `agent.json`（含 `agent.output_written` — Screen 1.5 nc UI 消費要點）
2. `environment.json`
3. `incubation.json`

每次 commit 觸發 ns SIGHUP reload + §3 白名單擴 + §10.x 記錄，對齊 R13 credential.* 流程。

## 13. Blueprint JSON Schema Validation（xd-xa8y 補齊）

本節定義 Blueprint yaml 的 JSON Schema，供孵化器 spawn 時校驗 + nc UI edit 時即時驗證。

**最終落地**：`~/.claude/config/schemas/blueprint.schema.json`（🔵 Contract-only，三方 accept 後 commit）。

### 13.1 JSON Schema v1

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://nova/blueprint.schema.json",
  "type": "object",
  "required": ["agent_id", "version", "schema_version", "role", "core_objective", "non_negotiables", "model", "system", "environment_id"],
  "properties": {
    "agent_id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "version": { "type": "integer", "minimum": 0 },
    "schema_version": { "type": "integer", "enum": [1] },
    "role": { "type": "string", "minLength": 1 },
    "core_objective": { "type": "string", "minLength": 1 },
    "non_negotiables": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 3,
      "maxItems": 5
    },
    "model": {
      "oneOf": [
        { "type": "string", "pattern": "^claude-(opus|sonnet|haiku)-[0-9a-z.-]+$", "description": "Claude model family pattern，新模型自動相容不需 schema 升版" },
        { "type": "object", "required": ["model_policy"], "properties": { "model_policy": { "const": "depth-routed" } } }
      ]
    },
    "system": { "type": "string", "minLength": 1 },
    "environment_id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "credential_refs": {
      "type": "array",
      "items": { "type": "string", "pattern": "^[a-z0-9-]+:[a-z0-9_]+$" },
      "default": []
    },
    "tools": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "permission_policy"],
        "properties": {
          "type": { "type": "string", "enum": ["bash", "edit_write", "mcp_toolset", "agent_toolset_20260401"] },
          "permission_policy": {
            "type": "object",
            "required": ["type"],
            "properties": { "type": { "enum": ["always_allow", "ask_user", "deny"] } }
          },
          "scope": {
            "oneOf": [
              { "type": "string" },
              { "type": "array", "items": { "type": "string" } }
            ]
          },
          "mcp_server_name": { "type": "string" }
        }
      }
    },
    "skills": { "type": "array", "items": { "type": "string" } },
    "tools_denied": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "pipeline": { "type": "array", "items": { "type": "string" } },
    "inter_agent_protocol": {
      "type": "object",
      "properties": {
        "reference": { "type": "string" },
        "role_in_discussion": { "type": "string" },
        "discussion_persistence_path": { "type": "string" }
      }
    },
    "output_contract": {
      "type": "object",
      "required": ["format", "destination"],
      "properties": {
        "format": { "type": "string", "enum": ["markdown", "json", "yaml"] },
        "destination": { "type": "string", "pattern": "^[^\\0]+$" },
        "metadata_fields": { "type": "array", "items": { "type": "string" } }
      }
    },
    "blueprint_derived_from": { "type": "object", "additionalProperties": { "type": "string" } },
    "blueprint_stability_metric": {
      "type": "object",
      "properties": {
        "week_0_baseline": { "type": "string" },
        "success_criterion": { "type": "string" },
        "measurement": { "type": "string" }
      }
    }
  },
  "additionalProperties": false
}
```

### 13.2 Validator 實作要求

- **位置**：`~/.claude/hooks/modules/blueprint-validator.js`（新建，S7 milestone）
- **Trigger**：
  - PreToolUse:Edit/Write 若 target path 符合 `~/.claude/blueprints/*.yaml` → block 若 schema invalid
  - `POST /api/agents` request body → 422 若 invalid
  - 孵化器 spawn 前 → `incubation.spawn_failed` with reason_code `blueprint-schema-invalid` 若 invalid
- **錯誤訊息**：指向違反欄位 + JSON Pointer path + 修復建議

### 13.3 nc UI 即時驗證（Screen 1.1b/1.3/1.4 對應）

- nc editor 載 schema 即時 highlight 錯誤欄
- `Edit in IDE` 按鈕前必驗（避免 persist invalid yaml 到 git）
- Error 顯示對齊 reason_code enum（§6）

## 14. xd-xa8y 補齊驗收 checklist

- ✅ §5 Blueprint two-tier schema 完整欄位定義 → §2 + §3.x（tier 1 canonical + tier 2 nova_extensions）
- ✅ §3.3 Environment 物件完整定義 → §3.3 + §3.3.1~3.3.3（含 schema + CRUD API + binding rules）
- ✅ §3.4.5 Credential Vault 完整定義 → §3.4.5 + §3.4.5.1（含 CRUD + 敏感紀律 + event redact）
- ✅ 四物件 lifecycle (created/updated/deleted/bound/unbound) → §12 Lifecycle Event Catalog
- ✅ Blueprint validation schema (JSON Schema 可執行) → §13

**「有這份 SDD 就能開工實作」驗收**：tier 1/tier 2 yaml schema + JSON Schema validator + Environment/Vault CRUD API + lifecycle 25 events 全節點定義完成。剩餘實作細節（hook producer / S7 validator / Swift UI Vault Keychain Binding）各自走 executor dispatch。

---

## 15. Peer Feedback（R14 批次吸收）

### 15.1 nm SDD-04 Open Questions（xd-tkna, nm commit c8194a0）

**Q1 (→ nb) — credential_refs 解析時機**：
> 是否延遲到 spawn step 3，還是 Blueprint 驗證時（step 1）就先驗 vault 存在？

**nb 答案**：**延遲到 spawn step 3（runtime）解析，但 step 1 blueprint validation 保留「vault 存在性 sanity check」**。

理由：
- Step 1 blueprint schema 驗證（§13 JSON Schema）不需 vault access — 只校格式（`credential_refs: [vault://<vault_id>/<key>]` 字串 pattern 正確）
- Step 1 可做**非侵入式 sanity check**：查 `GET /api/vaults/:id` metadata endpoint（不取 value）確認 vault_id 存在 → 若不存在 `blueprint-schema-invalid` 快失敗
- Step 3 spawn 時才真正透過 `POST /api/vaults/:id/access` 取 value 注入（觸發 Touch ID 授權 / `credential.accessed` event）
- 好處：使用者 UI edit blueprint 時 nc 可即時提示「vault `box-oauth` 不存在，需先建」；spawn 時避免在 agent runtime 內破碎取值失敗

**Q4 (→ nb) — Environment template ownership**：
> Environment template（預製常用組合）屬 nm scope 還是 nb blueprint-like 管理？

**nb 答案**：**屬 nm scope（L3 conductor 範疇）**，nb Blueprint schema 僅保留 `environment_id` reference（不區分「template 實例化產物」vs「手動建的 Environment」）。

理由：
- Template 是「預製組合」本質是 **spawn-time factory pattern**，產出實例化 Environment 後 Blueprint 才能 reference — 屬孵化 lifecycle 而非 blueprint schema
- nb Blueprint schema 對 Environment 只看 id（物件獨立），不需知 template 來源
- nm SDD-04 §3 spawn lifecycle 加「step 0: environment template 實例化（若 blueprint 指向 template_id 而非具體 environment_id）」
- 建議 nm SDD-04 加 `environment_template.*` namespace（created/instantiated/deleted），獨立於 `environment.*` CRUD

### 15.2 ns SDD-02 §11-§15 補齊吸收（xd-nyqb, ns commit 1363542）

ns §11 四物件 CRUD event namespace 完整 enum 與 nb §12 Lifecycle Event Catalog **對齊確認**：
- ✅ `agent.*` 4 events（nb owned）— 符合 nb §12.1
- ✅ `session.*` 2 events（ns owned）— 符合 nb §12.2
- ✅ `environment.*` 5 events（ns owned，ns producer 從 `/api/environments/*` endpoint emit）— 符合 nb §12.3
- ✅ `credential.*` 3 events（nb owned，已 commit ~/.claude 712d436）— 符合 nb §12.4（nb §12.4 列 4 event 含 `credential.deleted`，ns SDD-02 §11 若只列 3 需補）

**cross-check action**：
- nb 將 `credential.deleted` 明示加入 §12.4（已在本 commit 落定）
- 請 ns R15 補 credential.deleted 到 SDD-02 §11 enum（對齊 nb 4 events）
- ns §12 transcript proxy 對 SDD-05 第 5 view 的規範 — nb zero objection（R8-reply 已確認）

### 15.3 nc SDD-00 v3 Wizard chat history（xd-y6oe 回答）

**nc 提問**：agent 建完後 wizard 對話是否存？建議塞 `agent.metadata.creation_history`，可選顯示在 detail header。

**nb 答案**：**不存 Blueprint schema**，走 **Session transcript jsonl** 路徑。

理由：
- Blueprint = 長期 canonical config（穩定）；wizard chat = 一次性建置對話（易變）
- 內嵌 `creation_history` 會使 blueprint 帶使用者原始 prompt — 可能含敏感需求描述 / 貼入的 secret（leak 面擴大）
- 已有 transcript jsonl（`.claude/projects/*/jsonl`）+ nc SDD-05 第 5 view NDJSON 消費路徑就緒

**建議**：`agent.created` payload 可選加 `creation_session_id: <uuid>`（純 reference），UI 需顯示對話摘要時走 SDD-05 transcript view 查該 session_id 渲染前 N 筆。

### 15.4 ns R15 cross-check 閉環（xd a2081dc）

ns SDD-02 §3 15→19 types 擴完成（加 `credential.deleted`）+ §11.2 enum 對齊。**triggers**：nb 下輪 commit `~/.claude/config/event-types/credential.json` 加第 4 event（vault_id / deleted_by / ts payload），走既定 owner-commit-discipline：
1. nb commit canonical credential.json v1 → v2（加 deleted）
2. ns SIGHUP reload verify（預期 whitelist count 19 一致 — 已在 ns 側）
3. ns SDD-02 §3 unit test pass（a2081dc 已覆蓋）

nb 將此列 R16 首要 action（config 檔單一 event 擴，極小 diff）。

### 15.5 nc pending（Phase UX-1）

reference/06 credential_refs 複合路徑命名更新（Phase UX-1 附帶）+ 其餘 hi-fi mockup。

---

## 16. 實作依賴圖（xd-xa8y 驗收補充）

```
Blueprint schema validation (§13)
  ↓ depends on
JSON Schema v1 (§13.1)
  ↓ commit
~/.claude/config/schemas/blueprint.schema.json (待 peer accept)
  ↓ enforce by
hooks/modules/blueprint-validator.js (S7)
  ↓ trigger
  ├─ PreToolUse:Edit/Write (~/.claude/blueprints/*.yaml)
  ├─ POST /api/agents (nova-server ns scope)
  └─ 孵化器 spawn (nm SDD-04 step 1 + step 0 for template)

Agent runtime (spawn step 3)
  ├─ credential_refs resolve (POST /api/vaults/:id/access)
  │   └─ emit credential.accessed (ns redactor 強制)
  ├─ environment_id bind (POST /api/environments/:id/bind)
  │   └─ emit environment.bound (ns)
  └─ output_contract 寫入 (agent runtime)
      └─ emit agent.output_written (nb/nm producer via hook)
```

**責任分工**：
- nb: Blueprint schema + JSON Schema validator + 3 canonical event-types (agent/credential/incubation.json)
- ns: writer + redactor + 4 CRUD endpoints (agents/sessions/environments/vaults) + 5 event-types 擴 §3 白名單
- nm: spawn lifecycle (SDD-04) + environment template + incubation-guardrail.js (S7)
- nc: UI (Screen U 5 tab + 4 物件 CRUD pages) + reference/06 credential_refs 命名對齊

### 15.6 D3 Wizard overlay 重用 AskUserQuestion 全鏈路（nb 佐證）

nb 不 own wizard overlay 實作（nc scope），但 own `~/.claude/rules/元件/AskUserQuestion全鏈路.md` rule。nc Screen U wizard overlay state machine 與既有 AskUserQuestion 鏈路兼容性評估：

**兼容條件**（全部滿足）：
1. Wizard overlay 觸發點走 `PermissionRequest` hook（hook-client.js）
2. hook 內同步 `Bun.spawnSync('curl', ['-X', 'POST', '/api/ask', ...])` 通知 NC
3. hook return `false` 不干擾 CLI 原生 AskUserQuestion 渲染
4. CLI 原生選項 UI 走 `PreToolUse` → SSE broadcast `ask_question` event
5. 使用者回答走 `PostToolUse` → SSE broadcast `ask_answer` event

**若 nc wizard 想走自己獨立 state machine（非 AskUserQuestion 直接復用）**也可：不走 hook 路徑，改用獨立 `/api/wizard/*` endpoint — 但需另設計 SSE broadcast 語意避免重複造輪子。

**nb 建議**：wizard overlay 的「使用者選擇 template / 確認 blueprint 欄位」屬 AskUserQuestion 天然範圍，**強烈建議復用**避免兩套 permission modal UI；wizard overlay 的「自由輸入 prompt」走獨立 `/api/wizard/chat` endpoint（非選項式，不適合 AskUserQuestion）。

## 17. Model Metrics Namespace（R9 已 commit，本節僅 reference）

`model.*` canonical 已於 R9 落地 `~/.claude/config/event-types/model.json`（commit a9db97c），2 events：
- `model.request`（`session_id, turn_id, model_name, input_tokens_est, ts`）
- `model.response`（`session_id, turn_id, model_name, input/output/cache_read/cache_write_tokens, duration_ms, stop_reason, ts`）

**Ownership**：**nb owned**（R9 peer accept 確認，本 SDD 不再補 section — 既存 canonical 已 self-contained）。

**消費路徑**：
- **單 session UI（nc Debug tab）**：走 transcript `message.usage` 非 `model.*` event（ns R8 A 方案）
- **跨 session aggregation（nc Metrics tab + nm daily-report）**：消費 `model.*` event 聚合 cache hit rate / token 趨勢 / cost proxy

**producer**：待 R16+ 實作 `hooks/modules/model-metrics-emitter.js`（PostToolUse 從 transcript `message.usage` derive），本 SDD §9 實作里程碑補充項。
