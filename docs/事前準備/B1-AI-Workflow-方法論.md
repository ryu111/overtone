# B1 — AI Workflow 方法論比較

> 狀態：✅ 已確認

## 九大方法論總覽

| 方法論 | Stars | 核心思想 | 結構化 | 學習曲線 | 工具鎖定 |
|--------|-------|---------|--------|---------|---------|
| **Superpowers** | 79.5k | Skill 自我累積 + TDD | 高 | 中高 | 中 |
| **BMAD** | 40.3k | 12+ Agent 角色分工 | 極高 | 高 | 低 |
| **OpenSpec** | 29.9k | 輕量 spec 框架 | 中 | 低 | 低 |
| **GitHub Spec Kit** | 官方 | 規格即真相來源 | 高 | 中 | 低 |
| **Kiro (AWS)** | IDE | IDE 內建 SDD | 高 | 中 | 高 |
| **cc-sdd** | 社群 | Kiro 命令跨工具移植 | 高 | 中 | 低 |
| **PRD-Driven** | 實踐 | PRD → Task List → 逐步 | 中 | 低 | 無 |
| **Plan-Then-Code** | 實踐 | 先規劃後實作 | 中 | 低 | 無 |
| **Vibe Coding** | 基準 | 直覺對話式 | 無 | 極低 | 無 |

---

## 方法論詳細

### 1. Superpowers（79.5k stars）

**來源**：[github.com/obra/superpowers](https://github.com/obra/superpowers)

**核心創新**：Skill 系統（markdown 記錄程序/模式/知識）+ 自我改進（學到就記錄為 skill）+ 心理壓力測試。

**工作流**：Brainstorm → Plan（git worktree）→ Implement（RED/GREEN TDD）→ Review（嚴重度分級）

**與 Overtone 對照**：
- Superpowers Skill ≈ Overtone Skill（但 Overtone 有 instinct 進化機制）
- Superpowers worktree ≈ Overtone D4
- Superpowers TDD ≈ Overtone BDD 驅動

### 2. BMAD Method（40.3k stars）

**來源**：[github.com/bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)

**核心**：12+ 專門 Agent（PM、架構師、開發者、UX、Scrum Master 等）、34+ workflow、自適應複雜度。

**工作流**：Build → Manage → Ask → Do（迴圈）

**與 Overtone 對照**：
- BMAD 12+ Agent ≈ Overtone 精簡為 3 Worker（規劃者/執行者/審查者）
- BMAD 34+ workflow ≈ Overtone 深度路由 D0-D4（更簡潔）
- BMAD v6 Skills ≈ Overtone Skills

### 3. OpenSpec（29.9k stars）

**來源**：[github.com/Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)

**核心**：輕量 spec 框架。分離「當前真相」(specs/) 和「提議變更」(changes/)。

**工作流**：Propose（proposal.md + specs/ + tasks.md）→ Apply → Archive

### 4. GitHub Spec Kit（官方）

**來源**：[github.com/github/spec-kit](https://github.com/github/spec-kit)

**核心**：規格是「活的、可執行的 artifact」。含 constitution.md（不可違反原則）。

**工作流**：Specify → Plan → Tasks → Implement

### 5. Kiro（AWS IDE）

**來源**：[kiro.dev](https://kiro.dev/)

**核心**：IDE 內建 SDD。Agent Hooks（自動觸發）、Steering Files（持久知識）、Property-based Testing、Checkpointing。

**工作流**：Requirements（EARS 格式）→ Design → Tasks → 逐步實作

### 6. cc-sdd（社群）

**來源**：[github.com/gotalab/cc-sdd](https://github.com/gotalab/cc-sdd)

**核心**：Kiro 命令移植到 8 種 AI 工具。EARS 需求格式 + 依賴追蹤 + 並行支援。

### 7. PRD-Driven（Align, Plan, Ship）

**來源**：[kovyrin.net](https://kovyrin.net/2025/06/20/prd-tasklist-process/)

**核心**：PRD 解決 context window 限制。每次執行用乾淨 agent + 單一步驟。

### 8. Plan-Then-Code

**來源**：多篇實踐文章

**核心**：不讓 AI 在批准計畫前寫碼。結合 Vertical Slice（DB→API→UI 垂直切片）。

### 9. Vibe Coding（基準對照）

**來源**：Andrej Karpathy 2025

**核心**：直覺式對話開發。所有結構化方法論的反面教材。

---

## 共通模式 ✅ 已確認

所有方法論收斂到 5 個核心模式：

1. **先文件後程式碼** — spec/PRD/plan 作為 AI 錨點
2. **任務原子化** — 大任務拆小步，每步可獨立驗證
3. **人在迴圈** — 規劃人審核，實作 AI 執行
4. **Context 管理** — 用持久文件解決 context window 限制
5. **規格是活文件** — 持續更新不是寫完就丟

---

## Overtone v0.30 的定位 🔍 待確認

Overtone 已經具備大部分方法論的核心要素：

| 能力 | Overtone 已有 | 來源方法論 |
|------|-------------|-----------|
| 深度自適應 D0-D4 | ✅ | BMAD 自適應 |
| Skill 知識累積 | ✅ | Superpowers |
| instinct 進化 | ✅（獨創） | — |
| BDD 驅動 | ✅ | Kiro property-based |
| 三角色 Worker | ✅ | BMAD 精簡版 |
| 預設單腦 | ✅ | Plan-Then-Code |
| 佇列 DAG 依賴 | ✅ | cc-sdd 依賴追蹤 |

**缺少的**：
- [ ] `rules/` 條件載入（所有方法論都強調 context 管理）
- [ ] CLAUDE.md 審計機制（防止膨脹/矛盾）
- [ ] 標準化 spec 格式（OpenSpec/Kiro 的 EARS）

---

## 可借鑑的具體做法 🔍 待確認

| 做法 | 來源 | 適用 Overtone？ |
|------|------|----------------|
| constitution.md（不可違反原則） | GitHub Spec Kit | 🔍 我們已有 CLAUDE.md 核心原則 |
| EARS 需求格式 | Kiro/cc-sdd | 🔍 可能過重，BDD 已夠 |
| Steering Files | Kiro | ✅ 等同 rules/ + skills/ |
| 心理壓力測試 | Superpowers | 🔍 有趣但優先度低 |
| Checkpoint 回滾 | Kiro | 🔍 git 已提供 |
| Property-based Testing | Kiro | 🔍 可考慮加入 tester agent |
