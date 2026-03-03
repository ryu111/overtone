# 根因分析範例：SubagentStop 重複觸發

## 問題描述

**日期**：2025-11-20
**症狀**：Loop 工作流中，SubagentStop hook 觸發後，timeline.jsonl 出現重複的 `stage:complete` 記錄。
**影響**：Dashboard 顯示重複的完成事件；閉迴圈測試失敗。

---

## 觀察現象

```
timeline.jsonl 內容：
{"event":"stage:complete","stage":"DEV","result":"pass","ts":"..."}
{"event":"stage:complete","stage":"DEV","result":"pass","ts":"..."}  ← 重複
```

Stack trace（無，邏輯錯誤而非例外）

---

## 5 Whys 分析

**Why 1: 為什麼 timeline 有重複記錄？**
→ 因為 `emitTimeline('stage:complete', ...)` 被呼叫了兩次

**Why 2: 為什麼 emitTimeline 被呼叫兩次？**
→ 因為 SubagentStop hook 被觸發了兩次

**Why 3: 為什麼 SubagentStop 觸發兩次？**
→ 因為同一個 subagent task 完成時，兩個不同的 event handler 都監聽了 SubagentStop

**Why 4: 為什麼有兩個 handler？**
→ 因為 `on-stop.js` 腳本在 session 內被重新載入，第二次 require 時重複登錄了 event handler

**Why 5: 為什麼腳本被重新載入？**
→ 根因：`hooks.json` 使用了扁平陣列格式，導致 hook 被 Claude Code 解析兩次（一次正確觸發，一次以錯誤路徑觸發）

---

## 驗證根因

```bash
# 確認 hooks.json 格式
cat plugins/overtone/hooks/hooks.json | jq '.hooks.SubagentStop'

# 發現：同時存在舊格式（扁平）和新格式（三層嵌套）
# 舊格式觸發 → hook A
# 新格式觸發 → hook B
# 兩者都執行，產生重複
```

---

## 修復方案

針對根因（hooks.json 格式）：

```json
// 修復前（混合格式，部分用舊格式）
{
  "hooks": [
    {"event": "SubagentStop", "type": "command", "command": "node on-stop.js"}
  ]
}

// 修復後（正規三層嵌套格式）
{
  "hooks": {
    "SubagentStop": [
      {
        "hooks": [
          {"type": "command", "command": "node on-stop.js"}
        ]
      }
    ]
  }
}
```

---

## 修復後驗證

```bash
bun test tests/integration/platform-alignment-hooks-json.test.js
# ✅ PASS

bun test tests/e2e/workflow-lifecycle.test.js
# ✅ PASS — 不再出現重複 timeline 記錄
```

---

## 學到的教訓

1. **格式驗證要在 CI 自動化**：加入 hooks.json 格式檢查到 guard test
2. **觀察層次要對**：症狀是「重複記錄」，但根因在「格式解析」，不要只修症狀
3. **5 Whys 的終止條件**：找到「可控制的根本原因」（我們能改 hooks.json，不能改 Claude Code 的解析行為）
