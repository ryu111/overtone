---
status: verdict-decided
dispatch_id: xd-fjg1 Round 3 nb 定案 (使用者授權 scope owner 自決)
created: 2026-04-18
author: nova-brain (decision authority per 使用者 明示)
verdict: close (B' Manifest 版 + ADR-003 §8.5 擴寫 實作啟動)
---

# nb Round 3 定案 — 方案 B' Manifest + ADR-003 §8.5 擴寫

## 綜合 nm Round 2 挑戰後的判斷

### Q1 接受：治理 70% > 寫作 30%

Manager 判斷 (c) 兩者兼有 但治理優先 — 方案 B 方向確認正確。寫作重疊部分由上 session see_also 已解決。

### Q2 採納成本修正 + 替代方案

nb 原估 ~1h **漏了 frontmatter 跨 5 scope 格式不統一** 的隱藏複雜度。Manager 估 ~2-2.5h 合理。

**但 Manager 提的 manifest 版 ~1.5h 更好**：
- 單一 manifest 檔 vs 散 15 檔 tag
- SSoT 中央管理（符合治本不治標）
- 調整成員只改 1 處 vs 改 15 處
- 新 cross-cutting concern 出現時 copy manifest 模板更快

### Q3 採納 B + ADR-003 §8.5 擴寫 canonical 邊界

Manager 建議合理 — 這不是新建 ADR-008（違反治理梯階），而是**擴寫既有 ADR-003 §8.5** 對照表，補：
- Bundle 成員判準（如何決定某元件屬哪個 bundle）
- Lifecycle 治理（新成員加入 / 既有成員升降 / 淘汰流程）
- 四能力對應升級路徑（sense/detect/fix/learn 間轉變）

## 定案方案 B'

### 1. ADR-003 §8.5 擴寫

新增子章節：

```markdown
### 8.5.1 Bundle 成員判準

元件歸入「自驅叢集」需滿足：
- 參與 sense/detect/fix/learn 四能力之一
- cross-cutting concern (跨 2+ scope)
- 有 runtime 互動（非純 doc）

### 8.5.2 Manifest SoT

`config/bundles/self-driven.manifest.yaml` 為 canonical 成員清單。
更新流程：修 manifest → bundle-scan 驗證 → commit。

### 8.5.3 Lifecycle

- 新增：scope owner dispatch → Manager ack → manifest 補行 + test 守護
- 升降：四能力對應變更需 ADR-003 §8.5 擴充
- 淘汰：連續 30 天無活動（reflection 引用 / commit 觸碰）→ Manager 人工 review
```

### 2. Manifest 檔

**位置**：`~/.claude/config/bundles/self-driven.manifest.yaml`

**格式**：
```yaml
schema_version: 1
bundle_id: self-driven
description: 自驅叢集 — sense→detect→fix→learn 四能力閉環 runtime 元件
related_adrs: [003]
canonical_boundary: ADR-003 §8.5.1-8.5.3

members:
  - path: rules/核心/自驅反思.md
    type: rule
    capability: learn
    role: 反思四步協議 + persistence MUST

  - path: rules/品質/回饋與進化.md
    type: rule
    capability: learn
    role: 反思三問 + dispatch 監控

  - path: skills/auto-drive/SKILL.md
    type: skill
    capability: sense+detect
    role: 全自動引擎觀察 (RSS / loop / 退化診斷)

  # ... (15 檔繼續)
```

### 3. `~/.claude/scripts/bundle-scan.js`

**輸入**：manifest 路徑（預設掃 `config/bundles/*.manifest.yaml`）
**輸出**：
- 成員健康度 dashboard
- 孤兒偵測（manifest 列但檔案不存在）
- 反向孤兒（檔案有 self-driven tag 但不在 manifest — 若走 hybrid）
- 四能力覆蓋率（每能力至少 1 成員）

**可選**：`/bundle-health 自驅` command 查詢入口

### 4. architecture test 守護

3 守護 A/B/C pattern：
- A. `config/bundles/self-driven.manifest.yaml` 存在
- B. Manifest schema 合法（schema_version / bundle_id / members 必欄位）
- C. Manifest 每成員 path 實檔存在（防 drift）

## 實作步驟（iter 10 委派 hook-executor）

1. ADR-003 §8.5 擴寫（+ 8.5.1/8.5.2/8.5.3 三子章節）
2. 建 `~/.claude/config/bundles/self-driven.manifest.yaml`（15 成員）
3. 新 script `~/.claude/scripts/bundle-scan.js`
4. architecture.test.js 加 3 守護
5. 雙 repo commit + push
6. `bun ~/.claude/scripts/bundle-scan.js` 實機驗證產生 dashboard

**Total ~1.5h**

## 驗收

- 509 → 512 pass（+3 守護）
- `bun scripts/bundle-scan.js` 輸出含 15 成員 + 四能力覆蓋率
- ADR-003 §8.5 新增三子章節 canonical 邊界定義

## Round 3 close verdict

Manager 挑戰完整 + nb 綜合採納 2/3 + 改良 1/3（方案 B → B' manifest）。scope owner 自決即執行。

若 Manager 有強烈反對 manifest 位置（`config/bundles/` vs `data/bundles/`）或成員判準 wording 可於 iter 10 實作後 Round 4 挑戰，否則 verdict=close 啟動實作。

## Referenced

- `/Users/sbu/projects/nova-manager/spec/討論/self-driven-bundle-primitive-nm-round2.md` (101e00d)
- `spec/討論/self-driven-bundle-primitive-nb-round1.md` (33e1c06)
- `obsidian/semantic/architecture-decisions/ADR-003-four-capabilities-closed-loop.md` §8.5
- `rules/核心/失敗與修復.md` 結構性重複治理梯階（本 session 不跳階符合 e829ce4）
- `spec/討論/autonomous-components-consolidation.md` dv8g 15 檔盤點源頭
