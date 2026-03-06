# 任務拆分指南（Task Splitting Guide）

> 版本：v1.0（2026-03-07）
> 適用對象：developer agent（DEV 階段並行拆分決策）

---

## 1. 並行拆分判斷標準

### 可並行（同時委派多個 subagent）

以下三個條件同時成立時，任務可拆分並行：

| 條件 | 說明 |
|------|------|
| 操作不同檔案 | 每個子任務修改各自的檔案，無共同寫入目標 |
| 無邏輯依賴 | B 不需要 A 的輸出作為輸入 |
| 輸入完整 | 每個子任務的規格獨立可執行，不需等待中間結果 |

### 不可並行（單一 agent 或依序執行）

以下任一條件成立時，不可並行：

- 修改同一個檔案（衝突風險）
- B 的輸入依賴 A 的輸出（如：測試依賴實作完成）
- 共享狀態寫入（如：修改同一個 JSON 設定檔）
- 任務粒度過小（overhead > benefit，例如：單行修改不值得拆分）

### 粒度評估

```
子任務預估工時 < 5 分鐘？
  → 合併到單一 agent（overhead 不划算）

子任務操作 > 3 個相關檔案且邏輯高度關聯？
  → 合併（避免 context 碎片化）

其餘：拆分並行
```

---

## 2. Mode A vs Mode B 決策樹

### Mode A：有 specs（tasks.md 存在）

```
讀取 specs/features/in-progress/{featureName}/tasks.md
↓
找到 Dev Phases 區塊
↓
每個 Phase 內的 Task 列表 → 評估可並行性
  ├─ Phase 內多個 Task 操作不同檔案 → 並行委派
  └─ Phase 內任務有依賴鏈 → 序列執行
↓
Phase 之間：後 Phase 依賴前 Phase 通過 → 串行
```

tasks.md 格式範例：
```markdown
## Dev Phases

### Phase 1（基礎層）
- T1: 實作 parser.js
- T2: 實作 formatter.js   ← T1/T2 操作不同檔案 → 可並行

### Phase 2（整合層）
- T3: 更新 index.js 整合 T1+T2   ← 依賴 Phase 1 完成 → 串行
```

### Mode B：無 specs（無 tasks.md）

```
讀取 Handoff 的需求清單
↓
自行分析子任務間的依賴關係
  ├─ 獨立子任務（操作不同模組）→ 並行
  └─ 有依賴的子任務 → 排序後串行
↓
退化情況：只有一個子任務 → 單一 agent 執行，不拆分
```

---

## 3. 失敗隔離策略

### 子任務失敗時的處理原則

```
子任務 A 失敗，子任務 B/C 成功
↓
只重試失敗的子任務 A
不回退 B/C 的成果（除非 A 的失敗影響 B/C 的正確性）
```

### 失敗影響評估

| 情況 | 處理方式 |
|------|----------|
| A 失敗，B/C 操作完全不同的模組 | 只重試 A，保留 B/C |
| A 失敗，B/C 的正確性依賴 A | 重試 A 後，重新驗證 B/C |
| A 是核心模組，B/C 是其消費者 | A 先修復，B/C 可能需要跟進調整 |

### 重試指引

- 重試時傳入原始 Handoff + A 的失敗訊息（不是全部重來）
- 若同一子任務 3 次重試仍失敗 → 升級為人工介入

---

## 4. 實際範例

### 範例 1：測試檔案並行（S1 + S2）

```
任務：為 state.js 兩個新函式各別撰寫測試

子任務 S1：tests/unit/state-parser.test.js（新檔）
子任務 S2：tests/unit/state-formatter.test.js（新檔）

判斷：操作不同檔案 + 無邏輯依賴 → 並行委派兩個 developer
```

### 範例 2：Handler 函式並行（T2 + T3）

```
任務：Phase 2 — 更新 session-start-handler.js 和 agent-stop-handler.js

子任務 T2：修改 session-start-handler.js 加入 X 邏輯
子任務 T3：修改 agent-stop-handler.js 加入 Y 邏輯

判斷：操作不同 handler 檔案 + 兩者邏輯不相依 → 並行
```

### 範例 3：文件並行（T4a-d + T5）

```
任務：Phase 3 — 更新 5 份 reference 文件

子任務 T4a：更新 docs/spec/overtone.md
子任務 T4b：更新 docs/spec/overtone-agents.md
子任務 T4c：更新 docs/reference/testing-guide.md
子任務 T4d：更新 docs/status.md
子任務 T5：更新 CLAUDE.md

判斷：所有子任務操作不同檔案 + 純文件修改無邏輯依賴 → 全部並行
```

### 範例 4：不可並行的情況

```
任務：實作新 API + 撰寫對應測試

子任務 A：實作 lib/my-feature.js
子任務 B：撰寫 tests/unit/my-feature.test.js

判斷：B 需要 A 的 export 才能 import 測試 → 串行（A → B）
```

---

## 5. 合併條件

以下情況應合併為單一 agent 執行，不拆分：

1. **關聯性高**：兩個修改邏輯上強耦合，分開反而增加協調成本
2. **粒度過細**：每個子任務修改少於 20 行，拆分 overhead 不值得
3. **依賴複雜**：依賴關係難以明確切割，合併避免遺漏
4. **測試覆蓋同一功能**：多個測試改動針對同一功能的不同面向，合併確保一致性

---

## 6. 委派格式

並行委派時，每個子任務的 Handoff 格式：

```
## HANDOFF: main → developer（子任務 N/M）

### Context
[整體任務背景] — 子任務 N：[具體範圍]

### Findings
[此子任務的輸入資料、設計決策]

### Files to Modify
[只列此子任務負責的檔案]

### Constraint
- 不可修改其他子任務負責的檔案
- 若發現跨任務依賴，回報給 Main Agent 而非自行調整
```
