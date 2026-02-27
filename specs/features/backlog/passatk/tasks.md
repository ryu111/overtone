---
feature: passatk
status: backlog
workflow: standard
---

## Overview

在 Dashboard Session 頁面顯示 Pass@k 統計數據，量化 agent 的通過率與品質趨勢。

## 背景

後端 API 已完整實作：
- `timeline.passAtK(sessionId)` — 計算 pass@1、pass@3、passConsecutive3
- `GET /api/sessions/:id/passatk` — 回傳 stages + overall 統計

缺少的是 **Dashboard 前端 UI 整合**。

## 範疇

- 在 `dashboard.html` 的 session 面板新增 Pass@k 統計卡片
- 呼叫 `/api/sessions/:id/passatk` 取得資料
- 顯示：pass@1 rate、pass@3 rate、各 stage 的通過率

## Tasks
