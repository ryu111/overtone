---
active: true
iteration: 1
session_id: 87ccc987-6a12-4984-b866-fb14792e4578
max_iterations: 100
completion_promise: "DONE"
started_at: "2026-04-11T18:28:15.843Z"
---

context-injector.js L642-656 的驗收提醒改為帶 reviewer 具體指令。現在只是文字提醒，要改為：注入完整的 reviewer agent dispatch 指令（包含 project path、dispatch ID、原始 prompt、回報 summary）。讓 Manager 收到後能直接 copy-paste 執行 reviewer。同時把注入的文字中加入 dispatch 的具體資訊（從 input.prompt 中解析 dispatch ID 和 project name）。bun test 0 fail + git push。

═══════════════════════════════════════════
CRITICAL RULE — Ralph Loop
═══════════════════════════════════════════
你在 ralph-loop 中。只有當上述任務**真正完成**時才可輸出：
  <promise>DONE</promise>
不可說謊退出。未完成就繼續工作。
═══════════════════════════════════════════
