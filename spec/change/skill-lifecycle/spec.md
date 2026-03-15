# Skill Lifecycle（R2.2 — L2 自我進化）

## 動機（Why）

- **問題**：Learner 偵測到高信心行為模式（confidence >= 0.60）後，只輸出建議（suggestion），無人消費這些建議——行為觀察永遠停留在 behaviors.jsonl，無法轉化為系統能力
- **目標**：建立從行為觀察到 Skill 部署的完整生命週期——Learner 觀察 → skill-forge 建立 Skill → Judge 品質閘門 → 達標部署到 agent skills[]
- **不做的代價**：L2「自我進化」永遠無法達成，系統只能被動學習無法主動進化，違反 vision.md 核心信念「核心夠通用 → 外層自動生成」

## 範圍

### In-scope

- skill-forge.js：從 behaviors.jsonl 高信心條目建立 SKILL.md + references/
- 品質閘門流程：Judge 評分 → 不過 → 自動修正 → 再評（最多 3 輪）
- 自動部署：通過品質閘門 → 加入最相關 agent 的 skills[]
- lifecycle-orchestrator.js：串聯 Forge → Judge → Deploy 完整流程
- SessionEnd 觸發：Maintainer 在 Phase 3 呼叫 lifecycle 檢查

### Out-of-scope

- Learner 本身的行為偵測邏輯（已完成）
- Judge 本身的評分邏輯（已完成）
- 手動建立 Skill（/spec:propose 已有）
- Skill 版本管理（v1 不需要）
- 跨 session Skill 協作（L4 範疇）

## 使用者故事

身為 Nova 系統核心，我想要在偵測到穩定的重複行為後自動建立 Skill 並部署，以便系統能力隨使用自然增長。

身為開發者，我想要 Skill 建立前經過品質閘門驗證，以便不會部署低品質的 Skill 污染知識庫。

## 行為規格

### 正常路徑

1. Maintainer SessionEnd Phase 3 呼叫 `checkLifecycle()`
2. 讀取 behaviors.jsonl → 找 confidence >= 0.60 且 suggestion.type === 'skill' 且未部署（`deployed !== true`）的條目
3. 對每個候選行為呼叫 `forgeSkill(behavior)` → 建立 `~/.claude/skills/{name}/SKILL.md` + `references/`
4. 呼叫 `judge.scoreDeterministic(skillPath, 'skill')` → 確定性評分
5. 若本地模型可用，呼叫語意評分 → 總分
6. 總分 >= 80（B 級）→ 通過品質閘門 → `deploySkill(name, targetAgent)`
7. 總分 < 80 → 呼叫本地模型修正 → 重新評分（最多 3 輪）
8. 3 輪後仍不過 → 標記 `status: 'draft'`，寫入 improvements.jsonl，等待人工審查
9. 部署成功 → 更新 behavior.deployed = true，寫回 behaviors.jsonl

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| behaviors.jsonl 不存在或為空 | 靜默返回，不報錯 |
| 本地模型不可用 | 只做確定性評分（50/100），B 級門檻改為 40/50 |
| Skill 同名已存在 | 跳過建立，log 警告 |
| deploySkill 寫入 agent 檔案失敗 | log error，標記 status: 'forged'，不標記 deployed |
| Judge 評分函式拋出例外 | catch → 視為不通過，進入修正流程 |

### 邊界條件

- 零候選行為 → 靜默返回
- 同時有 5+ 候選行為 → 按 confidence 排序，每次只處理前 3 個（避免本地模型負載過高）
- behavior.suggestion.type !== 'skill'（是 'rule' 或 'automation'）→ 跳過，留給未來的 rule-forge / script-forge

## 資料模型

### 輸入

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| behavior | object | 是 | behaviors.jsonl 中 confidence >= 0.60 的條目 |
| behavior.id | string | 是 | 行為 ID |
| behavior.pattern | string | 是 | 工具序列模式（如 "Read→Edit→Bash"） |
| behavior.suggestion | object | 是 | Learner 生成的建議 |
| behavior.suggestion.type | string | 是 | 'skill' / 'rule' / 'automation' |
| behavior.suggestion.content | string | 是 | 建議內容描述 |

### 輸出

| 欄位 | 型別 | 說明 |
|------|------|------|
| forged | boolean | 是否成功建立 Skill |
| deployed | boolean | 是否通過品質閘門並部署 |
| score | number | Judge 最終評分 |
| grade | string | A/B/C/D/F |
| rounds | number | 品質閘門迭代次數 |

### 儲存

- behaviors.jsonl 新增欄位：`deployed: boolean`、`forgedAt: string`、`deployedAt: string`
- ~/.claude/skills/{name}/SKILL.md + references/ — 新建的 Skill
- ~/.claude/data/lifecycle.jsonl — 生命週期事件記錄

## 介面契約

### skill-forge.js

```javascript
// 從行為觀察建立 Skill
export async function forgeSkill(behavior) → { ok: boolean, skillName: string, path: string }

// 修正 Skill（品質閘門不過時）
export async function improveSkill(skillName, improvements) → { ok: boolean }

// 部署 Skill 到 agent
export function deploySkill(skillName, agentName) → { ok: boolean }

// 檢查生命週期（Maintainer 呼叫入口）
export async function checkLifecycle() → { processed: number, forged: number, deployed: number }
```

### lifecycle-orchestrator.js

```javascript
// 完整流程：Forge → Judge → Deploy
export async function runLifecycle(behaviors) → { results: LifecycleResult[] }
```

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | 單個 Skill 建立 + 評分 < 5 分鐘（含本地模型推理） |
| 可靠性 | 本地模型不可用時 graceful degradation（只做確定性部分） |
| 安全 | 新建 Skill 不可覆蓋已存在的 Skill |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | learner.js / behaviors.jsonl | 行為觀察來源 |
| 上游 | judge.js / scoreDeterministic | 品質評分 |
| 上游 | 本地模型（port 8000） | 語意評分 + Skill 內容生成 + 修正 |
| 下游 | ~/.claude/skills/ | Skill 建立目標 |
| 下游 | ~/.claude/agents/*.md | 部署目標（修改 skills[] ）|
| 下游 | maintainer.js | 觸發者（SessionEnd Phase 3） |

## 驗收標準

- [ ] behaviors.jsonl 中 confidence >= 0.60 且 type === 'skill' 的條目被正確識別
- [ ] forgeSkill 建立的 SKILL.md 包含 frontmatter（name/description/type）+ 內容
- [ ] 品質閘門：B 級（>= 80）通過，C 級以下觸發修正流程
- [ ] 修正流程最多 3 輪，3 輪不過標記 draft
- [ ] deploySkill 正確修改 agent .md 的 skills: 區塊
- [ ] 本地模型不可用時不 crash，只做確定性部分
- [ ] lifecycle.jsonl 記錄每次 forge/judge/deploy 事件
- [ ] `bun test` 所有 skill-lifecycle 測試通過

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| 本地模型生成低品質 SKILL.md | 中 | 中 | Judge 品質閘門 + 3 輪修正 + draft fallback |
| 修改 agent skills[] 格式錯誤 | 低 | 高 | 解析現有格式後追加，不做全文替換 |
| behaviors.jsonl 中出現大量候選 | 低 | 低 | 每次只處理前 3 個，按 confidence 排序 |
| Skill 名稱衝突 | 低 | 中 | 檢查 existsSync 後跳過 |
