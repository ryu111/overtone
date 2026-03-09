# REVIEW APPROVE + notes 守衛

## 問題

code-reviewer 給出 APPROVE 但附帶 minor notes 時，Main Agent 可自由裁量是否修復。
這違反「工作流不可隨意打破」原則 — 已發現的問題不應該靠 AI 判斷決定要不要修。

### 症狀

- REVIEW APPROVE + minor → Main Agent 直接放行 → 已知問題流入後續階段
- 違反錯誤零容忍原則

### 根因

REVIEW verdict 是二元的（pass/fail），沒有結構化的「待修項」欄位。
守衛只看 verdict，看不到 minor notes。

## 方案選項

| 方案 | 說明 | 複雜度 |
|------|------|--------|
| A. reviewer 有待修項就 REJECT | 最簡單，不存在 "APPROVE but..." | 低 |
| B. 結構化 PENDING_FIXES 欄位 | reviewer 輸出加欄位，on-stop handler 檢查 | 中 |
| C. workflow command 加規則 | 告訴 Main Agent "APPROVE + notes → 先修再繼續" | 低（但依賴 AI） |

建議方案 A — 符合「確定性 → 程式碼」原則，reviewer 有問題就 REJECT，沒有灰色地帶。

## 影響範圍

- code-reviewer agent prompt（修改 APPROVE/REJECT 判定標準）
- 或 on-stop handler（加結構化檢查）
- workflow command（加規則）

## 狀態

- **優先級**：中
- **前置依賴**：無
