# Instinct 進化模式與決策樹

> 📋 **何時讀取**：評估 instinct 是否該進化為 Skill 或 Agent、或決定繼續觀察時。

## 兩種進化路徑

```
Instinct（觀察記錄）
  │
  ├──→ Skill（知識域）── 被動注入，由 Agent 消費
  │
  └──→ Agent（專職角色）── 主動執行，有停止條件
```

### 進化路徑比較

| 面向 | Instinct → Skill | Skill → Agent |
|------|------------------|---------------|
| 觸發條件 | 同 tag 觀察 >= 5 且平均信心 >= 0.7 | Skill 被 3+ agent 消費 + 含多步驟流程 |
| 產出物 | `skills/<name>/SKILL.md` + references | `agents/<name>.md` + Hook 注入 |
| 複雜度 | 知識整理（規則、查表） | 角色定義（邊界、停止條件、信心過濾） |
| 可逆性 | 低成本回退（刪除 Skill 即可） | 高成本回退（需拆除 Hook 串接） |

## Instinct → Skill 進化模式

### 進化前的徵兆

| 徵兆 | 說明 | 範例 |
|------|------|------|
| 高頻重複 | 同一 pattern 在多個 session 被記錄 | "bun test 前需 bun install" 出現 8 次 |
| 跨場景適用 | 不同 workflow/stage 都適用 | "commit 前跑 lint" 在 DEV、REVIEW 都觸發 |
| 規則可明文化 | 觀察內容可寫成 IF-THEN 規則 | "IF tsconfig.json 存在 THEN 先跑 tsc --noEmit" |
| 無矛盾觀察 | 同 tag 下沒有互斥的記錄 | 全部觀察方向一致，無 `-0.10` 矛盾 |

### 進化執行步驟

1. **聚類確認**：`instinct.js summarize` → 檢查 `evolutionCandidates.skills`
2. **知識萃取**：從同 tag 觀察提煉出 3-7 條可操作規則
3. **格式化**：撰寫 SKILL.md（職責、步驟、限制）+ references（查表、決策樹）
4. **元件建立**：`manage-component.js create skill '{"name":"...","description":"..."}'`
5. **串接驗證**：確認至少 1 個 agent 在 frontmatter 列出新 Skill

### 不該進化的情況

| 情況 | 原因 | 處置 |
|------|------|------|
| 觀察數夠但信心分散（std > 0.15） | 知識未收斂，可能有子群 | 繼續觀察，考慮拆分 tag |
| 僅限特定專案適用 | 不具泛用性 | 留在 instinct，標記 project-specific |
| 已有 Skill 覆蓋 | 重複建立無意義 | 將觀察歸入現有 Skill 的 references |
| 含主觀偏好（非客觀規則） | Skill 應是確定性知識 | 保留為 instinct 自動應用即可 |

## Skill → Agent 進化模式

### 進化前的徵兆

| 徵兆 | 說明 | 範例 |
|------|------|------|
| 多步驟流程 | Skill 內容涵蓋 3+ 步驟的執行序列 | verify Skill 有 6 階段依序執行 |
| 需要決策能力 | 步驟間有條件分支，非線性執行 | "失敗時降級 → 再失敗時跳過" |
| 被多個 agent 重複使用 | 3+ agent 都在 frontmatter 引用 | testing Skill 被 DEV/QA/E2E agent 共用 |
| 需要獨立 context | 執行時需要大量專屬上下文 | security 審查需載入漏洞資料庫 |
| 產出物明確 | 有可驗證的輸出（report、score、artifact） | code-review 產出 PASS/REJECT verdict |

### 進化執行步驟

1. **需求確認**：確認 Skill 已被穩定消費且有獨立執行的需求
2. **角色設計**：定義 agent 的四模式（信心過濾、邊界清單、誤判防護、停止條件）
3. **元件建立**：`manage-component.js create agent '{"name":"...","model":"sonnet",...}'`
4. **Hook 串接**：確認 `pre-task.js` 能正確注入 workflow context
5. **Skill 保留**：原 Skill 不刪除，改為 agent 的 knowledge source
6. **回歸測試**：驗證新 agent 在 workflow 中能正確執行和停止

### 不該進化的情況

| 情況 | 原因 | 處置 |
|------|------|------|
| 只有單一消費者 | Agent 開銷不值得 | 保持 Skill，由消費者 inline 使用 |
| 無明確停止條件 | Agent 必須能判斷何時完成 | 先定義完成標準再考慮進化 |
| 知識仍在快速變動 | Agent 建立後修改成本高 | 等知識域穩定後再進化 |
| 執行步驟可完全自動化 | 不需要 AI 決策 | 寫成 Hook script 更合適 |

## 進化決策樹

```
觀察群（同 tag）
  │
  ├─ 觀察數 < 5？
  │    └─→ ⏳ 繼續觀察（資料不足）
  │
  ├─ 平均信心 < 0.7？
  │    └─→ ⏳ 繼續觀察（信心不足）
  │
  ├─ 標準差 > 0.15？
  │    └─→ 🔀 拆分 tag（知識未收斂，可能混雜不同子群）
  │
  ├─ 已有 Skill 覆蓋？
  │    └─→ 📎 歸入現有 Skill references
  │
  ├─ 僅限特定專案？
  │    └─→ 📌 標記 project-specific，保留為 instinct
  │
  └─ 通過所有檢查？
       │
       ├─ 可寫成 IF-THEN 規則（無分支）？
       │    └─→ ✅ 進化為 Skill
       │
       ├─ 含多步驟 + 條件分支 + 3+ 消費者？
       │    └─→ ✅ 進化為 Agent
       │
       └─ 介於兩者之間？
            └─→ ✅ 先進化為 Skill，觀察使用模式後再評估 Agent
```

## 進化後的維護

### 定期檢查（建議每月）

| 檢查項 | 方法 | 行動 |
|--------|------|------|
| Skill 使用率 | 檢查哪些 agent frontmatter 引用 | 0 消費者 → 考慮降級或刪除 |
| Agent 執行成功率 | `data.js query timeline --stage <STAGE>` | 低於 70% → 調整 prompt 或降級 |
| 新 instinct 與現有 Skill 重疊 | `instinct.js summarize` 交叉比對 | 重疊 → 歸入現有 Skill |
| 知識過時 | references 內容與實際行為不符 | 更新 references 或標記廢棄 |

### 降級路徑

```
Agent（不再需要獨立執行）
  └─→ 降級為 Skill（刪除 agent.md + Hook 解除 + 保留 Skill）

Skill（不再有消費者）
  └─→ 降級為 Instinct（刪除 Skill 目錄 + 保留觀察記錄供參考）

Skill（知識已過時）
  └─→ 刪除（清除 Skill 目錄 + 從 agent frontmatter 移除引用）
```
