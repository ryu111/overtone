---
status: archived
archivedAt: 2026-03-05T05:27:21.576Z
---
# Agent Prompt 四模式補齊 — 任務清單

## 驗收標準

- [ ] 14 個 agent 都有信心過濾（適用者）、邊界清單（適用者）、誤判防護章節
- [ ] 誤判防護位置統一（DON'T 後、輸入前）
- [ ] `validate-agents.js` 全部通過
- [ ] grader 保持精簡（不超過原有行數 30%）

## Dev Phases

### Phase 1: 類型 A — 只加誤判防護（6 個 agent）(parallel)
- [ ] architect：在 DON'T 後加誤判防護（4 條：codebase pattern / over-engineering / 抽象時機 / 並行判斷）| files: plugins/overtone/agents/architect.md
- [ ] debugger：在 DON'T 後加誤判防護（4 條：2 假設 / stack trace / mock / flaky）| files: plugins/overtone/agents/debugger.md
- [ ] developer：在 DON'T 後加誤判防護（3 條：Open Questions / test fail / pass≠全覆蓋）| files: plugins/overtone/agents/developer.md
- [ ] planner：在 DON'T 後加誤判防護（4 條：需求≠解法 / 粒度 / 技術決策留 architect / 並行）| files: plugins/overtone/agents/planner.md
- [ ] retrospective：在 DON'T 後加誤判防護（4 條：不重複 reviewer / retroCount / ISSUES / PASS）| files: plugins/overtone/agents/retrospective.md
- [ ] tester：在 DON'T 後加誤判防護（4 條：框架確認 / pass≠正確 / FAIL / weak assertion）| files: plugins/overtone/agents/tester.md

### Phase 2: 類型 B + C — 加信心過濾 + 誤判防護（7 個 agent）(parallel)
- [ ] build-error-resolver：加信心過濾（warning≠error / deprecation / test fail）+ 誤判防護 | files: plugins/overtone/agents/build-error-resolver.md
- [ ] designer：加信心過濾（色彩量測 / 個人偏好）+ 誤判防護（色彩映射 / 規格≠碼 / 元件確認）| files: plugins/overtone/agents/designer.md
- [ ] doc-updater：加信心過濾（有直接對應才更新）+ 誤判防護（任何變更 / status 數字 / roadmap）| files: plugins/overtone/agents/doc-updater.md
- [ ] e2e-runner：加信心過濾（只為 BDD spec 寫）+ 誤判防護（@ref / headless / DOM 可見性 / flaky）| files: plugins/overtone/agents/e2e-runner.md
- [ ] qa：加信心過濾（≥80% 才 FAIL）+ 誤判防護（QA 問題≠dev 錯 / 邊界行為 / smoke）| files: plugins/overtone/agents/qa.md
- [ ] refactor-cleaner：加信心過濾（≥90% 才刪除）+ 誤判防護（knip / peer dep / build）| files: plugins/overtone/agents/refactor-cleaner.md
- [ ] claude-developer：加信心過濾（閉環確認）+ 誤判防護（hook event 名 / warning）| files: plugins/overtone/agents/claude-developer.md

### Phase 3: 類型 D + 信心過濾only — grader + security-reviewer (parallel)
- [ ] grader：加邊界清單 + 信心過濾 + 誤判防護（極精簡版，不改 maxTurns 和 tools）| files: plugins/overtone/agents/grader.md
- [ ] security-reviewer：只加信心過濾（Critical 必報 / Medium ≥70% / Low ≥80% / 理論風險不報）| files: plugins/overtone/agents/security-reviewer.md

### Phase 4: 驗證（sequential, depends: 1,2,3）
- [ ] 執行 validate-agents.js 確認全部 18 個 agent 格式正確 | files: （唯讀驗證）
