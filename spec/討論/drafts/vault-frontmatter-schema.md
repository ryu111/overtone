# DRAFT — Vault Frontmatter Schema Spec

**狀態**：draft（Stage 0 完工前置，Round 2 同意獨立 spec）
**目的**：統一 Obsidian vault 所有 indexed md 的 frontmatter schema，對齊 Karpathy BP #4（summary line + tags give LLM quick relevance signal）
**範圍**：`~/.claude/` 所有 vault_root=A 下 indexed md（`.obsidianignore` 過濾後 ~271 檔）
**擁有者提交紀律**：本 draft 不 apply 到 md，等 Round 2 review 後 Stage 1 執行

---

## 一、schema 設計原則

1. **必填最小化**：只有「LLM 決策時真需要」的欄位設必填，其他選填
2. **向後相容**：既有 rules/skills frontmatter（`name/description/type`）向前相容為子集
3. **validator 可程式化**：全部欄位須能被 tests/unit/architecture.test.js 驗證
4. **ADR 例外**：ADR h1 後的 ```yaml block 保留（非 top-level frontmatter）— 本 schema 管 top-level 那層，ADR 特殊結構獨立存在

---

## 二、schema 定義

### 2.1 必填欄位（Core，所有 indexed md MUST 包含）

```yaml
---
name: <string>         # 短名稱（檔案標題或功能一句話）
description: <string>  # 一段 summary（≤ 200 char），LLM 判斷 relevance 用
type: <enum>           # 類型：rule / skill / agent / command / adr / incident / reflection / wiki / doc / readme / other
---
```

**enum `type` 值**（與目錄對應）：

| type | 對應目錄 | 舉例 |
|------|---------|------|
| rule | `rules/*/*.md`（非 README）| 深度路由 / 並行執行 |
| skill | `skills/*/SKILL.md` | auto / model-cascade |
| agent | `agents/*.md` | executor / planner / reviewer |
| command | `commands/*.md` | ask / audit |
| adr | `obsidian/semantic/architecture-decisions/*.md` | ADR-003-006 |
| incident | `obsidian/episodic/incidents/*.md` | xd-*-incident.md |
| reflection | `obsidian/raw/reflections/*.md` | 2026-W17-synthesis.md |
| wiki | `obsidian/wiki/**/*.md` | feedback-loop/protocols.md |
| doc | `docs/*.md` + `obsidian/CLAUDE.md` | state-of-nova.md |
| readme | 所有 `README.md` | rules/README.md |
| other | 其他未分類 | — |

### 2.2 選填欄位（Extended）

```yaml
---
# ... 必填 ...
tags: [<string>, ...]     # LLM 關聯用（e.g. ["cross-session", "dispatch"]）
summary: <string>         # description 之外的深度摘要（用於 semantic compile 時當種子）
related: [<md path>, ...] # backlink（Obsidian 也吃 [[...]]，但 frontmatter related 讓 grep 更方便）
status: <enum>            # active / deprecated / draft / superseded
created_at: <ISO date>    # YYYY-MM-DD
updated_at: <ISO date>    # YYYY-MM-DD
---
```

**選填使用時機**：

| 欄位 | 必要場景 |
|------|---------|
| tags | type=wiki / incident / reflection（主題聚類用）|
| summary | type=adr / wiki（semantic-distill Stage 4 原料用）|
| related | type=adr（related_adrs 已有，轉 canonical）/ incident（事件 → 修復 rule）|
| status | type=rule / skill / adr（deprecated 可被 validator 挑出）|
| created_at / updated_at | type=incident / reflection（時序相關）|

### 2.3 type 專屬欄位（擴展命名空間）

某些 type 有額外欄位，保留命名空間避免衝突：

```yaml
# skill 專屬
metadata:
  pattern: <enum>           # pipeline / interrupter / knowledge / triggered
  user-invocable: <boolean> # 使用者能否 /invoke
harness_pillar: <enum>      # Guide / Sensor / Closed-Loop（agent-harness.md 定義）
layer: <enum>               # L0 / L1 / L2 / L3 / L4 / L5

# rule 專屬
harness_pillar: <enum>
layer: <enum>

# adr 專屬（不在 top frontmatter，在 h1 後 yaml block — 本 schema 豁免此 case）
# incident 專屬
incident_id: <string>       # xd-*** 或手動 ID
severity: <enum>            # low / medium / high / critical

# reflection 專屬
trigger_type: <enum>        # correction / autonomous / scheduled
```

---

## 三、既有 md 對齊評估

### rules/*.md（30 檔）

**現況範例**（`rules/核心/深度路由.md`）：
```yaml
---
name: 深度路由
description: D0-D4 深度分類 HARD GATE、委派原則、model 選擇條款
type: rule
---
```
**評估**：✅ **Core 完全對齊**。可選加 `harness_pillar` / `layer` / `status`（非必要）。

### skills/*/SKILL.md（~35 檔）

**現況範例**（`skills/auto/SKILL.md`）：
```yaml
---
name: auto
description: 深度路由決策。...
metadata:
  pattern: pipeline
  user-invocable: false
---
```
**評估**：⚠️ **缺 `type: skill`**。Stage 1 需 batch add `type: skill`（一行修正）。

### ADR-*.md（4+ 檔 canonical ADR + 幾個草稿）

**現況範例**（`ADR-003`）：
- h1 title + `**狀態**：...`（非 frontmatter）
- 接 ```yaml block 含 adr_number / title / status / date / ...

**評估**：❌ **無 top-level frontmatter**。2 路徑：
- (a) 加 top-level frontmatter（`name/description/type: adr`），yaml block 保留作「詳細 metadata」
- (b) 接受 ADR 特殊結構，schema validator 豁免 ADR type

**nb 建議走 (a)**：雙層 yaml 不會衝突（top-level Obsidian 吃 / ```yaml block 純文件內容）。

### obsidian/ 內部（semantic/ episodic/ working/ raw/ wiki/ 共 ~144 檔）

**現況**：大部分**無 frontmatter**。
**評估**：需 Stage 1 搬遷時 batch add。

### docs/*.md（3 檔）

**現況**：待檢查。預期無 frontmatter，Stage 1 batch add。

### README.md（7 個，Round 5 Q 定義）

**現況**：Round 5 Q 新建 7 個 README 均是 type=readme。**Stage 1 Q 補齊時即加 frontmatter**。

---

## 四、validator 實作（extend tests/unit/architecture.test.js）

### 4.1 測試新增

**測試檔**：`~/projects/nova-brain/tests/unit/vault-frontmatter.test.js`（新建）

**覆蓋**：
1. 所有 indexed md（.obsidianignore 過濾後）必含 Core 3 欄位
2. `type` 必在 enum
3. `type=skill` 必有 `metadata.pattern` + `metadata.user-invocable`
4. `type=adr` 必有 top-level frontmatter（不只 yaml block）
5. `status=deprecated` md 給警告列表（不 fail，Stage 3 清點用）

**測試 Pseudocode**：
```javascript
import { readFileSync } from "node:fs";
import { glob } from "fs/promises";
import { homedir } from "node:os";

const IGNORE_PATTERNS = /* parse ~/.claude/.obsidianignore */;
const TYPE_ENUM = ["rule", "skill", "hook", "agent", "command", "adr", "incident", "reflection", "wiki", "doc", "readme", "other"];

for (const md of await glob("~/.claude/**/*.md")) {
  if (matchesIgnore(md, IGNORE_PATTERNS)) continue;
  const frontmatter = parseFrontmatter(readFileSync(md, "utf8"));
  expect(frontmatter.name, md).toBeString();
  expect(frontmatter.description, md).toBeString();
  expect(TYPE_ENUM).toContain(frontmatter.type);
  if (frontmatter.type === "skill") {
    expect(frontmatter.metadata?.pattern).toBeString();
    expect(frontmatter.metadata?.["user-invocable"]).toBeBoolean();
  }
}
```

### 4.2 既有 architecture.test.js 對比

當前 `architecture.test.js` (464 tests) 驗的是：
- hook 存在性 + 連接完整性
- rule 檔存在性（特定 rule 名稱）
- skill SKILL.md 存在
- cross-reference 驗證

**未驗**：frontmatter schema（本 validator 補）。

### 4.3 執行策略

- Stage 1 搬遷 + batch add frontmatter 時，每搬一類跑一次 validator（早失敗）
- Stage 1 完工 Gate 包含「validator 0 fail」（新 frontmatter schema 驗通過）
- Stage 3 清點時用 `status=deprecated` 警告列表挑淘汰候選

---

## 五、Stage 1 實作影響

### batch add frontmatter 工時

| 對象 | 檔數 | 動作 | 工時 |
|------|:---:|------|:---:|
| rules（已對齊 Core）| 30 | 可選加 `harness_pillar` + `layer`（非必要）| 0（略）|
| skills（缺 type: skill）| 35 | batch add `type: skill` 一行 | 0.2d |
| ADR（無 top-level）| 4+ | add top-level frontmatter（name/description/type）| 0.2d |
| obsidian/semantic | ~30 | add Core 3 欄位 + type 映射 | 0.5d |
| obsidian/episodic | ~15 | 同 + incident_id / severity 若有 | 0.3d |
| obsidian/raw | ~20 | 同 + trigger_type / created_at | 0.3d |
| obsidian/working | ~20 | 同 | 0.3d |
| obsidian/wiki | ~50 | 同 + tags | 0.5d |
| docs | 3 | 同 | 0.1d |
| README（7 個新）| 7 | Round 5 Q 寫入時已含 | 0 |
| **合計** | ~214 | — | **2.4d** |

**備註**：原 Round 5 Plan C Stage 1 估 6-8d，frontmatter 統一加 2.4d，Stage 1 修正估 **7-10d**（Round 5 P 低估 frontmatter 工時）。

### 與 ADR Revised v2 draft L218 對應

ADR Revised v2 §Stage 1 Scope 「frontmatter schema 統一（Karpathy BP #4）」本 spec 是其獨立化輸出。Stage 0 完工 dispatch 時同步更新 ADR Revised v2 Stage 1 工時估（7-10d）。

---

## 六、Rollback 考量

若 schema 實作後發現：

| 問題 | Rollback 策略 |
|------|-------------|
| type enum 缺值 | 加 `other` 臨時收納 + Round N+1 補 enum |
| validator false positive | `tests/unit/vault-frontmatter.test.js` 加 exclude list（具名檔）+ 追蹤為技術債 |
| batch add 出錯 | git revert batch commit，Stage 1 重跑 |
| Obsidian 顯示 frontmatter 為內容干擾 | 確認 `.obsidianignore` / Obsidian Settings 顯示行為（不渲染 frontmatter 預設）|

---

## 七、開放問題（Round 2+ discussion）

- **Q1**：ADR 是否走 (a) 加 top-level frontmatter 還是 (b) validator 豁免？nb 推薦 (a)，Manager view?
- **Q2**：既有 rules/ 30 檔已 Core 對齊，Stage 1 是否**強制**加 `harness_pillar` + `layer`？或作為選填留給未來補？nb 推薦選填（YAGNI，rules/核心/agent-harness.md 已明示守則但非強制 frontmatter 欄位）。
- **Q3**：`status=deprecated` 是否需新 hook（PreToolUse 讀 deprecated 警告 AI）還是只 validator 挑出？nb 推薦後者（Stage 3 清點時 consumer，不需 runtime hook）。
- **Q4**：`updated_at` 欄位需自動化（git commit 後 hook 更新）還是人工維護？nb 推薦**不寫**（`git log` 是 SoT，frontmatter 寫 updated_at 必 drift）。

---

## Backlinks

- ADR-001 Revised v2 draft: `spec/討論/drafts/ADR-revised-stage-0.md` §Stage 1 Scope
- Karpathy 研究 BP #4: `~/projects/nova-manager/spec/討論/external-research-karpathy-wiki-2026-04.md`
- Stage 1 Round 1 challenge: `spec/討論/vault-layer3-stage-1-nb-round1.md` §挑戰 3
- Manager Round 2 ack: `~/projects/nova-manager/spec/討論/vault-layer3-stage-1-manager-round2.md` R1-Q3
- 既有 tests: `~/projects/nova-brain/tests/unit/architecture.test.js`
