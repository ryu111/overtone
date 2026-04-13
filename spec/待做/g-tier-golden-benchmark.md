# G-tier Golden Benchmark Set

## 來源
Cross-dispatch xd-1776089233733-6i6o（block-world session 建議，Manager 轉派）。

## 背景
block-world 跑 31B baseline 回報 10/10 first-shot、16.93 tok/s，但挑戰：此結果無法區分 26B→31B 品質差異（block-world 等級任務太簡單）。benchmark 應住在 nova-brain 而非 L5 專案。

## 範圍
建 `tests/benchmark/g-tier/` 含：

### 1. Golden prompt set（20-30 題）
- **easy (10)**：函數/module/refactor — 應 100% 過，測速度
- **medium (10)**：locked context + 多檔 consistency — 26B 曾失敗的 pattern
- **hard (5-10)**：複雜 rule + BDD constraint — 測推理極限

### 2. Runner
- 支援 `--model` 參數（26B / 31B / haiku 對照）
- 使用 block-world 的 prompt 格式：temperature 0.2、max_tokens 150-500

### 3. Report 產出
- `reports/g-tier-benchmark-<model>-<date>.md`
- 每 task pass/fail + tok/s + failure pattern

## 驗收
- 跑 31B → 全通過 easy、hard 有失敗（若全過 = 任務不夠難需加）
- 跑 haiku → medium 起有失敗才算合理 baseline
- 關鍵：easy set 區分 tok/s，hard set 才區分品質

## 深度
D3（benchmark 設計 + runner 實作 + 3 model 對照跑 + report）。

## 下輪處理
留給下個 ralph-loop iteration 或使用者授權後啟動 planner agent 規劃。
