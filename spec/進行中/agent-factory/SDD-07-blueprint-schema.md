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
- Credentials **永不放 Blueprint**，另建 Credential Vault 物件，Blueprint 用 `credential_refs: [<vault_id>:<key>]` 引用

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
  - <vault_id>:<key>
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
environment_id: nova-default-env

# Environment 物件（nc Screen 1.2 + Environments 列表頁）
# 存放位置: ~/.claude/environments/<env_id>.yaml
environment_id: nova-default-env
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
  - box-oauth:access_token
  - box-oauth:refresh_token
  - github-pat:read          # 支援一 Vault 多 key (least-privilege)
```

**命名選定**：`credential_refs: [<vault_id>:<key>]` 複合路徑（R13 定案，取代早期 `credential_vault_refs` 僅 vault_id 版本）。理由：一 Vault 可多 key（如 github-pat 同時含 read/write token）+ least-privilege（agent 只取需要 key）+ UI 可簡化只顯 `vault_id` 作 label 隱藏 `:<key>` 尾綴。

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
