# G-tier Golden Benchmark Set — 設計文件

## 來源
Cross-dispatch xd-1776090572370-jzms（nova-manager 授權，可跨多輪 ralph-loop 推進）。
前置：block-world `reports/g-tier-31b-baseline.md`（2026-04-13）。

## 為什麼 block-world baseline 不夠

block-world 的 10 task 全部 100% first-shot 通過，原因：
- 都是函數/模組/Three.js 基本整合，**4B active 時期就能處理**
- 無法區分 26B vs 31B 品質差異（兩者都會過）
- 缺乏「26B 失敗過的 case」作為 quality 判別點

結論（block-world 報告原話）：
> 需要加入 26B A4B 失敗過的 task 才能驗證品質提升。
> baseline 應住在 nova-brain，每次換模型跑同一批，數字才可比較。

## 目標

1. **Golden prompt set（25 task）**：跨三個難度區間，每次換模型跑同一批
2. **Runner**：直連 endpoint（不走 multi-tier-loop，避免升級階梯干擾量測）
3. **Report**：3 model 對照表（26B / 31B / haiku），區分速度與品質

## 難度分層設計（關鍵）

### Easy (10 task) — 區分 **速度**
**原則**：所有測試模型都應 100% 通過，只比 tok/s。
**來源**：直接複用 block-world 的 10 題（已驗證 31B baseline），確保可追溯。

| # | task | 類型 | 預期 tok | 原 baseline tok/s |
|---|------|------|---:|---:|
| 1 | easy_01_simple_fn | 函數宣告 | 20-30 | 14.44 |
| 2 | easy_02_module | ES module + Three.js | 100-120 | 21.67 |
| 3 | easy_03_refactor | var → const/arrow | 15-25 | 12.95 |
| 4 | easy_04_algo | reduce sum | 25-35 | 17.26 |
| 5 | easy_05_edit | 變數改名 | 20-30 | 10.55 |
| 6 | easy_06_chunk | 雙迴圈 chunk | 100-120 | 9.03 |
| 7 | easy_07_raycast | Three.js Raycaster | 180-220 | 23.08 |
| 8 | easy_08_state | class + Vector3 | 140-160 | 21.99 |
| 9 | easy_09_fix_bug | off-by-one 修復 | 40-50 | 16.89 |
| 10 | easy_10_dayNight | sin/lerp 光照 | 120-140 | 21.42 |

### Medium (10 task) — 區分 **多檔 consistency + locked context**
**原則**：26B 常失敗的 pattern — 「給定 A 修 B，26B 會忽略 A 的約束」。

**設計方向**（具體 prompt 留下一輪實作）：
- `med_01_multifile_api`: 給 types.ts 定義 User，在 user-service.ts 實作 CRUD，**不得**改 types.ts（鎖定）→ 測 26B 常犯的「invent 新 field」
- `med_02_locked_deps`: 給 package.json 鎖定版本，prompt 要求用某 API 新寫法（該版本不支援）→ 應拒絕或用該版本支援的寫法
- `med_03_consistent_naming`: 給 3 個 module 的命名慣例（snake_case func, PascalCase class）→ 要求新增符合慣例的函數
- `med_04_trace_import`: 給 a.ts 匯入 b.ts 的 X，b.ts 匯出 X 與 Y → 重構 X 到 c.ts，更新 a.ts import，**不得**動 Y
- `med_05_preserve_behavior`: 給 runtime behavior（console.log 順序），重構 impl 不改 output 順序
- `med_06_error_channel`: 給 catch + rethrow 模式，要求統一錯誤 code → 26B 常漏 try/catch 點
- `med_07_config_read`: 讀 config.json 而非 hardcode（配合 config-sot skill 的精神）
- `med_08_hook_constraint`: 給 nova hook 的 return format 約束，寫一個 hook handler
- `med_09_test_first`: 給 test case，實作讓 test pass（不修 test）
- `med_10_migration`: API 舊介面 deprecated，給 migration guide → 寫向後相容 shim

### Hard (5 task) — 區分 **推理極限**
**原則**：複雜 rule + BDD + 架構決策。31B 應該開始失敗部分，haiku 可能整批掉。

- `hard_01_rule_conflict`: 給 3 條 rule（A 優先 > B 優先 > C 優先，A 與 C 衝突），問「某情境該用哪條」+ 解釋優先序
- `hard_02_bdd_chain`: Given 5 狀態 → When 6 動作 → Then 8 結果，寫出所有合法 state transition
- `hard_03_type_design`: 設計一個類型，同時滿足 5 個 invariant（部分互相拉扯）
- `hard_04_arch_tradeoff`: 給場景 + 3 架構方案 + 5 品質屬性，產評分決策矩陣
- `hard_05_root_cause`: 給 bug 症狀 + 4 嫌疑點，推根因 + 最小修復（不是症狀緩解）

## Runner 架構

### 目錄結構
```
tests/benchmark/g-tier/
├── runner.js              # 主入口，支援 --model, --set (easy/medium/hard/all)
├── prompts/
│   ├── easy.json          # id, prompt, max_tokens, checker?
│   ├── medium.json
│   └── hard.json
├── checkers/              # hard/medium task 的 pass/fail 檢查邏輯
│   ├── med_01_multifile_api.js
│   └── ...
└── lib/
    ├── direct-client.js   # 直連 /v1/chat/completions
    └── report-writer.js   # 產 markdown 表格
```

### Prompt schema
```json
{
  "id": "med_01_multifile_api",
  "level": "medium",
  "prompt": "...",
  "system_prompt": "...(optional)",
  "temperature": 0.2,
  "max_tokens": 300,
  "check": {
    "type": "regex | llm | custom",
    "rules": [ "must contain", "must not contain" ],
    "custom": "checkers/med_01_multifile_api.js"
  }
}
```

### 執行模式
```bash
# 單模型單 set
bun tests/benchmark/g-tier/runner.js --model 31b --set easy

# 全部對照
bun tests/benchmark/g-tier/runner.js --model 31b,26b,haiku --set all

# Dry-run（不呼叫 endpoint，只驗 prompt schema）
bun tests/benchmark/g-tier/runner.js --dry-run
```

### Report 格式
```markdown
# g-tier-benchmark-<model>-<date>.md

## 參數
- Model / Endpoint / Temperature / max_tokens / Sample count

## 結果總覽
| set    | pass | fail | pass% | avg tok/s | median tok/s |
|--------|-----:|-----:|------:|----------:|-------------:|
| easy   |  10  |  0   | 100%  | 16.93     | 17.08        |
| medium |  7   |  3   |  70%  | 14.20     | 13.50        |
| hard   |  2   |  3   |  40%  | 12.10     | 11.80        |

## 逐 task
| # | id | pass | tok | elapsed | tok/s | failure reason |

## 失敗 pattern 分類
- locked context 違反: X 題
- 命名慣例漏: Y 題
- 推理鏈斷裂: Z 題
```

## 跨模型對照 report
```markdown
# g-tier-benchmark-compare-<date>.md
| task | 31b | 26b | haiku |
|------|:---:|:---:|:---:|
| easy_01 | ✅ 20 tok/s | ✅ 18 tok/s | ✅ 45 tok/s |
...
```

## 驗收條件

1. **easy set**: 31B 全過（若沒全過表示 prompt 寫壞了，非模型問題）
2. **medium set**: 31B 7-9 過、haiku 3-5 過（若完全一樣就是 medium 太簡單）
3. **hard set**: 31B 2-3 過、haiku 0-1 過（若 31B 全過就是 hard 不夠難）
4. **總體**：區分力（spread）夠大 — 26B 與 31B total pass count 差 ≥ 5；haiku 與 31B 差 ≥ 8

## 實作計畫（跨輪）

### 輪 1（本輪完成）
- [x] 讀 block-world baseline
- [x] Move spec 到 spec/進行中/
- [x] 寫設計文件（本檔）

### 輪 2
- [ ] 寫 `prompts/easy.json`（複用 block-world 10 題）
- [ ] 寫 `lib/direct-client.js` + runner 主幹
- [ ] Dry-run 驗 schema

### 輪 3
- [ ] 寫 `prompts/medium.json`（10 題含 rationale 註解）
- [ ] 寫對應 checker
- [ ] 跑 31B medium 看初始分布

### 輪 4
- [ ] 寫 `prompts/hard.json`（5 題）
- [ ] 寫對應 checker
- [ ] 跑 31B hard

### 輪 5
- [ ] 跑 3 model 完整對照
- [ ] 產 compare report
- [ ] 驗收：區分力是否足夠，調 prompts 直到滿足

## 關鍵風險

1. **Medium/Hard 需要真實 26B 失敗樣本**：我目前是「推測 26B 弱點」，實際可能不準。若能取得 block-world 之前用 26B 時的失敗 log 會更好 — 建議 Manager 確認來源。
2. **Hard set 的 checker 難寫**：rule conflict / type design 這類 prompt 沒有固定答案，可能需要 LLM-as-judge（同模型評分可能 self-bias）或人工抽查。先寫 regex checker + 人工 spot-check 為主。
3. **Runner 時間不穩定**：冷啟動、並發、記憶體壓力都影響 tok/s。要加 warm-up + 多輪取中位數。

## 與既有元件的關係

- **config-sot skill**：med_07_config_read 的設計反向引用本 skill（benchmark 是驗證 skill 被遵守的工具）
- **local-model.json**：runner 讀此 config 拿 endpoint，不硬編
- **nova-test skill**：本 benchmark 本質是「測模型能力」而非「測程式碼行為」，歸類特殊，參考 Testing Trophy 決策樹時要明確區分
