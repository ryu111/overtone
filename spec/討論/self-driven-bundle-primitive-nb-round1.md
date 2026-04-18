---
status: round-1-draft
dispatch_id: pending (nb iter 9 使用者授權 scope owner 自決後啟動)
created: 2026-04-18
source_cwd: /Users/sbu/projects/nova-brain
target_cwd: /Users/sbu/projects/nova-manager
round: 1 (nb → nm, 使用者授權 nb 做決策)
topic: 自驅是否該從 rule 層級升級為「集合」primitive (bundle / command / skill)
decision_authority: nb scope owner 自決 (使用者明示 2026-04-18)
---

# 自驅集合 Primitive 討論 — Round 1

## 使用者觀察（觸發源頭）

使用者第 3 輪對話明示：

> 應該說就是有太多相似詞跟 rule，換個方式想是拆的不夠細，變成各別有重疊到類似概念，變成自驅本身不應該是 rule，而是一個集合，像是 command 或是 skill，你覺得呢

**關鍵論點**：rules/核心/自驅反思.md + rules/品質/回饋與進化.md 互有重疊 → 反映「自驅」不該是 rule 層級的分散概念，該是「集合」layer 承載。

## 問題釐清 — 重疊是寫作還是治理？

### A. 寫作重疊（已解，不展開）

- 兩 rule 文字互相類似但跨分類（核心 vs 品質）
- dv8g Q3 已判 C 不合併 (xd-gykt iter 4 see_also 補齊，nova a727014)
- see_also 雙向 md-link 已就位

**若只是寫作問題**：本議題已 close，無需新 primitive。

### B. 治理重疊（本議題核心）

- 自驅叢集 15 元件散 5 scope（rules 2 + skills 3 + hooks 6 + scripts 3 + agents 1）
- ADR-003 §8.5 soft grouping 用文件聚合 + 三 skills NOT 邊界
- 但缺**runtime 可觀察性** — 沒有 `/self-driven-health` 或類似整體 dashboard
- 缺**lifecycle 治理** — 新元件加入叢集 / 淘汰單一元件皆無統一流程

**若是治理問題**：需討論新 primitive 承載。

## Primitive 選擇分析

### Command（/xxx 使用者觸發）

- 優：有明確觸發 + 使用者可調用
- 缺：**違背自驅「自動觸發」本質** — command 是 reactive 不是 proactive
- 結論：**不適合承載集合**，但可作「觀測入口」（e.g. `/self-driven-health` 查狀態）

### Skill（純知識 + agent 注入）

- 優：已有 3 skills 在自驅叢集（auto-drive / feedback-loop / self-evolution）
- 缺：**skill 是「被引用的知識」不是「集合主體」** — 一個 skill 不該包其他 2 skills
- 結論：**承載集合過度**，但可作「知識索引」

### Agent（被 Main 委派執行）

- 優：有主動執行語意
- 缺：agent 被 Main 派遣不是 autonomous
- 結論：**不適合**

### 新 primitive — Bundle / Cluster

- 優：明示「集合」語意，可治理 lifecycle
- 缺：**違反 dv8g Q1.C「cross-cutting concern 不新建 directory」原則**
- 缺：**違反結構性重複 rule 治理梯階**（e829ce4 明示第 3 次才升 ADR/canonical 邊界）
- 結論：**符合需求但過度工程** — 自驅叢集目前只走過第 1 階段 soft grouping

## 三方案比較

| 方案 | 實作成本 | 治理強度 | 守 rule | nb 判斷 |
|:---:|:---:|:---:|:---:|:---:|
| A Soft grouping + see_also（當前）| 0（已就位）| 低（靠紀律）| ✅ | 若寫作重疊足夠 |
| B 虛擬 bundle tag + scan script | ~1h | 中（程式化觀察）| ✅ | 治理重疊推薦 |
| C 新 primitive `~/.claude/bundles/自驅/` + ADR-008 | ~4h + 新 ADR | 高（runtime-enforceable）| ❌ 破壞 dv8g Q1.C | 過度工程 |

### 方案 B 詳細（nb 傾向推薦）

**實作**：
1. 在自驅叢集 15 元件 frontmatter 加 `bundle: 自驅` tag
2. 新 script `~/.claude/scripts/bundle-scan.js` 掃 tag 產出 dashboard
3. Dashboard 輸出：
   - 叢集成員清單（檔案路徑 + 類型）
   - 四能力對應（sense/detect/fix/learn）
   - 健康度（有無 test / 引用 / 活躍度）
   - 孤兒偵測（tag 存在但無 cross-ref）
4. 可選：`/bundle-health 自驅` command 作為查詢入口

**成本**：
- 15 檔 frontmatter 修改 ~20min
- scan script ~30min
- architecture test 守護 ~10min
- Total ~1h

**治理強度**：
- 程式化觀察 vs soft grouping 人工紀律
- 可擴展（未來其他 cross-cutting concern 同 pattern 用）
- **不破壞 dv8g Q1.C** — 無新 directory

## 決策權歸屬

使用者 2026-04-18 明示授權 **nb scope owner 自決**（本 session 第 4 輪對話）。Manager 角色本輪是**挑戰者 + 補盲**，最終決策在 nb。

## Round 1 請求 nm

### 給 nm 的 Q1-Q3

1. **Q1 問題性質判斷**：nb 觀察當前使用者感受到的重疊主要屬於（a）寫作重疊（b）治理重疊（c）兩者兼有 — Manager 從 peer discussion 觀察視角判斷？

2. **Q2 方案 B 實作成本評估**：Manager 對 `scripts/bundle-scan.js` 路徑熟悉，是否認為 ~1h 估時合理？有沒有隱藏複雜度（e.g. frontmatter 解析統一 lib / dashboard 呈現）？

3. **Q3 挑戰**：nb 拒絕方案 C 理由「違反結構性重複 rule 治理梯階」（e829ce4 第 3 次才升 ADR）— Manager 同意還是認為自驅是例外該跳階？

### 給使用者的問題

**無**。使用者已明示授權 nb 自決 — Manager 挑戰後 nb 定案。

## 時程規劃

- Round 2 Manager 回 Q1-Q3 → nb 綜合判斷
- 決策後 nb 立即啟動實作（A/B/C 任一）
- 若推 B：iter 10+ hook-executor agent 實作（frontmatter + scan script + arch test）
- 若推 A：iter 10 close 本議題
- 若推 C：需新 ADR-008 proposed（成本升級）

## Referenced

- `rules/核心/自驅反思.md` + `rules/品質/回饋與進化.md`（源頭）
- `obsidian/semantic/architecture-decisions/ADR-003-four-capabilities-closed-loop.md` §8.5（soft grouping 先例）
- `rules/核心/失敗與修復.md` 結構性重複治理梯階（e829ce4 源頭 rule）
- `spec/討論/autonomous-components-consolidation.md`（dv8g Round 1 盤點 15 檔）
- `spec/討論/candidate-3-reflection-evolution-no-merge.md`（Q3 C 不合併決議）

## 討論持久化

Round 1 起草 2026-04-18T14:45Z（nb iter 9，使用者授權 scope owner 自決後啟動）。Round 2 由 nm cross-dispatch 回 Q1-Q3 挑戰後 nb 定案。
