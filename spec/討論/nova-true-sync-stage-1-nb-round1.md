# Stage 1.0 真同步研究 — nb Round 1

**dispatch**: xd-1776509646576-rweu (2026-04-18)
**source**: nova-manager
**verdict 提案**: iterate → 推薦方案 E (test 守護) + 挑戰 Manager 系統性解讀
**核心挑戰**: drift 不是 systemic 問題，是「test 未覆蓋新增元件 hub cascade」問題

## 1. 使用者 acceptance criteria 翻譯

1. 「單一事實，UI 跟鏈是一樣的」
2. 「不想要 UI 跟實際對不上」

**兩條真正要的**：
- (a) UI 顯示的 edges = Claude 實際載入結構（Stage 0.9 後已 100%）
- (b) 新增元件不需手動雙邊 sync（drift 自動偵測）

## 2. 現況分析：drift 風險實測

Stage 0.9 後狀態：
- Obsidian edges = md-link parser (內建) — deterministic
- chain-integrity edges = REF_PATTERNS md-link only — deterministic  
- 兩者 parse 的是**同一份 md-link 字串** — 實際上已單一事實

drift 風險**只剩一種**：
- 新增 `rules/品質/新規.md` 但沒加到 `rules/品質/README.md` 的 md-link 清單
- 新增 `skills/新技能/SKILL.md` 但沒加到 `skills/README.md`
- 新增 `agents/新角色.md` 但沒加到 `agents/README.md`

**這不是 systemic 問題（需換架構），而是 hub cascade 完整性問題**，test 可抓。

## 3. Manager 3 方案評估 + 第 4-5 方案

### A) obra/knowledge-graph (Claude Code plugin)

| 維度 | 評估 |
|------|------|
| Nova fit | 中 |
| 工時 | 5-8h (install + 測試) |
| SSoT | ❌ 引入 SQLite 跟 chain-integrity 職責重疊 |
| 風險 | 雙 graph layer，未來 drift 到 plugin vs chain-integrity 之間 |
| 結論 | **不採** — 違反 Nova SSoT 原則（rules/品質/完成與閉環.md 的「同一規則不存兩處」精神） |

### B) obsidianGraphRAG / InfraNodus (embedding)

| 維度 | 評估 |
|------|------|
| Nova fit | 低 |
| 工時 | 10-15h (embedding infra + tuning) |
| SSoT | ❌ edges 非 deterministic (semantic similarity)，review 無法對齊 |
| 風險 | Nova 核心原則「確定性 → 程式碼 \| 語意模糊 → AI」(CLAUDE.md §核心原則)，全域元件鏈不該 fuzzy |
| 結論 | **不採** — edges 必須 deterministic，fuzzy edges 違反 reviewer-enforcer 精神 |

### C) 自 build docs-as-cognitive-model

| 維度 | 評估 |
|------|------|
| Nova fit | 高 (哲學契合) |
| 工時 | **20-40h** (從零建 pipeline) |
| SSoT | ✅ 自 build 可設計成 SSoT |
| 風險 | 重造輪子，ROI 差；工時黑洞 |
| 結論 | **不採** — 工時不成比例，chain-integrity 已做 60% 功能 |

### D) chain-integrity 升級 SSoT + Obsidian custom plugin viewer (Manager 第 4 方案)

| 維度 | 評估 |
|------|------|
| Nova fit | 高 (繼承現有投資) |
| 工時 | 8-12h (Obsidian plugin TS + chain-integrity 輸出 Graph API) |
| SSoT | ✅ chain-integrity data/chain-integrity.json 唯一源 |
| 風險 | Obsidian plugin TypeScript 開發 + 用戶端接入，複雜度中等 |
| 結論 | **條件採** — 工時 8-12h 可接受，但存疑：Obsidian 原生 Graph 已 work，真有需要 override? |

### E) **nb 提：test-based SSoT 守護**（最輕 + 治本）

**核心洞察**：
- Obsidian 跟 chain-integrity 都 parse **同一 md-link 字串** — 本質上已單一事實
- drift **唯一來源** = 新增元件沒連到 hub README
- 解法：**architecture.test.js 守護 hub cascade 完整性**

**實作**：
1. `tests/unit/architecture.test.js` 加 4 個 test:
   - `每個 rules/**/*.md 都在對應 sub-dir README md-link 裡`（5 sub-dir × N rules）
   - `每個 skills/*/SKILL.md 都在 skills/README.md md-link 裡`（33 skills）
   - `每個 agents/*.md 和 agents/kfc/*.md 都在 agents/README.md md-link 裡`（13 agents）
   - `每個 obsidian/semantic/architecture-decisions/ADR-*.md 都在 CLAUDE.md md-link 裡`
2. test fail 即「drift detected」，一句話指出哪個檔沒 hub 引用
3. pre-commit hook optional 跑（避免無引用新檔合入）

**工時估算**: **1.5-2h**
- 1h 寫 4 個 test（glob dir + grep README md-link + assert subset）
- 0.5h run + 修現有 drift（若有）
- 0.5h doc update (寫作規範.md 加條「新增元件必連 hub」)

**SSoT 保證**:
- chain-integrity REF_PATTERNS md-link only (Round 7 已達) ✓
- Obsidian md-link edge parser (內建) ✓
- **兩者 parse 同一字串，無 drift 可能** — 只要 md-link 寫對，雙邊一致

**drift 自動偵測**:
- `bun test tests/unit/architecture.test.js` 跑 → drift 立即 fail
- CI/pre-commit integration optional（未來擴展）

**風險**:
- Test 需 maintain（新增 hub 需更新 test assertion）— 但 test 結構可 parametrize 讀 dir 自動生 assertion，不需逐個寫
- 使用者新增元件時忘跑 test — pre-commit hook 可補 (延後評估)

### 方案比較總表

| 方案 | 工時 | SSoT | Nova fit | 風險 | ROI |
|------|------|------|----------|------|-----|
| A obra KG plugin | 5-8h | ❌ (雙 layer) | 中 | 中 | 低 |
| B embedding graph | 10-15h | ❌ (fuzzy) | 低 | 高 | 極低 |
| C 自 build | 20-40h | ✅ | 高 | 高 | 極低 |
| D chain-integrity + plugin viewer | 8-12h | ✅ | 高 | 中 | 中 |
| **E test 守護** | **1.5-2h** | ✅ | **高** | **低** | **高** |

## 4. 推薦：方案 E + 觀察期

**Round 1 推薦**: 方案 E (test-based SSoT 守護)，工時 1.5-2h，治本不治標。

**推薦理由**:
1. **已單一事實**: md-link 是 Obsidian 和 chain-integrity **共同 parse 的字串**，雙方對同一字串 deterministic parse = 天然 SSoT
2. **drift 真正來源**只是新增元件沒連 hub — test 直接覆蓋
3. **最低 ROI**: 1.5-2h 解決 Stage 0.5-0.9 的「補完後維持」問題，比重構架構划算 10x
4. **不違反 Nova 原則**: test-first、治本、最小影響面（rules/核心/失敗與修復.md「優先自動化防護 > 規則 > 記憶」）
5. **未來可升級**: 若 E 不夠（drift 其他 pattern 浮現），再評估 D

**拒絕 A/B/C 理由**:
- A: SQLite 引入雙 graph layer，違反 SSoT
- B: semantic edges fuzzy 違反 CLAUDE.md 確定性原則
- C: 20-40h 工時黑洞，ROI 極低

**延後 D 理由**:
- 8-12h 工時貴且替代 Obsidian 原生 Graph
- 若 E 跑 1 個月後仍有 drift（非 hub cascade 類 drift），才評估 D
- **YAGNI 原則**: 現在 drift 只有一類，E 就夠

## 5. 方案 E 實作細則（Round 2 若採）

### Test 1: rules hub cascade 完整性

```javascript
describe("rules hub cascade SSoT", () => {
  const categories = ["協作", "核心", "品質", "元件", "環境"];
  for (const cat of categories) {
    it(`rules/${cat}/README.md 列出該類全部 *.md`, () => {
      const dir = join(CLAUDE_DIR, `rules/${cat}`);
      const mdFiles = readdirSync(dir).filter(f => f.endsWith(".md") && f !== "README.md");
      const readme = readFileSync(join(dir, "README.md"), "utf8");
      const missing = mdFiles.filter(f => !readme.includes(`](${f})`));
      expect(missing).toEqual([]);
    });
  }
});
```

### Test 2: skills hub cascade 完整性

```javascript
it("skills/README.md 列出全部 skills/*/SKILL.md", () => {
  const dir = join(CLAUDE_DIR, "skills");
  const skillDirs = readdirSync(dir).filter(d => 
    statSync(join(dir, d)).isDirectory() && 
    existsSync(join(dir, d, "SKILL.md")) &&
    d !== "_archived"
  );
  const readme = readFileSync(join(dir, "README.md"), "utf8");
  const missing = skillDirs.filter(d => !readme.includes(`](${d}/SKILL.md)`));
  expect(missing).toEqual([]);
});
```

### Test 3: agents hub cascade 完整性

```javascript
it("agents/README.md 列出全部 agents md-link", () => {
  const dir = join(CLAUDE_DIR, "agents");
  const agentFiles = readdirSync(dir)
    .filter(f => f.endsWith(".md") && f !== "README.md")
    .concat(
      existsSync(join(dir, "kfc")) 
        ? readdirSync(join(dir, "kfc")).filter(f => f.endsWith(".md")).map(f => `kfc/${f}`)
        : []
    );
  const readme = readFileSync(join(dir, "README.md"), "utf8");
  const missing = agentFiles.filter(f => !readme.includes(`](${f})`));
  expect(missing).toEqual([]);
});
```

### Test 4: ADR hub cascade 完整性

```javascript
it("CLAUDE.md §Pointer 列出全部 ADR-*.md", () => {
  const adrDir = join(CLAUDE_DIR, "obsidian/semantic/architecture-decisions");
  const adrFiles = readdirSync(adrDir).filter(f => f.startsWith("ADR-") && f.endsWith(".md"));
  const claudemd = readFileSync(join(CLAUDE_DIR, "CLAUDE.md"), "utf8");
  const missing = adrFiles.filter(f => !claudemd.includes(`](obsidian/semantic/architecture-decisions/${f})`));
  expect(missing).toEqual([]);
});
```

### 寫作規範補一條

```markdown
📋 MUST 新增 rule/skill/agent/ADR 時，同時加入對應 hub README/CLAUDE.md 的 md-link 清單，確保 Graph view cascade 覆蓋（✓ architecture.test.js hub cascade SSoT 守護）。
```

## 6. 等 Manager Round 2 共識點

| Q | nb 推薦 | Manager 可能異議 |
|---|---------|------------------|
| Q1 採方案 E vs 其他 | **E (test 守護)** | D 若認為 Obsidian 原生 Graph 不夠強需替換 |
| Q2 test 結構 parametrize vs 逐個寫 | **parametrize** (讀 dir 自動生) | 無 |
| Q3 pre-commit hook 現加 vs 延後 | **延後** (先跑手動 test) | 若 drift 頻繁加 hook |
| Q4 方案 E 跑多久後評估升級 D | **1 個月或累積 drift 5+ 次** | 無 |

## 7. Round 2 若 Manager 全採 E

直接執行：
1. 寫 4 個 test (1h)
2. Run 抓現 drift + 修 (0.5h)
3. 寫作規範加條 (0.2h)
4. commit + push (0.3h)

**總 2h**，比 Stage 0.5/0.7/0.8 任何一輪都短。

## 8. 砍刀

- ❌ 不引入 SQLite / vector DB（違反 SSoT）
- ❌ 不用 embedding edges（違反確定性）
- ❌ 不自 build 20h+ pipeline（ROI 差）
- ❌ 不替換 Obsidian 原生 Graph viewer（能用就不換）

## Backlinks

- Stage 0.5/0.7/0.8/0.9 commits: cf7ba03 / 52825b5 / a126601 / 1159d9e (9 rounds 循環)
- Round 7 md-link SoT: commit 803cc3f + 587cdf2
- Manager dispatch: xd-1776509646576-rweu
- Nova 核心原則: [CLAUDE.md](../../CLAUDE.md) §核心原則「確定性 → 程式碼」
- rules/核心/失敗與修復.md「優先自動化防護 > 規則 > 記憶」
