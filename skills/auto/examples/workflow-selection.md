# Workflow 選擇判斷範例

> 📋 **何時讀取**：使用者需求模糊、難以判斷 workflow 類型時。

## 範例 1：明確的小修改 → `single`

**使用者**：「把 footer 的 copyright 年份改成 2026」

**判斷**：
- 一行文字修改
- 不需要審查或測試
- → `single`（DEV）

## 範例 2：簡單 bug 修復 → `quick`

**使用者**：「登入按鈕在手機上被截斷」

**判斷**：
- 明確的 UI bug
- 修復範圍小（CSS 調整）
- 需要驗證修復有效
- → `quick`（DEV → [REVIEW + TEST]）

## 範例 3：新功能 → `standard`

**使用者**：「加一個使用者通知功能，支援 email 和 in-app」

**判斷**：
- 新功能，需要設計
- 涉及後端 API + 前端 UI + 通知服務
- 中型複雜度
- → `standard`（PLAN → ARCH → TEST:spec → DEV → [R + T:verify] → DOCS）

## 範例 4：大型跨模組 → `full`

**使用者**：「重建整個購物車系統，要支援多幣別和優惠券」

**判斷**：
- 跨多個模組（購物車、支付、優惠券、匯率）
- 需要 UI 設計
- 需要完整 QA + E2E
- → `full`（PLAN → ARCH → DESIGN → ... → [QA + E2E] → DOCS）

## 範例 5：安全敏感 → `secure`

**使用者**：「整合第三方 OAuth 登入（Google + GitHub）」

**判斷**：
- 涉及認證機制
- 處理 token、session
- 安全敏感
- → `secure`（PLAN → ARCH → TEST:spec → DEV → [R + T + SECURITY] → DOCS）

## 範例 6：邊界情況 — 「修 bug」但範圍大 → `debug` 或 `standard`

**使用者**：「整個搜尋功能都不能用了」

**判斷**：
- 看起來像 bug，但可能涉及大範圍問題
- 先用 `debug` 診斷根因
- 如果根因簡單 → debug 流程處理
- 如果發現需要重新設計 → 切換到 `standard` 或 `refactor`

## 範例 7：邊界情況 — 重構 vs 新功能

**使用者**：「把 REST API 改成 GraphQL」

**判斷**：
- 不是單純重構（改變了 API 介面）
- 也不是全新功能（基於現有功能）
- 涉及架構變更 + 行為保持不變
- → `refactor`（ARCH → TEST:spec → DEV → REVIEW → TEST:verify）

## 範例 8：邊界情況 — 明確指定 TDD

**使用者**：「我想用 TDD 方式加一個 rate limiter」

**判斷**：
- 使用者明確要求 TDD
- 不管功能大小，優先尊重使用者指定
- → `tdd`（TEST:spec → DEV → TEST:verify）

## 範例 9：邊界情況 — 覆寫語法

**使用者**：「[workflow:full] 修正登入 bug」

**判斷**：
- 使用者明確指定 `[workflow:full]`
- 即使任務看起來像簡單 bug，仍使用指定的 workflow
- → `full`

## 範例 10：模糊需求 → 詢問使用者

**使用者**：「改善效能」

**判斷**：
- 範圍不明確（哪個部分？什麼效能？）
- 需要先診斷瓶頸
- → 詢問使用者具體範圍後再決定 workflow
