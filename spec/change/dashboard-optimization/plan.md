# Dashboard 後續優化計畫

> PM Discovery 2026-03-18 — 使用者確認 A+B 組合方案
> ✅ 迭代 1 + 迭代 2 全部完成

## 迭代 1：Quick Win ✅

- [x] T1. 停用 3500 Dashboard（port 3500 已 kill）
- [x] T2. 星空 Canvas disable 選項（localStorage `nova-starfield` = 'off'）
- [x] T3. Tab 記憶（localStorage `nova-tab` 持久化）
- [x] T4. loop.js polling 優化（只在 Tab active 時 polling，離開時 destroy）
- [x] T5. system.js renderServices 並行化（Promise.all）
- [x] T6. events DOM 上限提升（20 → 50）

## 迭代 2：中期增強 ✅

- [x] T7. SSE 事件總線重構（handleEvent 分發到品質/監控 Tab）
- [x] T8. Tab 分組（操控 │ 分析 │ 自動，含 CSS 分隔線 + 順序重排）
- [x] T9. 品質 Tab 即時更新（session_end 時自動 re-fetch）
- [x] T10. 日報摘要版本（generateBriefReport + 摘要/完整切換按鈕）
- [x] T11. CSS 審計清理（移除未使用選擇器 + 合併重複）
