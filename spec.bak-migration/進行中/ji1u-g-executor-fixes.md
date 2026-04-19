---
title: multi-tier-loop g-executor 結構缺陷修復
date: 2026-04-13
status: in_progress
scope: nova-brain sandbox       # g 路由 Phase 5 暫不 GA
owner: nb
authorization:
  - xd-1776092084077-ji1u       # 觸發來源 block-world R119 POC
---

# multi-tier-loop g-executor 結構缺陷修復（xd-ji1u）

## 來源
Cross-dispatch xd-1776092084077-ji1u。block-world R119 POC 揭發 3 層結構缺陷 + 5 個次要 bug。g 路由 Phase 5 暫不 GA，POC 移回 nova-brain sandbox。

## 輪 1 完成（本輪 2026-04-13）

### ✅ P0-A: g-executor 注入既有檔案內容
- 位置：`~/projects/nova-manager/scripts/g-executor.js` `callG4SingleTask`
- 修法：
  1. 開頭讀 `task.files[*]` 的 current content
  2. 塞進 prompt 為「現有檔案內容」段落
  3. SYSTEM_PROMPT 改為明確要求 minimal edit + 保留未提及的 import/export/常數/函數
- 驗證：透過 executor.js 整合（下一層）

### ✅ P0-B: locked 強化
- 位置：`~/projects/nova-manager/scripts/lib/phases/executor.js`
- 新 export：
  - `extractExportSignatures(content)` — 擷取 export function/const/class/default/named
  - `validateLocked(task, fileChanges)` — 驗證 locked/maxDeletedLines/preserveExports
- `runExecutor` 整合：snapshot before content → 呼叫 caller → 讀 after → `validateLocked`
- **opt-in** 設計（向後相容）：
  - `task.locked`: string | string[] — 一律檢查
  - `task.maxDeletedLines`: number — 明示才啟用
  - `task.preserveExports`: true — 明示才啟用
- 測試：`tests/unit/executor-locked.test.js` 18 case（extractExportSignatures 6 + locked substrings 5 + maxDeletedLines 5 + preserveExports 3）

## 輪 2 待做

### P1-C: reviewer 加迴歸檢查
位置：`~/projects/nova-manager/scripts/lib/phases/reviewer.js`
修法：
- reviewer prompt 加「比對 diff，若有刪除/重構未在 details 列出 → verdict=fail」
- 或加 diff-stat 驗證：deleted ≤ added × 1.2
- 測試：給 mock diff 驗證 fail 路徑

### P1-D: tier-ladder + model-client 接線 config SoT
位置：
- `~/projects/nova-manager/scripts/lib/tier-ladder.js`：`tierToModel` 硬編 `g4-26b` + `127.0.0.1:8000`
- `~/projects/nova-manager/scripts/lib/model-client.js`：`callG` 硬編 `localhost:8000` + `model: local`
修法：改讀 `~/.claude/config/local-model.json`
測試：驗證讀取 config 後的字串

### P2-E: planner schema 文件化
位置：`~/.claude/skills/multi-tier-routing/references/` 或 multi-tier-loop 註解
問題：task.tasks[] / task.milestone / task.task 三選一判斷邏輯未記載
修法：寫 schema 文件

## 輪 3 待做

### 重跑 R119 POC sandbox
位置：`tests/sandbox/multi-tier/`（新建）
動作：
1. 搬移 R119 simulation 任務到 nova-brain sandbox
2. 跑完整 pipeline 驗證 P0-A/B 防護生效
3. 產 report 比對修復前後

## 戰略
block-world 不再是 fuzz target，POC 移 nova-brain 沙盒後再重啟 L5 試點。

## Note
本輪只做 P0 子項（最核心的 executor 注入 + locked 強化）。P1/P2 留下輪，避免單 session 塞 D3 大工程品質下降。
