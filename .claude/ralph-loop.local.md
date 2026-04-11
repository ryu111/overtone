---
active: true
iteration: 1
session_id: 87ccc987-6a12-4984-b866-fb14792e4578
max_iterations: 100
completion_promise: "DONE"
started_at: "2026-04-11T18:41:48.806Z"
---

修 flow-observer.js PostCompact handler：加 handoff 讀取提醒到 additionalContext。目前 PostCompact（L707-732）只做摘要品質檢查，沒告訴 AI 讀 handoff。改法：不論 warnings 有無，additionalContext 都附加一行「請用 Bash 執行 cat /tmp/nova-handoff-{project}.md 讀取工作狀態後繼續」。project 從 input.cwd 取。這樣手動 /compact 也能收到提醒，不依賴 self-compact.js。dispatch id: xd-1775932856566-kh4q

═══════════════════════════════════════════
CRITICAL RULE — Ralph Loop
═══════════════════════════════════════════
你在 ralph-loop 中。只有當上述任務**真正完成**時才可輸出：
  <promise>DONE</promise>
不可說謊退出。未完成就繼續工作。
═══════════════════════════════════════════
