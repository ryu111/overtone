# BDD-01 Staging Classifier Test (Gherkin)

> **Status**: Draft (Round 4 initial canonical)
> **Owner**: nb
> **Target file**: `nova-brain/tests/unit/staging-classifier.test.js` + `~/.claude/hooks/modules/staging-classifier-guard.js`
> **Dependency**: SDD-01 階段紀律（canonical 白名單 + stage 標記格式）

## Feature: Staging Classifier Hook 守護 Contract-only 路徑

作為 全域元件守門人
我要 在 Edit/Write canonical 路徑時檢查 stage 標記
以便 阻止 v0.5 式搶先 commit canonical runtime contract

### Background

```gherkin
Given canonical 白名單 config ~/.claude/config/staging-canonical.json 存在並含:
  | path                                         |
  | ~/.claude/config/event-types/*.json           |
  | ~/.claude/config/hook-block-reason-codes.json |
  | ~/.claude/docs/protocols/*.md                 |
And 排除清單含:
  | path                       |
  | ~/.claude/rules/*.md        |
  | ~/.claude/CLAUDE.md         |
  | spec/討論/*.md              |
```

### Scenario 1: 🔵 Contract-only 路徑含 stage 標記 + peer_accept → pass

```gherkin
When 對 ~/.claude/config/event-types/dispatch.json 發起 Edit
  And session commit message 含 "stage: 🔵 peer_accept: xd-abc123"
Then staging-classifier-guard 回 {decision: "allow"}
```

### Scenario 2: 🔵 Contract-only 路徑缺 stage 標記 → block

```gherkin
When 對 ~/.claude/config/event-types/hook.json 發起 Edit
  And session 無 stage 標記也無 escape env
Then staging-classifier-guard 回 {decision: "block"}
  And systemMessage 含 "Contract-only 路徑需 stage 標記"
  And systemMessage 指向 SDD-01 §6
```

### Scenario 3: 🔵 路徑 + escape env `NOVA_STAGING_OVERRIDE=1` → pass

```gherkin
Given 環境變數 NOVA_STAGING_OVERRIDE=1
When 對 ~/.claude/docs/protocols/cross-dispatch-protocol.md 發起 Write
  And 無 stage 標記
Then staging-classifier-guard 回 {decision: "allow"}
  And debug log 記「staging override active」
```

### Scenario 4: 排除路徑（rule） → 不觸發

```gherkin
When 對 ~/.claude/rules/協作/階段紀律.md 發起 Edit
  And 無 stage 標記
Then staging-classifier-guard 回 {decision: "allow"}
  And 不檢查 stage 標記（rules 獨立治理）
```

### Scenario 5: 排除路徑（CLAUDE.md） → 不觸發

```gherkin
When 對 ~/.claude/CLAUDE.md 發起 Edit
Then staging-classifier-guard 回 {decision: "allow"}
```

### Scenario 6: 非 canonical 路徑（spec/討論） → 不觸發

```gherkin
When 對 ~/projects/nova-brain/spec/討論/agent-factory.md 發起 Write
Then staging-classifier-guard 回 {decision: "allow"}
```

### Scenario 7: 🔵 路徑 + stage 標記但無 peer_accept / escape / shadow → block

```gherkin
When 對 ~/.claude/config/event-types/dispatch.json 發起 Edit
  And session commit message 含 "stage: 🔵" 但缺 peer_accept/escape/shadow
Then staging-classifier-guard 回 {decision: "block"}
  And systemMessage 含 "需 peer_accept: <id> 或 escape: <明示> 或 shadow: <diff_ref>"
```

### Scenario 8: diff 空（無實際改動） → 不觸發

```gherkin
When 對 canonical 路徑發起 Edit 但 diff 為空
Then staging-classifier-guard 回 {decision: "allow"}
```

## Feature: Stage 多標籤 commit message

### Scenario 9: `stage: 🟢+🔵` 多標籤允許

```gherkin
When commit message 含 "stage: 🟢+🔵 peer_accept: xd-xxx"
  And 動 canonical + 加新檔案
Then 守護 pass
```

### Scenario 10: `stage: 🟢+🟡+🔵` 三標籤 → 警告但不 block（SDD-01 §11 未決）

```gherkin
When commit message 含 "stage: 🟢+🟡+🔵"
Then 守護 pass（當前政策）
  But systemMessage 含 "建議單一 dominant 階段"（SDD-01 §11 未決議題）
```

## Feature: staging-precommit 第二層守護

### Scenario 11: pre-commit 檢 staged diff 含 canonical 但 commit -m 缺 stage → exit 1

```gherkin
Given .git/hooks/pre-commit → bun ~/.claude/hooks/scripts/staging-precommit.js
When git commit -m "feat: add event type" (無 stage 標記)
  And staged diff 含 ~/.claude/config/event-types/session.json 改動
Then pre-commit hook exit 1
  And stderr 含 "Contract-only 路徑需 stage 標記"
```

### Scenario 12: pre-commit 通過 + post-commit reviewer 抽樣

```gherkin
Given post-commit reviewer-enforcer 20% 抽樣
When commit 含 canonical 改動 + stage 標記但 peer_accept id 不存在
Then reviewer findings 要求補有效 peer_accept
```

## Test 實作注意

- 用 `NOVA_STAGING_CANONICAL_PATH` env 指向測試專用白名單 config（避免動 prod）
- fixture 用 `mkdtempSync` 建 temp canonical.json
- 每 case 獨立 session（beforeEach clear staging state）
- 總 test case 數 ≥ 12

## 成功判準

- 12 case 全 pass
- architecture.test.js 掃出 `staging-classifier-guard.js` 已接 LOCAL_MODULES (PreToolUse:Edit + PreToolUse:Write)
- SDD-01 §6 三層全部有對應 test（本 BDD 覆蓋第 1+2 層，reviewer-enforcer 第 3 層在 B2 覆蓋）
