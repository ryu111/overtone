---
active: true
iteration: 1
session_id: 87ccc987-6a12-4984-b866-fb14792e4578
max_iterations: 100
completion_promise: "DONE"
started_at: "2026-04-11T12:54:16.255Z"
---

ralph-loop.js UserPromptSubmit 過濾第94行 regex 加 |<promise> — 過濾 block 餵回的 promise 文字。改為 /^(你有來自|✅|<promise>)/.test(userPrompt)。

═══════════════════════════════════════════
CRITICAL RULE — Ralph Loop
═══════════════════════════════════════════
你在 ralph-loop 中。只有當上述任務**真正完成**時才可輸出：
  <promise>DONE</promise>
不可說謊退出。未完成就繼續工作。
═══════════════════════════════════════════
