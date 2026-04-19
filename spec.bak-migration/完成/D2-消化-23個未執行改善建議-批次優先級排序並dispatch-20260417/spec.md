# 消化：23 個未執行的改善建議

## 背景
Handoff 反思：「品質收斂需要批次規劃而非逐個 dispatch。一次盤點所有低分 → 制定策略 → 批次 dispatch 比逐個更高效。」

## 任務
1. 盤點來源：`data/reflections.jsonl` + 低分元件（skill-judge 分數 <80）+ 既有 rule D/F 級
2. 分類：P0（阻塞）/ P1（高價值）/ P2（優化）
3. 合併相似項（同一檔案多個建議 → 一個 dispatch）
4. 批次 dispatch（並行無依賴項）
5. 收尾跑 structural + behavioral eval 確認無退步

## 驗收標準
- 23 項全部有處置結果（完成 / 合併 / 延後 + 原因）
- Eval 分數不退步
