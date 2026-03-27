# health-check.js — 任務分解

## 深度路由：D2
**planner → executor**

---

## Phase 1：核心實作（sequential）

### T1：health-check.js 主體
- **執行者**：executor
- **檔案**：`~/.claude/scripts/health-check.js`（新增，~500 行）
- **內容**：
  1. scan 層：scanSkills、scanAgents、scanHooks、scanModules（共用 fs 掃描 + frontmatter 解析）
  2. check 層：checkClosedLoop、checkSkillCoverage、checkHookIntegrity、checkAgentAlignment
  3. orchestrator 層：runAll、runQuick
  4. CLI 層：argv 解析 + JSON stdout
- **驗收**：`bun ~/.claude/scripts/health-check.js` 輸出合法 JSON

### T2：單元測試 + 整合測試
- **執行者**：executor
- **檔案**：`~/projects/nova-brain/tests/health-check.test.js`（新增，~300 行）
- **依賴**：T1 完成
- **內容**：
  1. scan 層測試（scanSkills、scanAgents、scanHooks 回傳正確結構）
  2. 每個 check 函式的陽性測試（偵測到已知缺口）
  3. runAll / runQuick 格式測試
  4. CLI 整合測試（exec 後解析 stdout JSON）
  5. 真實 `~/.claude/` 整合測試（當前系統 0 個 critical finding）
- **驗收**：`bun test` 全部通過

---

## Phase 2：整合驗證（sequential，依賴 Phase 1）

### T3：smoke-test.js 整合
- **執行者**：executor
- **檔案**：`~/.claude/scripts/smoke-test.js`（修改）
- **依賴**：T1 + T2 完成
- **內容**：L2 新增一項 `health-check runQuick`，驗證 health-check 可 import 且回傳健康報告
- **驗收**：`bun ~/.claude/scripts/smoke-test.js` L2 全部通過

### T4：CLI 端到端驗證
- **執行者**：executor
- **依賴**：T1 完成
- **內容**：
  1. `bun ~/.claude/scripts/health-check.js` → 全量報告 JSON 合法
  2. `bun ~/.claude/scripts/health-check.js closedLoop` → 單項報告
  3. `bun ~/.claude/scripts/health-check.js --quick` → 快速模式只含 2 個 check
  4. 行數檢查 ≤800
- **驗收**：4 項全部 exit code 0 + 輸出格式正確

---

## 依賴圖

```
T1（health-check.js 主體）
  ↓
T2（測試）──→ T3（smoke-test 整合）
  ↓
T4（CLI 端到端驗證）
```

T1 → T2 序列（測試依賴程式碼存在）
T3、T4 可在 T2 完成後並行

---

## 完成定義

- [ ] `bun test` 通過所有新增測試
- [ ] `bun ~/.claude/scripts/health-check.js` 輸出合法 HealthReport JSON
- [ ] `bun ~/.claude/scripts/health-check.js --quick` 執行時間 <500ms
- [ ] `bun ~/.claude/scripts/smoke-test.js` L2 通過（含新增的 health-check 項）
- [ ] health-check.js 行數 ≤800
- [ ] 真實 `~/.claude/` 執行結果：0 個 critical finding
