## 技術摘要（What & Why）

- **方案**：Skill-only 設計。建立 `plugins/overtone/skills/status/SKILL.md`，由 Main Agent 依 skill 指引透過 Read + Bash 收集系統資訊並格式化輸出。不建立任何 script。
- **理由**：status 資訊分散在多個檔案和 registry，Main Agent 可以直接用 Read 工具讀取這些來源，建立 script 的維護成本高於收益。此外，skill 本身是 `disable-model-invocation: true`（使用者手動觸發），不需要 model 自動判斷何時呼叫。
- **取捨**：不即時執行 `bun test`（700+ 測試需數秒），改為讀取 `docs/status.md` 的靜態數字 + 提示使用者可手動執行。接受數字可能不是最新的。

## API 介面設計

### Skill 介面

不涉及程式碼 API。Skill 是純 Markdown 指引，Main Agent 依指引收集資訊。

### 輸入

無輸入參數。使用者輸入 `/ot:status` 觸發。

### 輸出格式

Skill 指引 Main Agent 產出以下格式：

```
Overtone v{version}

[系統]
  Agent: {n} | Stage: {n} | Workflow: {n} | Hook: {n} | Skill: {n}

[當前 Session]
  ID: {sessionId}
  Workflow: {type}（{label}）
  進度: {STAGE1} done > {STAGE2} active > {STAGE3} pending
  （若無活躍 session 則顯示「無活躍 session」）

[測試]
  {pass} pass / {fail} fail / {files} files（來源：docs/status.md）

[Specs]
  In-progress: {featureNames}
  （若無則顯示「無進行中 feature」）
```

## 資料模型

無新資料模型。全部讀取既有資料：

| 資訊 | 來源檔案 | 讀取方式 |
|------|---------|---------|
| Plugin 版本 | `plugins/overtone/.claude-plugin/plugin.json` | Read → JSON → `version` |
| Agent 數量 | `plugins/overtone/scripts/lib/registry.js` | Read → 計算 `agentModels` 物件 key 數量 |
| Stage 數量 | `plugins/overtone/scripts/lib/registry.js` | Read → 計算 `stages` 物件 key 數量 |
| Workflow 數量 | `plugins/overtone/scripts/lib/registry.js` | Read → 計算 `workflows` 物件 key 數量 |
| Hook 數量 | `plugins/overtone/hooks/hooks.json` | Read → JSON → `hooks.length` |
| Skill 數量 | `plugins/overtone/skills/*/SKILL.md` | Bash: `ls -d plugins/overtone/skills/*/SKILL.md \| wc -l` |
| Session ID | `~/.overtone/.current-session-id` | Read（可能不存在） |
| Workflow 狀態 | `~/.overtone/sessions/{id}/workflow.json` | Read → JSON → stages 各狀態 |
| 測試統計 | `docs/status.md` | Read → 解析核心指標表格 |
| Specs 進度 | `specs/features/in-progress/` | Bash: `ls specs/features/in-progress/` |

## 檔案結構

```
新增的檔案：
  plugins/overtone/skills/status/SKILL.md  ← 新增：/ot:status skill 定義

修改的檔案：
  docs/status.md                           ← 修改：Skill 數量 30 → 31
  CLAUDE.md                                ← 修改：Skill 數量 30 → 31
```

## 關鍵技術決策

### 決策 1：Skill-only vs Script + Skill

- **Skill-only**（選擇）：Main Agent 直接用 Read + Bash 收集資訊 — 優點：零維護成本、零依賴、即時可用
- **Script + Skill**（未選）：建立 `scripts/status.js` 集中收集 — 原因：增加維護負擔，registry.js 和 paths.js 的 import 在 skill 層不需要程式化封裝

### 決策 2：即時 bun test vs 靜態數字

- **靜態數字**（選擇）：從 `docs/status.md` 讀取已知結果 — 優點：即時回應、不阻塞
- **即時 bun test**（未選）：每次 status 都跑 700+ 測試 — 原因：耗時 5+ 秒，查狀態不應有副作用

### 決策 3：是否新增 Specs 區塊

- **新增 Specs 區塊**（選擇）：顯示 `specs/features/in-progress/` 下的 feature — 優點：status 快照更完整，使用者一眼看到進行中的功能
- **不顯示 Specs**（未選）：原因：Specs 是 Overtone 重要子系統，使用者需要知道目前有什麼在進行中

## 實作注意事項

- SKILL.md 的 frontmatter 必須設定 `disable-model-invocation: true`（使用者手動觸發，不由 model 自動觸發）
- 輸出不使用 emoji（遵循 CLAUDE.md 規則）
- 讀取 `~/.overtone/.current-session-id` 時要處理檔案不存在的情況（無活躍 session）
- registry.js 的數量計算：Main Agent 讀取檔案後可以直接在 Bash 中用 node 單行指令取得，如 `node -e "const r = require('./scripts/lib/registry'); console.log(Object.keys(r.stages).length)"`
- `docs/status.md` 的測試數字可能不是最新（上次 commit 時更新），skill 應提示使用者可用 `bun test` 確認最新結果
- Skill 的步驟順序：先讀取多個來源（可並行 Read），再格式化輸出
