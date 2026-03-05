# P3.6 Security Integration — 安全整合（守衛層）

`security-integration`

## 需求背景（Why）

P3.6 是 Phase 3 的最後一個階段，目標是讓 OS 能力（P3.1-P3.3 + P3.5）有完整的安全守衛層，確保 Agent 在操作 OS 時不會造成不可逆的系統損害，同時讓 health-check 能偵測 OS 相關的依賴完整性。

**背景**：
- P3.4（keyboard/mouse/applescript）尚未完成，因此「截圖→理解→操作→驗證」完整 E2E 流程無法做
- P3.1-P3.3 + P3.5 已完成 8 個 OS 腳本（screenshot/window/clipboard/process/system-info/notification/fswatch/websocket）
- pre-bash-guard.js 目前有 14 條黑名單規則，但缺少 OS 腳本實際運行中觀察到的新危險模式
- health-check 的第 8 項（os-tools）目前只偵測 pbcopy/pbpaste/osascript，未涵蓋 fswatch 相關工具和 heartbeat daemon 狀態

**目標**：
1. 完善 pre-bash-guard.js 黑名單，覆蓋 Phase 3 累積觀察到的危險命令模式
2. 擴展 health-check 偵測外部工具依賴和 heartbeat daemon 狀態
3. 更新 os-control SKILL.md 反映 P3.1-P3.3 + P3.5 的實際完成狀態
4. 撰寫 OS 腳本整合測試（已完成能力的 e2e 驗證），替代無法做的 P3.4 E2E

## 使用者故事

```
身為 Overtone 開發者
我想要 pre-bash-guard 能攔截 Phase 3 OS 操作中識別的危險命令
以便 Agent 操作 OS 時不會造成系統損害
```

```
身為 Overtone 開發者
我想要 health-check 偵測 OS 依賴（包含 fswatch/screencapture 等工具）和 heartbeat daemon 狀態
以便在系統啟動前確認所有 OS 能力的依賴都已就緒
```

```
身為 Overtone 開發者
我想要 os-control SKILL.md 正確反映目前可用的能力
以便 Agent 不會嘗試呼叫 P3.4 尚未完成的操控功能
```

```
身為 Overtone 開發者
我想要一個 OS 腳本整合測試套件
以便驗證 P3.1-P3.3 + P3.5 的已完成能力能端到端正常運作
```

## 範圍邊界

### 在範圍內（In Scope）

- `pre-bash-guard.js`：新增 Phase 3 觀察到的危險命令黑名單（OS 相關）
- `health-check.js`：擴展第 8 項（os-tools），新增 screencapture/fswatch 工具偵測 + heartbeat daemon 狀態偵測
- `os-control SKILL.md`：更新 Reference 索引，正確標記 P3.4（control.md）為「待建」、P3.5（realtime.md）已完成狀態
- `tests/integration/os-scripts.test.js`：OS 腳本整合測試（以已完成的能力為範圍）
- `pre-bash-guard.js` 對應的測試更新

### 不在範圍內（Out of Scope）

- P3.4 操控層（keyboard/mouse/applescript/computer-use）— 另立 P3.4 任務執行
- 截圖→理解→操作→驗證完整 E2E（依賴 P3.4）
- Dashboard 安全監控可視化
- 對外部 OS 工具的自動安裝（只偵測不修復）

## 子任務清單

1. **Guard 精鍊：pre-bash-guard.js 黑名單擴充**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/tool/pre-bash-guard.js`
   - 說明：分析 P3.1-P3.3 + P3.5 腳本（screenshot/window/clipboard/process/notification/fswatch/websocket）的操作模式，識別 Agent 可能誤用的危險命令。新增黑名單規則，例如：直接寫入系統目錄（sudo tee /etc/）、osascript 刪除操作（osascript -e 'tell application "Finder" to delete'）等。更新 guard 頂部的規則清單說明（目前 14 條）。

2. **Guard 測試更新**
   - 負責 agent：developer
   - 相關檔案：`tests/unit/pre-bash-guard.test.js`（或當前測試路徑）
   - 說明：為新增的黑名單規則補充對應的測試 case（正向命中 + 負向放行）。

3. **health-check 擴展：OS 依賴偵測強化**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/health-check.js`
   - 說明：擴展現有的 `checkOsTools()` 函式（第 8 項）。目前偵測 pbcopy/pbpaste/osascript 三個工具，需新增：(a) screencapture（P3.1 截圖依賴）、(b) heartbeat daemon 狀態偵測（讀取 PID 檔判斷是否在跑）。fswatch 工具的偵測：因為目前 fswatch.js 使用 `fs.watch()` 原生 API（不依賴外部 fswatch CLI），此項不需要新增。

4. **health-check 測試更新**
   - 負責 agent：developer
   - 相關檔案：`tests/unit/health-check.test.js`（或 `tests/integration/health-check.test.js`）
   - 說明：為 checkOsTools 新增的偵測項目補充測試。特別注意 heartbeat daemon 狀態偵測需要能 mock PID 檔案。

5. **os-control SKILL.md 更新**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/os-control/SKILL.md`
   - 說明：更新 SKILL.md 的 Reference 索引表，確保狀態標記正確：P3.1（perception.md）✅、P3.2 心跳（不在此 Skill 下）、P3.3（system.md）✅、P3.4（control.md）標記「待建 P3.4」、P3.5（realtime.md）✅（websocket 已完成）。更新 OS 能力總覽章節說明。注意：此檔案受 pre-edit-guard 保護，必須使用 manage-component.js 修改。

6. **OS 腳本整合測試**
   - 負責 agent：developer
   - 相關檔案：`tests/integration/os-scripts.test.js`（新建）
   - 說明：針對已完成的 OS 腳本（P3.1 screenshot/window + P3.3 clipboard/process/system-info/notification/fswatch + P3.5 websocket）各撰寫至少一個整合 smoke test，驗證在真實環境（macOS）下能呼叫並回傳合法格式。策略：不依賴 CI（macOS only），每個測試加 `if (process.platform !== 'darwin') skip` guard。

## 開放問題

- **heartbeat daemon PID 檔案路徑**：需要 architect 確認 PID 檔案的標準路徑（`~/.overtone/heartbeat.pid` 或其他），以確保 health-check 偵測邏輯一致。
- **OS 整合測試 vs unit 測試**：OS 腳本目前有 unit 測試（mock 版），整合測試是否直接叫真實系統指令（`execSync`）？若是，測試執行時間和 macOS 依賴需要考量。建議 architect 決定整合測試的依賴注入策略。
- **pre-bash-guard 新增規則的優先順序**：P3.4 尚未完成，是否需要提前加入 cliclick 等操控工具的危險使用 guard？建議先只加 P3.1-P3.3 + P3.5 相關的危險模式。
