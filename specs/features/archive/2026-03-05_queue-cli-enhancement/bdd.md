# Feature: queue-cli-enhancement — 佇列項目細粒度操作

---

## insertItem — 在指定 anchor 前或後插入新項目

## Scenario: 在 anchor 項目之前插入新項目
GIVEN 佇列存在，包含 ["task-a", "task-b", "task-c"]（均為 pending）
WHEN 呼叫 insertItem(projectRoot, "task-new", "standard", "task-b", "before")
THEN 回傳 { ok: true }
AND 佇列順序變為 ["task-a", "task-new", "task-b", "task-c"]
AND 新項目 status 為 "pending"、name 為 "task-new"、workflow 為 "standard"

## Scenario: 在 anchor 項目之後插入新項目
GIVEN 佇列存在，包含 ["task-a", "task-b", "task-c"]（均為 pending）
WHEN 呼叫 insertItem(projectRoot, "task-new", "quick", "task-b", "after")
THEN 回傳 { ok: true }
AND 佇列順序變為 ["task-a", "task-b", "task-new", "task-c"]

## Scenario: 佇列不存在時插入回傳 QUEUE_NOT_FOUND
GIVEN 佇列檔案不存在（未初始化）
WHEN 呼叫 insertItem(projectRoot, "task-new", "standard", "task-a", "before")
THEN 回傳 { ok: false, error: "QUEUE_NOT_FOUND" }

## Scenario: anchor 不存在時回傳 ANCHOR_NOT_FOUND
GIVEN 佇列存在，包含 ["task-a", "task-b"]
WHEN 呼叫 insertItem(projectRoot, "task-new", "standard", "task-nonexistent", "before")
THEN 回傳 { ok: false, error: "ANCHOR_NOT_FOUND" }

## Scenario: 插入到第一個項目之前
GIVEN 佇列存在，包含 ["task-a", "task-b"]
WHEN 呼叫 insertItem(projectRoot, "task-new", "standard", "task-a", "before")
THEN 回傳 { ok: true }
AND 佇列順序變為 ["task-new", "task-a", "task-b"]

---

## removeItem — 刪除指定名稱的佇列項目

## Scenario: 刪除 pending 狀態的項目
GIVEN 佇列存在，包含 ["task-a"(pending), "task-b"(pending), "task-c"(pending)]
WHEN 呼叫 removeItem(projectRoot, "task-b")
THEN 回傳 { ok: true }
AND 佇列順序變為 ["task-a", "task-c"]

## Scenario: 刪除 failed 狀態的項目
GIVEN 佇列存在，包含 ["task-a"(completed), "task-b"(failed), "task-c"(pending)]
WHEN 呼叫 removeItem(projectRoot, "task-b")
THEN 回傳 { ok: true }
AND 佇列剩餘 ["task-a", "task-c"]

## Scenario: 嘗試刪除 completed 項目回傳 INVALID_STATUS
GIVEN 佇列存在，包含 ["task-a"(completed), "task-b"(pending)]
WHEN 呼叫 removeItem(projectRoot, "task-a")
THEN 回傳 { ok: false, error: "INVALID_STATUS" }
AND 佇列內容不變

## Scenario: 嘗試刪除 in_progress 項目回傳 INVALID_STATUS
GIVEN 佇列存在，包含 ["task-a"(in_progress), "task-b"(pending)]
WHEN 呼叫 removeItem(projectRoot, "task-a")
THEN 回傳 { ok: false, error: "INVALID_STATUS" }

## Scenario: 項目名稱不存在時回傳 ITEM_NOT_FOUND
GIVEN 佇列存在，包含 ["task-a"(pending)]
WHEN 呼叫 removeItem(projectRoot, "task-nonexistent")
THEN 回傳 { ok: false, error: "ITEM_NOT_FOUND" }

## Scenario: 佇列不存在時回傳 QUEUE_NOT_FOUND
GIVEN 佇列檔案不存在
WHEN 呼叫 removeItem(projectRoot, "task-a")
THEN 回傳 { ok: false, error: "QUEUE_NOT_FOUND" }

---

## moveItem — 將指定項目移動到 anchor 前或後

## Scenario: 將 pending 項目移動到另一個項目之前
GIVEN 佇列存在，包含 ["task-a"(pending), "task-b"(pending), "task-c"(pending)]
WHEN 呼叫 moveItem(projectRoot, "task-c", "task-a", "before")
THEN 回傳 { ok: true }
AND 佇列順序變為 ["task-c", "task-a", "task-b"]

## Scenario: 將 failed 項目移動到 anchor 之後
GIVEN 佇列存在，包含 ["task-a"(pending), "task-b"(failed), "task-c"(pending)]
WHEN 呼叫 moveItem(projectRoot, "task-b", "task-c", "after")
THEN 回傳 { ok: true }
AND 佇列順序變為 ["task-a", "task-c", "task-b"]

## Scenario: 嘗試移動 completed 項目回傳 INVALID_STATUS
GIVEN 佇列存在，包含 ["task-a"(completed), "task-b"(pending)]
WHEN 呼叫 moveItem(projectRoot, "task-a", "task-b", "before")
THEN 回傳 { ok: false, error: "INVALID_STATUS" }

## Scenario: 嘗試移動 in_progress 項目回傳 INVALID_STATUS
GIVEN 佇列存在，包含 ["task-a"(in_progress), "task-b"(pending)]
WHEN 呼叫 moveItem(projectRoot, "task-a", "task-b", "after")
THEN 回傳 { ok: false, error: "INVALID_STATUS" }

## Scenario: name 與 anchor 相同時回傳 SELF_ANCHOR
GIVEN 佇列存在，包含 ["task-a"(pending), "task-b"(pending)]
WHEN 呼叫 moveItem(projectRoot, "task-a", "task-a", "before")
THEN 回傳 { ok: false, error: "SELF_ANCHOR" }

## Scenario: anchor 不存在時回傳 ANCHOR_NOT_FOUND
GIVEN 佇列存在，包含 ["task-a"(pending), "task-b"(pending)]
WHEN 呼叫 moveItem(projectRoot, "task-a", "task-nonexistent", "after")
THEN 回傳 { ok: false, error: "ANCHOR_NOT_FOUND" }

## Scenario: 要移動的項目不存在時回傳 ITEM_NOT_FOUND
GIVEN 佇列存在，包含 ["task-a"(pending), "task-b"(pending)]
WHEN 呼叫 moveItem(projectRoot, "task-nonexistent", "task-b", "before")
THEN 回傳 { ok: false, error: "ITEM_NOT_FOUND" }

---

## getItem — 查詢單一項目的完整資訊

## Scenario: 查詢存在的項目，回傳完整欄位與 index
GIVEN 佇列存在，包含 ["task-a"(completed), "task-b"(in_progress), "task-c"(pending)]
WHEN 呼叫 getItem(projectRoot, "task-b")
THEN 回傳 { ok: true, item: { name: "task-b", workflow: ..., status: "in_progress", ... }, index: 1 }
AND item 包含完整欄位（name, workflow, status, 以及所有時間戳記欄位）

## Scenario: 查詢存在的 failed 項目，回傳 failReason
GIVEN 佇列存在，包含 ["task-a"(failed, failReason: "timeout")]
WHEN 呼叫 getItem(projectRoot, "task-a")
THEN 回傳 { ok: true, item: { name: "task-a", status: "failed", failReason: "timeout", failedAt: ... }, index: 0 }

## Scenario: 項目不存在時回傳 ITEM_NOT_FOUND
GIVEN 佇列存在，包含 ["task-a"(pending)]
WHEN 呼叫 getItem(projectRoot, "task-nonexistent")
THEN 回傳 { ok: false, error: "ITEM_NOT_FOUND" }

## Scenario: 佇列不存在時回傳 QUEUE_NOT_FOUND
GIVEN 佇列檔案不存在
WHEN 呼叫 getItem(projectRoot, "task-a")
THEN 回傳 { ok: false, error: "QUEUE_NOT_FOUND" }

---

## retryItem — 將 failed 項目重設為 pending

## Scenario: 成功將 failed 項目重設為 pending
GIVEN 佇列存在，包含 ["task-a"(failed, failedAt: "...", failReason: "timeout", startedAt: "...")]
AND 佇列中沒有 in_progress 項目
WHEN 呼叫 retryItem(projectRoot, "task-a")
THEN 回傳 { ok: true }
AND 項目 status 變為 "pending"
AND 項目不含 failedAt、failReason、startedAt 欄位（完全移除，不是設為 undefined）

## Scenario: 佇列中有 in_progress 項目時阻擋 retry，回傳 IN_PROGRESS_CONFLICT
GIVEN 佇列存在，包含 ["task-a"(in_progress), "task-b"(failed)]
WHEN 呼叫 retryItem(projectRoot, "task-b")
THEN 回傳 { ok: false, error: "IN_PROGRESS_CONFLICT", conflictName: "task-a" }

## Scenario: 嘗試 retry 非 failed 項目回傳 INVALID_STATUS
GIVEN 佇列存在，包含 ["task-a"(pending)]
WHEN 呼叫 retryItem(projectRoot, "task-a")
THEN 回傳 { ok: false, error: "INVALID_STATUS" }

## Scenario: 嘗試 retry completed 項目回傳 INVALID_STATUS
GIVEN 佇列存在，包含 ["task-a"(completed)]
WHEN 呼叫 retryItem(projectRoot, "task-a")
THEN 回傳 { ok: false, error: "INVALID_STATUS" }

## Scenario: 項目不存在時回傳 ITEM_NOT_FOUND
GIVEN 佇列存在，包含 ["task-a"(failed)]
WHEN 呼叫 retryItem(projectRoot, "task-nonexistent")
THEN 回傳 { ok: false, error: "ITEM_NOT_FOUND" }

## Scenario: 佇列不存在時回傳 QUEUE_NOT_FOUND
GIVEN 佇列檔案不存在
WHEN 呼叫 retryItem(projectRoot, "task-a")
THEN 回傳 { ok: false, error: "QUEUE_NOT_FOUND" }

---

## CLI 子命令 — queue.js insert

## Scenario: insert --before 成功執行
GIVEN 佇列存在，包含 ["task-a", "task-b"]
WHEN 執行 `queue.js insert task-new standard --before task-b`
THEN exit code 為 0
AND 標準輸出包含成功訊息
AND 佇列順序為 ["task-a", "task-new", "task-b"]

## Scenario: insert --after 成功執行
GIVEN 佇列存在，包含 ["task-a", "task-b"]
WHEN 執行 `queue.js insert task-new standard --after task-a`
THEN exit code 為 0
AND 佇列順序為 ["task-a", "task-new", "task-b"]

## Scenario: insert 同時指定 --before 和 --after 回傳錯誤
GIVEN 任意佇列狀態
WHEN 執行 `queue.js insert task-new standard --before task-a --after task-b`
THEN exit code 為 1
AND 標準輸出或錯誤輸出包含錯誤說明

## Scenario: insert 未指定 --before 或 --after 回傳錯誤
GIVEN 任意佇列狀態
WHEN 執行 `queue.js insert task-new standard`
THEN exit code 為 1

## Scenario: insert anchor 不存在輸出 ANCHOR_NOT_FOUND 對應訊息
GIVEN 佇列存在，包含 ["task-a"]
WHEN 執行 `queue.js insert task-new standard --before task-nonexistent`
THEN exit code 為 1
AND 輸出包含「找不到定位項目」

---

## CLI 子命令 — queue.js remove

## Scenario: remove 成功刪除 pending 項目
GIVEN 佇列存在，包含 ["task-a"(pending), "task-b"(pending)]
WHEN 執行 `queue.js remove task-a`
THEN exit code 為 0
AND 佇列剩餘 ["task-b"]

## Scenario: remove 嘗試刪除 completed 項目輸出 INVALID_STATUS 對應訊息
GIVEN 佇列存在，包含 ["task-a"(completed)]
WHEN 執行 `queue.js remove task-a`
THEN exit code 為 1
AND 輸出包含「無法操作 completed 狀態」

## Scenario: remove 項目不存在輸出 ITEM_NOT_FOUND 對應訊息
GIVEN 佇列存在，包含 ["task-a"(pending)]
WHEN 執行 `queue.js remove task-nonexistent`
THEN exit code 為 1
AND 輸出包含「找不到項目」

---

## CLI 子命令 — queue.js move

## Scenario: move --before 成功執行
GIVEN 佇列存在，包含 ["task-a"(pending), "task-b"(pending), "task-c"(pending)]
WHEN 執行 `queue.js move task-c --before task-a`
THEN exit code 為 0
AND 佇列順序為 ["task-c", "task-a", "task-b"]

## Scenario: move --after 成功執行
GIVEN 佇列存在，包含 ["task-a"(pending), "task-b"(pending), "task-c"(pending)]
WHEN 執行 `queue.js move task-a --after task-c`
THEN exit code 為 0
AND 佇列順序為 ["task-b", "task-c", "task-a"]

## Scenario: move 嘗試移動 in_progress 項目輸出 INVALID_STATUS 對應訊息
GIVEN 佇列存在，包含 ["task-a"(in_progress), "task-b"(pending)]
WHEN 執行 `queue.js move task-a --before task-b`
THEN exit code 為 1
AND 輸出包含「無法操作 in_progress 狀態」

## Scenario: move 自我 anchor 輸出 SELF_ANCHOR 對應訊息
GIVEN 佇列存在，包含 ["task-a"(pending)]
WHEN 執行 `queue.js move task-a --before task-a`
THEN exit code 為 1
AND 輸出包含「來源和定位項目不可相同」

---

## CLI 子命令 — queue.js info

## Scenario: info 成功顯示項目完整資訊
GIVEN 佇列存在，包含 ["task-a"(failed, failReason: "timeout")]
WHEN 執行 `queue.js info task-a`
THEN exit code 為 0
AND 輸出包含 name、workflow、status、failReason 等欄位

## Scenario: info 項目不存在輸出 ITEM_NOT_FOUND 對應訊息
GIVEN 佇列存在，包含 ["task-a"(pending)]
WHEN 執行 `queue.js info task-nonexistent`
THEN exit code 為 1
AND 輸出包含「找不到項目」

## Scenario: info 佇列不存在輸出 QUEUE_NOT_FOUND 對應訊息
GIVEN 佇列檔案不存在
WHEN 執行 `queue.js info task-a`
THEN exit code 為 1
AND 輸出包含「佇列不存在」

---

## CLI 子命令 — queue.js retry

## Scenario: retry 成功將 failed 項目重設為 pending
GIVEN 佇列存在，包含 ["task-a"(failed)]，無 in_progress 項目
WHEN 執行 `queue.js retry task-a`
THEN exit code 為 0
AND 項目 status 變為 pending

## Scenario: retry 有 in_progress 項目時輸出 IN_PROGRESS_CONFLICT 對應訊息
GIVEN 佇列存在，包含 ["task-a"(in_progress), "task-b"(failed)]
WHEN 執行 `queue.js retry task-b`
THEN exit code 為 1
AND 輸出包含「目前有項目正在執行中」

## Scenario: retry 非 failed 項目輸出 INVALID_STATUS 對應訊息
GIVEN 佇列存在，包含 ["task-a"(completed)]
WHEN 執行 `queue.js retry task-a`
THEN exit code 為 1
AND 輸出包含「無法操作 completed 狀態」
