# health-check 57 Warning 分類清理 -- 技術設計

## 深度路由：D2
**理由**：跨 2 個 repo（nova + nova-brain），修改 1 個核心腳本 + 18 個 SKILL.md + 1 個測試檔，需 planner 拆分但無安全敏感性。

---

## 技術摘要

- **方案**：擴展 health-check.js 的 scan 層 + check 層偵測範圍，覆蓋全部引用管道
- **理由**：治本（修偵測邏輯）而非治標（加 whitelist）；與現有架構一致
- **取捨**：scan 層多讀幾個目錄（commands、rules），增加 ~50ms 執行時間

## 方案比較

| 維度 | 方案 A：擴展偵測範圍（選擇） | 方案 B：Whitelist 排除 |
|------|:------------------------:|:-------------------:|
| 準確性 | 高 -- 覆蓋所有真實引用管道 | 低 -- 需手動維護，易過時 |
| 維護成本 | 低 -- 新增管道自動涵蓋 | 高 -- 每次新增 skill/script 都要更新 |
| 實作量 | ~100 行新增 | ~20 行新增 |
| 風險 | 可能漏報（false negative） | 必然有維護債 |
| **結論** | 選擇 | 違反「治本不治標」原則 |

## 模組介面

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/scripts/health-check.js` | 新增 scanCommands + scanRules + scanScriptContents；修改 checkClosedLoop + checkSkillCoverage |
| 2 | `~/projects/nova-brain/tests/unit/health-check.test.js` | 新增 4 個管道偵測的陽性/陰性測試 |
| 3-20 | 18 個 `~/.claude/skills/*/SKILL.md` | 補上 reference 索引行 |

### API 設計

#### 新增 scan 函式

```javascript
// 掃描 commands/*.md，提取 content 供 skill 引用判斷
function scanCommands() {
  // ~/.claude/commands/*.md → [{ name, path, content }]
}

// 掃描 rules/*.md + CLAUDE.md，提取 EXTRA_SKILLS 及一般引用
function scanRules() {
  // ~/.claude/rules/*.md + ~/.claude/CLAUDE.md → [{ name, path, content }]
}

// 掃描 scripts/*.js 的 content，供互相引用判斷
function scanScriptContents() {
  // ~/.claude/scripts/*.js → [{ name, path, content }]
}
```

#### 修改 checkClosedLoop -- orphan-skill 偵測

```javascript
// 現有：只查 agents skills[]
// 新增 3 個引用管道：
// 1. commands/*.md content 中出現 skill name → referencedSkills.add
// 2. rules/*.md content 中 EXTRA_SKILLS 語法提取 → referencedSkills.add
// 3. skill frontmatter user-invocable: false → 視為 domain knowledge，不報 orphan
```

#### 修改 checkSkillCoverage -- orphan-script 偵測

```javascript
// 現有：只查 skill content
// 新增 6 個引用管道，全部用 basename 匹配：
// 1. settings.json hook commands（scanHooks 結果）
// 2. hooks/modules/*.js content
// 3. scripts/*.js content（互相 import）
// 4. agents/*.md content
// 5. commands/*.md content
// 6. CLAUDE.md + rules/*.md content
```

## 資料模型

不新增儲存。所有 scan 結果為 in-memory，透過 cache 物件共享。

## 執行步驟

### Phase 1：health-check.js 偵測擴展（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1.1 | `~/.claude/scripts/health-check.js` | 新增 scanCommands、scanRules、scanScriptContents 三個 scan 函式 |
| 1.2 | `~/.claude/scripts/health-check.js` | 修改 checkClosedLoop：在現有 referencedSkills 集合建構邏輯後，加入 commands 管道 + EXTRA_SKILLS 管道 + domain-knowledge-skill 排除 |
| 1.3 | `~/.claude/scripts/health-check.js` | 修改 checkSkillCoverage：在現有 skillContents 判斷後，加入 6 個額外引用管道 |

### Phase 2：18 個 SKILL.md reference 索引修補（parallel）

所有 18 個 SKILL.md 修改互相獨立，可並行。每個修改：在 SKILL.md 的「資源索引」區塊補上缺失的 `./references/{file}` backtick 索引。

受影響 SKILL.md 列表：

| # | Skill | 缺失 reference |
|---|-------|---------------|
| 1 | database | auto-discovered.md |
| 2 | wording | auto-discovered.md |
| 3 | craft | auto-discovered.md |
| 4 | pinchtab | api.md, profiles.md, env.md |
| 5 | commit-convention | auto-discovered.md |
| 6 | security-kb | auto-discovered.md |
| 7 | auto | boundary-cases.md, implicit-dependencies.md, delegation-quality.md |
| 8 | dead-code | auto-discovered.md |
| 9 | claude-dev | auto-discovered.md |
| 10 | code-review | auto-discovered.md |
| 11 | debugging | auto-discovered.md |
| 12 | os-control | auto-discovered.md |
| 13 | nova-autonomous-control | auto-discovered.md |
| 14 | architecture | auto-discovered.md |

（pinchtab 有 3 個、auto 有 3 個，其餘各 1 個，共 18 個修補）

### Phase 3：測試更新（sequential，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3.1 | `~/projects/nova-brain/tests/unit/health-check.test.js` | 新增 orphan-skill 陽性測試：mock skill 在 commands 中被引用 → 不報 orphan |
| 3.2 | 同上 | 新增 orphan-skill 陽性測試：mock domain-knowledge skill（user-invocable: false）→ 不報 orphan |
| 3.3 | 同上 | 新增 orphan-skill 陽性測試：mock EXTRA_SKILLS 引用 → 不報 orphan |
| 3.4 | 同上 | 新增 orphan-script 陽性測試：mock script 在 settings.json hook 中被引用 → 不報 orphan |
| 3.5 | 同上 | 新增 orphan-script 陽性測試：mock script 在另一個 script 中被 import → 不報 orphan |
| 3.6 | 同上 | 陰性測試：真正無引用的 skill/script 仍被偵測為 orphan |
| 3.7 | 同上 | 真實系統整合：修改現有「0 critical」測試，新增「0 warning」斷言 |

### Phase 4：驗證（sequential，依賴 Phase 1-3）

| 步驟 | 說明 |
|------|------|
| 4.1 | `bun ~/.claude/scripts/health-check.js` 驗證 0 critical + 0 warning |
| 4.2 | `bun test` 全量通過 |

## Pre-mortem

**假設修改上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | domain-knowledge-skill 排除太寬鬆，未來新增的 orphan skill 被誤排除 | 中 | 中 | 只排除 `user-invocable: false` 的 skill，且該 skill 必須有消費者定義（frontmatter 中的 consumers 欄位或 SKILL.md 內容有 Agent 表格） |
| 2 | SKILL.md reference 索引格式不一致（有些用表格、有些用列表），extractReferencePaths regex 漏抓 | 低 | 高 | 現有 regex 已覆蓋 backtick 語法 ``\`./references/xxx\` ``，所有新增索引統一用此格式 |
| 3 | scanScriptContents 讀取所有 scripts/*.js 的 content 造成效能下降 | 低 | 低 | scripts 目錄約 25 個 .js 檔案，平均每個 10-50KB，總讀取量 < 1MB，耗時 < 10ms |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| `tests/unit/health-check.test.js` | 新增 6 個陽性/陰性測試全部通過 |
| `tests/unit/health-check.test.js` 真實系統整合 | 0 critical + 0 warning |
| CLI 整合測試 | stdout JSON 格式不變 |

## 不做什麼

1. **不建 whitelist/allowlist**：違反「治本不治標」原則，維護成本高
2. **不新增 check function**：只修改現有 checkClosedLoop + checkSkillCoverage，保持架構簡潔
