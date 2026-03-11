# Proposal 格式樣板

## 功能名稱

`pm-workflow-selection-and-visual-brainstorming`

## 需求背景（Why）

### 問題一：PM workflow 選擇一律 quick，導致設計意圖消失

PM agent 在規劃多次迭代佇列時，幾乎所有任務都被指定為 `quick` workflow。`quick` 跳過了 PLAN/ARCH/TEST:spec 階段，設計意圖只存在於 agent context window，session 結束後消失。實際案例：novaplay 的 Tap Dash 專案有 15 個 archived feature，其中 12 個 quick 只有 `tasks.md`，碰撞偵測/計分系統等有設計決策的功能無任何規格留存。

**根因**：PM agent prompt 的 Workflow 建議矩陣（`pm/SKILL.md` 第 161-168 行）過於簡略，缺少具體的複雜度判斷準則，PM 無法根據任務特徵做出正確選擇。

### 問題二：PM/PLAN/ARCH 階段缺乏視覺化

Overtone 所有設計決策都是純文字互動（表格比較、文字 BDD）。Superpowers 等競品有視覺化伴侶（HTML cards/mockup/pros-cons）協助設計階段決策。Overtone 已有 Chrome MCP 工具，可以更輕量方式達成類似效果，但 PM/architect agent 目前沒有引用任何視覺化 reference。

### 目標

1. PM 能根據任務複雜度選擇正確的 workflow（quick/standard/full），重要功能留下規格
2. PM/architect 在設計決策階段可選擇性使用視覺化伴侶，提升決策品質與文件完整度

### 優先級

- 問題一影響每次使用 PM 規劃多次迭代的品質，修改成本低，優先做
- 問題二是能力強化，改善體驗但非緊急

---

## 使用者故事

```
身為 PM agent
我想要有明確的 workflow 複雜度判斷規則
以便在規劃佇列時選出正確的 workflow 類型，確保設計決策被保存
```

```
身為 PM agent
我想要視覺化伴侶工具
以便在比較方案或說明架構時，提供更清晰的決策支援
```

```
身為 architect agent
我想要視覺化伴侶工具
以便在 ARCH 階段呈現架構方案的視覺化比較
```

---

## 範圍邊界

### 在範圍內（In Scope）

**需求一：Workflow 選擇指引**
- 在 `~/.claude/skills/pm/references/` 新增 `workflow-selection-guide.md`
- 定義複雜度判斷矩陣（quick/standard/full/single 的判斷準則）
- 更新 `~/.claude/skills/pm/SKILL.md` 的 Workflow 建議矩陣，引用詳細指引
- 更新 `~/.claude/agents/product-manager.md` DO 區塊，加入複雜度判斷規則引用

**需求二：Visual Brainstorming**
- 在 `~/.claude/skills/thinking/references/` 新增 `visual-brainstorming.md`
  - 定義觸發時機（何時用視覺 vs 純文字）
  - 提供 HTML 元件模板（cards/mockup/pros-cons/split）
  - 說明 Chrome MCP 展示方式（寫 HTML 檔 + `mcp__claude-in-chrome__navigate` 展示）
- 更新 `~/.claude/skills/thinking/SKILL.md`，在資源索引加入 `visual-brainstorming.md`
- 更新 `~/.claude/agents/product-manager.md` skills frontmatter 加入 `thinking`
- 更新 `~/.claude/agents/architect.md` 的視覺化選項說明（architect 已有 thinking skill）

### 不在範圍內（Out of Scope）

- 自建 HTTP server / WebSocket server（用 Chrome MCP 替代）
- 強制所有 PM/ARCH 階段都使用視覺化（保持可選）
- 修改 workflow 本身的執行邏輯
- 修改 interview.js 引擎

---

## 子任務清單

### Phase 1：Workflow 選擇指引（可先行）

**T1**：新增 `workflow-selection-guide.md`
- 負責 agent：developer
- 相關檔案：`~/.claude/skills/pm/references/workflow-selection-guide.md`（新增）
- 說明：撰寫複雜度判斷矩陣，涵蓋決策樹（涉及新系統/狀態管理/API 設計 → standard；多子系統/UI → full；單一檔案修改 → quick；文字/設定小修 → single）+ 邊界案例 + 範例清單

**T2**：更新 `pm/SKILL.md` Workflow 建議矩陣（依賴 T1）
- 負責 agent：developer
- 相關檔案：`~/.claude/skills/pm/SKILL.md`
- 說明：在現有 Workflow 建議矩陣下加入「詳見 workflow-selection-guide.md」引用，並補強判斷規則描述

**T3**：更新 `product-manager.md` DO 區塊（依賴 T1）
- 負責 agent：developer
- 相關檔案：`~/.claude/agents/product-manager.md`
- 說明：在 DO 區塊新增規則「規劃佇列時 MUST 根據 workflow-selection-guide.md 的複雜度矩陣選擇 workflow」

### Phase 2：Visual Brainstorming（可與 Phase 1 並行）

**T4**：新增 `visual-brainstorming.md`（可與 T1 並行）
- 負責 agent：developer
- 相關檔案：`~/.claude/skills/thinking/references/visual-brainstorming.md`（新增）
- 說明：撰寫觸發準則、HTML 元件模板（cards/mockup/pros-cons/split CSS 片段）、Chrome MCP 操作方式、輸出路徑慣例（`/tmp/overtone-viz-{feature}.html`）

**T5**：更新 `thinking/SKILL.md` 資源索引（依賴 T4）
- 負責 agent：developer
- 相關檔案：`~/.claude/skills/thinking/SKILL.md`
- 說明：在「資源索引」表格加入 `./references/visual-brainstorming.md` 一行

**T6**：更新 `product-manager.md` skills frontmatter（依賴 T4 T5）
- 負責 agent：developer
- 相關檔案：`~/.claude/agents/product-manager.md`
- 說明：在 frontmatter skills 陣列加入 `thinking`（讓 PM 消費 thinking skill 含 visual-brainstorming reference）

---

## 開放問題

- **architect 端是否需要更新**：architect.md 已有 `thinking` skill。T4 完成後 architect 即可自動使用 visual-brainstorming reference，可能不需額外修改——留 architect 確認
- **visual-brainstorming HTML 路徑慣例**：輸出到 `/tmp/` 還是 `~/.overtone/viz/`？需 architect 決定
- **Chrome MCP 工具可用性邊界**：mcp__claude-in-chrome__navigate 在 subagent（PM/architect）context 中是否可用？需 architect 確認工具存取策略
