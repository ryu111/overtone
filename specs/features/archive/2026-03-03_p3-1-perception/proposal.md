# Proposal：p3-1-perception

## 功能名稱

`p3-1-perception`（P3.1 感知層 — 截圖 + 視窗管理）

## 需求背景（Why）

- **問題**：Overtone 目前缺乏 OS 感知能力。Agent 無法截圖、無法查詢當前視窗狀態，導致自主任務（如「驗證 UI」、「確認畫面」）必須依賴人工描述，無法閉環。
- **目標**：建立感知層基礎——截圖 API + 視窗查詢 API + 視覺分析指引。Agent 執行任務後能自主截圖並用 Read tool 多模態「看見」畫面，驗證執行結果。
- **優先級**：Phase 3 的第一階段（P3.1），是後續 P3.2 操控層、P3.5 安全整合的基礎。沒有感知能力，自主代理的閉環驗證無從實現。

## 使用者故事

```
身為 Overtone agent（developer / qa）
我想要截取螢幕截圖並查詢當前視窗資訊
以便自主驗證 UI 狀態、確認操作結果，不需人工回饋
```

```
身為 architect
我想要一份完整的感知層 API 指引文件（perception.md）
以便後續 P3.2～P3.5 的開發有統一的設計規範可循
```

## 範圍邊界

### 在範圍內（In Scope）

- `scripts/os/screenshot.js`：全螢幕截圖 + 區域截圖 + 指定視窗截圖
- `scripts/os/window.js`：視窗/進程列表查詢 + 視窗聚焦（activate）
- 權限偵測：執行前檢測 Screen Recording / Accessibility 權限，缺少時回傳明確錯誤 JSON
- `skills/os-control/references/perception.md`：完整 reference（API 索引 + 截圖分析模板 + 視窗查詢指引）
- `skills/os-control/SKILL.md` 索引更新：perception.md 標記為已完成
- 單元測試：`tests/unit/screenshot.test.js` + `tests/unit/window.test.js`

### 不在範圍內（Out of Scope）

- 視窗操控（移動、縮放、關閉）— 屬於 P3.2
- 鍵盤/滑鼠模擬 — 屬於 P3.2
- 視訊錄製（screencapture -v）— 明確不做（安全原因）
- health-check.js 擴展（screencapture + Accessibility 偵測）— Should，若時間允許
- pre-bash-guard.js 截圖安全規則 — Should，若時間允許

## 子任務清單

### Must（核心）

1. **建立 `scripts/os/` 目錄 + `screenshot.js`**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/os/screenshot.js`
   - 說明：macOS `screencapture` CLI wrapper。支援全螢幕、區域（-R x,y,w,h）、指定視窗（-l windowID）。執行前檢測 Screen Recording 權限，缺少時回傳 `{ ok: false, error: 'PERMISSION_DENIED', message: '...' }`

2. **建立 `window.js`**（可與子任務 1 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/os/window.js`
   - 說明：AppleScript 驅動的視窗查詢。進程列表（`System Events` process info）、視窗列表（視窗 ID、標題、尺寸位置）、視窗聚焦（`activate`）。Accessibility 權限缺少時回傳明確錯誤 JSON。

3. **撰寫單元測試**（依賴子任務 1 + 2）
   - 負責 agent：tester
   - 相關檔案：`tests/unit/screenshot.test.js`、`tests/unit/window.test.js`
   - 說明：mock `child_process.spawn` / `execSync`，驗證參數組裝、非 darwin 靜默跳過、權限錯誤回傳格式

4. **填充 `perception.md`**（可與子任務 1+2 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/os-control/references/perception.md`
   - 說明：API 索引（screenshot.js / window.js 所有 export）、截圖分析結構化模板（GIVEN-WHEN-THEN 格式）、視窗查詢使用指引、權限偵測說明

5. **更新 `SKILL.md` 索引**（依賴子任務 4）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/os-control/SKILL.md`
   - 說明：perception.md 列status 改為「已完成 ✅」，加入腳本路徑提示

### Should（若時間允許）

6. **health-check.js 擴展**（可與子任務 1-5 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/health-check.js`
   - 說明：新增第 8、9 項偵測 — `screencapture` 可用性 + Accessibility 權限狀態

7. **pre-bash-guard.js 截圖安全規則**（可與子任務 1-5 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/tool/pre-bash-guard.js`
   - 說明：新增規則阻擋 `screencapture -v`（錄影）等危險截圖操作，加入測試覆蓋

## 開放問題

- **腳本輸出介面**：CLI 呼叫時輸出 JSON 到 stdout 還是直接 process.exit？需 architect 決定統一風格（sound.js 是 fire-and-forget，screenshot.js 需要回傳路徑）
- **截圖儲存位置**：預設存到 `/tmp/overtone-screenshots/` 還是呼叫方指定路徑？安全性考量（截圖可能含敏感資訊）
- **window.js 的錯誤模式**：Accessibility 權限缺少時只 warn 還是完全 fail？部分功能（進程列表）不需權限，視窗屬性才需要——是否分開處理？
- **測試中 osascript mock 方式**：`execSync` mock 或用 fixture JSON？需 architect 確認測試隔離策略
