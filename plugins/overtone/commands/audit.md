---
name: audit
description: 系統健康檢查。執行偵測腳本分析系統衛生狀態，回報問題並給出修復建議。
---

# /ot:audit — 系統健康檢查

執行 6 項確定性偵測（phantom-events、dead-exports、doc-code-drift、unused-paths、duplicate-logic、platform-drift），分析 Overtone 系統衛生狀態。

## 執行步驟

### Step 1：執行健康檢查腳本

用 Bash 執行：

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/health-check.js
```

收集 stdout 輸出（JSON 格式）和 exit code。

### Step 2：解析結果

嘗試將 stdout 解析為 JSON。

若解析失敗（非合法 JSON）：
- 向使用者回報腳本執行失敗
- 說明可能原因（Bun 未安裝、腳本路徑錯誤、語法錯誤等）
- 顯示原始 stdout/stderr 內容供診斷
- 停止，不繼續分析

### Step 3：依結果回報

#### 情況 A：findings 陣列為空（系統健康）

直接回報：

```
系統衛生狀態良好，無發現任何問題。

所有 6 項偵測均通過：
- phantom-events: ✅ 通過
- dead-exports: ✅ 通過
- doc-code-drift: ✅ 通過
- unused-paths: ✅ 通過
- duplicate-logic: ✅ 通過
- platform-drift: ✅ 通過
```

#### 情況 B：有 findings（需要注意）

格式化報告，按 severity 分類（error → warning → info）：

```
系統健康檢查完成，發現 {total} 個問題。

## 錯誤（需立即修復）
[列出所有 severity: "error" 的 finding，附修復建議]

## 警告（建議修復）
[列出所有 severity: "warning" 的 finding，附修復建議]

## 資訊（可選優化）
[列出所有 severity: "info" 的 finding，附說明]
```

每個 finding 的格式：
```
- [{check}] {file}: {message}
  建議：{根據 check 類型給出具體修復步驟}
```

修復建議規則：
- `phantom-events` error（emit 未定義事件）→ 建議在 registry.js 的 timelineEvents 中新增該事件，或移除 emit 呼叫
- `phantom-events` warning（registry 有但未 emit）→ 確認是否為廢棄事件，若是則從 registry 刪除
- `dead-exports` → 確認 export 是否真的未使用，若確認則從 module.exports 移除
- `doc-code-drift` → 更新 docs 中的數字使其與程式碼一致，或執行 /ot:doc-sync
- `unused-paths` → 確認 paths.js 的 export 是否真的未使用，若確認則移除
- `duplicate-logic` → 考慮將重複邏輯提取到 scripts/lib/ 的共用模組
