# Skill Lifecycle — 技術設計

## 深度路由：D3
**理由**：跨 4 個模組（learner → forge → judge → agent），涉及本地模型推理 + 檔案生成 + 品質閘門迭代，需規劃-執行-審查三階段。

---

## 技術摘要

- **方案**：SessionEnd 背景 agent 延伸（Maintainer Phase 3 呼叫），複用現有 learner/judge 基礎設施
- **理由**：零新 daemon、零新 port，利用已有的 SessionEnd 自我分離 + 本地模型 pattern
- **取捨**：每次 SessionEnd 只處理 3 個候選（避免 5 分鐘 × N 過長），累積的候選在後續 session 處理

## 方案比較

| 維度 | A：Maintainer 延伸（選擇） | B：獨立 daemon | C：手動觸發 CLI |
|------|:------------------------:|:-------------:|:-------------:|
| 複雜度 | 低（複用現有 pattern） | 高（新 daemon + 新 port） | 中 |
| 自動化 | 全自動（SessionEnd 觸發） | 全自動 | 手動（違反 L2 自動化目標）|
| 整合難度 | 低（import 現有模組） | 高（IPC 通訊） | 低 |
| 可測試性 | 高（函式 export + DI） | 中 | 高 |
| **結論** | 選擇：最簡單、自動、可測 | 過度工程 | 不符合自我進化目標 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | skill-forge.js | `~/.claude/scripts/` | ~200 | Skill 建立引擎（forgeSkill + improveSkill + deploySkill） |
| 2 | lifecycle-orchestrator.js | `~/.claude/scripts/` | ~120 | 串聯 Forge → Judge → Deploy + checkLifecycle 入口 |

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | maintainer.js | Phase 3 新增 `await checkLifecycle()` 呼叫 |
| 2 | learner.js | behaviors entry 新增 `deployed`/`forgedAt`/`deployedAt` 欄位 |

### API 設計

```javascript
// skill-forge.js
export async function forgeSkill(behavior) {
  // 1. 從 behavior.pattern + behavior.suggestion 生成 Skill 名稱
  // 2. 檢查 ~/.claude/skills/{name} 是否已存在
  // 3. 呼叫本地模型生成 SKILL.md 內容
  // 4. 建立目錄結構：SKILL.md + references/
  // 回傳：{ ok, skillName, path }
}

export async function improveSkill(skillName, improvements) {
  // 1. 讀取現有 SKILL.md
  // 2. 呼叫本地模型根據 improvements 修正
  // 3. 覆寫 SKILL.md
  // 回傳：{ ok }
}

export function deploySkill(skillName, agentName) {
  // 1. 讀取 ~/.claude/agents/{agentName}.md
  // 2. 解析 frontmatter 的 skills: 區塊
  // 3. 追加 skillName（如果不存在）
  // 4. 寫回 agent 檔案
  // 回傳：{ ok }
}

// lifecycle-orchestrator.js
export async function checkLifecycle() {
  // 1. 讀取 behaviors.jsonl
  // 2. 過濾候選（confidence >= 0.60, type === 'skill', deployed !== true）
  // 3. 排序取前 3
  // 4. 對每個：forge → judge → [improve loop] → deploy
  // 回傳：{ processed, forged, deployed }
}
```

## 資料模型

- 儲存格式：JSONL（lifecycle.jsonl）
- 儲存位置：`~/.claude/data/lifecycle.jsonl`
- 清理策略：保留最近 100 條

lifecycle.jsonl 條目格式：
```json
{
  "date": "2026-03-16",
  "behaviorId": "read-edit-bash",
  "action": "forge|judge|improve|deploy|draft",
  "score": 85,
  "grade": "B",
  "round": 1,
  "skillName": "read-edit-bash-pattern"
}
```

## 執行步驟

### Phase 1：Skill Forge 引擎（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1 | skill-forge.js | 實作 forgeSkill + improveSkill + deploySkill |

### Phase 2：Lifecycle Orchestrator（sequential，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2 | lifecycle-orchestrator.js | 實作 checkLifecycle + forge-judge-deploy 迴圈 |

### Phase 3：整合 + 測試（sequential，依賴 Phase 2）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3a | maintainer.js | Phase 3 加入 checkLifecycle() 呼叫 |
| 3b | skill-lifecycle.test.js | forge / judge / deploy / lifecycle 完整測試 |

## Pre-mortem

**假設 Skill Lifecycle 上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | 本地模型生成的 SKILL.md 結構不正確（缺 frontmatter、格式錯誤） | 中 | 中 | forgeSkill 後用 regex 驗證基本結構，不通過就重試 |
| 2 | deploySkill 修改 agent .md 時破壞 frontmatter 格式 | 低 | 高 | 只做 skills: 區塊的追加，用 yaml parser 而非 regex |
| 3 | 品質閘門永遠不過（3 輪修正後仍 < 80） | 中 | 低 | 標記 draft 不阻塞，人工審查即可 |
| 4 | Maintainer timeout（checkLifecycle 耗時過長） | 低 | 中 | 每次最多 3 個候選 × 5 分鐘 = 15 分鐘上限 |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| skill-lifecycle.test.js | forgeSkill 建立正確結構的 SKILL.md |
| skill-lifecycle.test.js | improveSkill 根據建議修改內容 |
| skill-lifecycle.test.js | deploySkill 正確追加 agent skills[] |
| skill-lifecycle.test.js | checkLifecycle 端到端：候選 → forge → judge → deploy |
| skill-lifecycle.test.js | 品質閘門：不過 → 修正 → 再評 → 3 輪 draft |
| skill-lifecycle.test.js | 本地模型不可用時 graceful degradation |

## 不做什麼

1. **不做 Skill 版本管理**：v1 直接建立不追蹤版本歷史
2. **不做 rule-forge / script-forge**：本次只處理 suggestion.type === 'skill'
3. **不做即時觸發**：只在 SessionEnd 時檢查，不做 webhook / watch
