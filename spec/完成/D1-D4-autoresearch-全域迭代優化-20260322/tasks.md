# Autoresearch 全域迭代優化

## Phase 1 — 今天就能做（有資料、有指標）

| # | 目標 | 狀態 | Baseline | 最終 |
|:-:|------|:----:|:--------:|:----:|
| 1 | Guard regex FPR | **done** | 93.3% | **100%** |
| 2 | Judge 語意評分 prompt | ceiling(96%) | 96.2% | 96.2% |
| 3 | 行為分類 prompt | ceiling(90%) | 90.0% | 90.0% |
| 4 | 信心公式常數 | skip(100%) | 100% | 100% |
| 5 | 確定性評分權重 | skip(100%) | 100% | 100% |
| 6 | 行為門檻值 | **done** | 81.0% | **94.4%** |

## Phase 2 — 需標記 ground truth（半天建好）

| # | 目標 | 狀態 | Baseline | 最終 |
|:-:|------|:----:|:--------:|:----:|
| 7 | Session 摘要 prompt | **done** | 52% | **63%** |
| 8 | F 級改善建議 prompt | ceiling(40%) | 40% | 40% |
| 9 | 根因分析 prompt | **done** | 36% | **46%** |
| 10 | 工具推薦 prompt | ceiling(keyword) | 72.5% | **86.8%** |
| 11 | 決策 prompt | ceiling(90%) | 80-90% | 90.0% |

## Phase 3 — 需基礎設施

| # | 目標 | 狀態 |
|:-:|------|:----:|
| 12 | 28 個 Skill description | pending |
| 13 | 3 個 Agent prompt | pending |
| 14 | Gap 優先級權重 | pending |
| 15 | Heartbeat 間隔 | pending |

## 閉環檢查

每個迭代完成後：
- [x] eval cases + run.js 提交
- [x] results.tsv 記錄最終結果
- [x] 如果改了 guards/scripts → 確認測試通過
- [x] 如果改了 skill/agent → 閉環檢查（元件依賴）
- [x] 更新本 tasks.md 狀態

## 結論

Phase 1-2 共 11 個 eval 全部迭代完成：
- **6 個有效改善**：Guard 93→100%、門檻值 81→94%、Local Model 70→90%、摘要 52→63%、根因 36→46%、工具推薦 73→87%
- **3 個 ceiling**：分類 90%、語意評分 96%、決策 90%
- **2 個 skip**：確定性邏輯 100%
- eval 方法升級：keyword overlap → LLM-as-Judge 語意相似度（解鎖 #7 #8 #9）

Phase 3 需要事件追蹤基礎設施，待後續建設。
