---
name: debugging
description: 除錯方法論與根因分析框架：RCA 五步法、JS 錯誤模式庫、Bug 重現清單、並發問題診斷指南。
disable-model-invocation: true
user-invocable: false
---

# Debugging 知識域

> 來源：Overtone 除錯標準作業程序

## 消費者

| Agent | 用途 |
|-------|------|
| debugger | 進行根因分析時，按 RCA 五步法和魚骨圖分類問題，查詢 JS 錯誤模式庫 |
| code-reviewer | 審查涉及共享資源的 PR 時，使用並發問題預防清單 |
| developer | （依賴圖自動偵測新增） |

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/debugging/references/debugging-framework.md` | RCA 五步法、5 Whys 模板、魚骨圖分類、診斷報告模板 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/debugging/references/js-error-patterns.md` | JS/Node.js 常見錯誤模式（async 陷阱、closure、型別、記憶體洩漏） |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/debugging/references/reproduction-checklist.md` | Bug 重現步驟清單、環境資訊收集、MRE 建立方法 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/debugging/references/concurrency-debugging.md` | 並發問題診斷指南：Race Condition/TOCTOU/Deadlock 分類、症狀辨識、診斷步驟、Overtone 常見案例、Code Review 清單 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/debugging/examples/rca-walkthrough.md` | 完整 RCA 範例：SubagentStop 重複觸發問題 |