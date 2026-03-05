# Skill Forge Engine — L3.3 自主能力建構引擎

`skill-forge-engine`

## 需求背景（Why）

- **問題**：Overtone 目前的知識擴展路徑是「人工建立 skill」。當系統遇到 knowledge-gap-detector 無法路由的知識片段（score < 0.2），只能記錄 gap-observation，但沒有後續行動。系統面對真正未知的領域時是靜態的，無法自我擴展。
- **目標**：實現 L3 「自我進化」的核心能力 — 系統偵測到知識缺口時，能自主從 codebase 萃取相關知識、建立新 skill、驗證結構正確性，整個過程無需人工介入。
- **Phase 範圍**：Phase 1 只使用 codebase 內部知識（現有 instinct observations、既有 skills 模式、CLAUDE.md、registry.js）。Phase 2（WebFetch 外部研究）在後續佇列項執行。
- **真質變意義**：L3.1（gap detection）和 L3.2（auto-fix）是修補已知結構缺口。L3.3 是第一次讓系統獲得設計時不存在的能力 — 類比免疫系統遇到新病毒，自己產生抗體。

## 使用者故事

```
身為 Overtone 系統
當知識路由器遇到無法分類的知識片段（score < 0.2）
且 forge 模式啟用（非 dry-run）
我想要自動研究 codebase、建立新的 skill domain
以便後續相同領域的知識能被正確路由和利用
```

```
身為 Overtone 開發者
我想要執行 bun scripts/evolution.js forge <domain> [--execute]
以便手動觸發特定 domain 的 skill forge，在 dry-run 模式下預覽會建立什麼
```

```
身為 Overtone 系統
當 forge 嘗試建立一個已存在的 skill
我想要系統拒絕操作並報告衝突
以便不覆蓋或破壞現有 skill
```

## 範圍邊界

### 在範圍內（In Scope）

- `plugins/overtone/scripts/lib/skill-forge.js`：核心引擎（知識萃取 → manage-component.js create skill → 結構驗證）
- `plugins/overtone/scripts/lib/knowledge/knowledge-gap-detector.js`：補齊 3 個缺失 domain 關鍵詞（os-control、autonomous-control、craft）
- `plugins/overtone/scripts/evolution.js`：新增 `forge` 子命令
- 安全邊界：不覆蓋既有 skill、dry-run 預設、連續失敗暫停機制
- 單元測試：skill-forge.js 核心邏輯
- 整合測試：forge 子命令端到端（dry-run + execute）

### 不在範圍內（Out of Scope）

- WebFetch 外部知識研究（Phase 2，後續佇列項）
- Agent 自動建立（forge 只建立 skill，不建立 agent）
- hook 整合（自動觸發 forge 於 UserPromptSubmit 或 SubagentStop）— 留待 L3.5
- Dashboard 可視化 forge 狀態

## 子任務清單

1. **knowledge-gap-detector.js 補齊 3 個 domain**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/knowledge/knowledge-gap-detector.js`
   - 說明：在 DOMAIN_KEYWORDS 物件新增 `os-control`、`autonomous-control`、`craft` 三個 domain 的關鍵詞表（各約 10-15 個關鍵詞）。關鍵詞來源：參考對應的 SKILL.md（`skills/os-control/SKILL.md`、`skills/autonomous-control/SKILL.md`、`skills/craft/SKILL.md`）的描述和資源索引。完成後更新頂部的文檔注釋（12/15 → 15/15）。

2. **skill-forge.js 引擎核心**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/skill-forge.js`（新建）
   - 說明：建立核心 forge 引擎。主要 API：`forgeSkill(domainName, context, options)`，options 包含 `{ dryRun: true, pluginRoot? }`。流程：(a) 前置檢查 — 確認 domain 不在現有 skill 清單中（讀 skills/ 目錄），若已存在回傳 `{ status: 'conflict' }` (b) 知識萃取 — 掃描 codebase 內的相關資訊：現有 skills 的 SKILL.md 模式（提取 frontmatter 格式）、instinct auto-discovered.md、CLAUDE.md 中相關段落 (c) 組裝 SKILL.md 內容 — 參照現有 skill 格式，產出含有 `description`、消費者表、資源索引佔位的 SKILL.md body (d) dry-run 分支 — 回傳預覽物件不執行任何 fs 操作 (e) execute 分支 — 呼叫 `manage-component.js create skill` 建立 skill (f) 結構驗證 — 呼叫 `validate-agents.js` 確認 0 error (g) 連續失敗計數 — 維護 `consecutiveFailures` 狀態，達到 `maxConsecutiveFailures`（預設 3）時回傳 `{ status: 'paused' }` 並停止繼續嘗試。

3. **evolution.js 新增 forge 子命令**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/evolution.js`
   - 說明：在 evolution.js 加入 `forge` 子命令解析。用法：`bun scripts/evolution.js forge <domain> [--execute] [--dry-run] [--json]`。預設 dry-run。解析 positional[1] 作為 domain 名稱，domain 必填（缺少時 printUsage + exit 1）。呼叫 skill-forge.js 的 `forgeSkill()`。輸出格式：文字（預設）和 JSON（--json flag）。更新 printUsage() 加入 forge 子命令說明。更新 VALID_FIX_TYPES 旁邊新增 `VALID_FORGE_DOMAINS` 常數（15 個 domain 名稱清單）。

4. **skill-forge.js 單元測試**
   - 負責 agent：tester
   - 相關檔案：`tests/unit/skill-forge.test.js`（新建）
   - 說明：測試核心邏輯。至少涵蓋：(a) dry-run 模式不觸發 fs 操作，回傳預覽物件 (b) conflict 偵測 — domain 已存在時回傳 `{ status: 'conflict' }` (c) 連續失敗暫停 — consecutiveFailures 達到上限時回傳 `{ status: 'paused' }` (d) 知識萃取產出合法的 SKILL.md 格式（body 含必要 section） (e) execute 模式呼叫 manage-component.js（用 Bun.spawnSync mock）。

5. **evolution.js forge 子命令整合測試**
   - 負責 agent：tester
   - 相關檔案：`tests/integration/evolution-forge.test.js`（新建）
   - 說明：端到端測試 forge 子命令。涵蓋：(a) `forge <domain>` 預設 dry-run — exit 0，輸出包含預覽資訊 (b) `forge` 缺少 domain 參數 — exit 1 (c) `forge <already-exists-domain>` — exit 1，輸出衝突訊息 (d) `forge <domain> --json` — 輸出合法 JSON。execute 模式的整合測試用一個不存在的假 domain 名稱（如 `test-forge-temp`），測試後清理產生的 skill 目錄。

## 開放問題

- **知識萃取策略的深度**：codebase 掃描要讀哪些來源？現有方案是 SKILL.md 模式 + auto-discovered.md + CLAUDE.md。是否需要加入 instinct observations（`~/.overtone/sessions/*/observations.jsonl`）？（建議 architect 評估 — observations 路徑跨 session，掃描成本較高。）
- **SKILL.md body 品質**：自動生成的 SKILL.md 必然比人工撰寫的粗糙。最低可用標準是什麼？建議 architect 定義：至少要有「消費者表（即使空的）」和「resources 佔位」，結構驗證通過即可，內容品質留給後續人工補充。
- **forge 子命令的 exit code**：dry-run 成功（有預覽）是 exit 0 還是 exit 1（類似 analyze 有缺口就 exit 1）？建議 architect 決定語義，目前傾向 dry-run 的 exit 0 = 「forge 能執行（domain 不衝突）」。
- **consecutiveFailures 狀態持久化**：連續失敗計數是只在單次 CLI 呼叫內計算（記憶體），還是持久化到 `~/.overtone/forge-state.json`？（建議 architect 決定，Phase 1 傾向記憶體內即可。）
