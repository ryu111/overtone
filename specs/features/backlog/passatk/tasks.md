---
feature: passatk
status: backlog
workflow: standard
---

## Overview

在 Dashboard Session 頁面顯示 Pass@k 統計數據，量化 agent 的通過率與品質趨勢。

## 背景

Pass@k 是衡量 AI agent 品質的核心指標（出自 `docs/spec/overtone-驗證品質.md`）：
- 單次驗證（pass@1）：agent 一次通過的比率
- 多次採樣（pass@k）：k 次中至少一次通過的比率
- 用於 grader agent 評分後的統計聚合

## 範疇

- 從 `timeline.jsonl` 中的 `grader:score` 事件提取分數
- 計算每個 session 的 pass@1、pass@3、pass@5
- 在 Dashboard session 面板中顯示統計卡片
- `/api/registry` 或新端點回傳 passatk 資料

## Tasks
