# A7 — Memory 系統

## 執行策略

| 文件 | 執行策略 |
|------|---------|
| Auto Memory（MEMORY.md） | 200 行上限 → 已瘦身，維持精簡 |
| Agent Memory（3 種範圍） | v0.30 agent 已 .bak → 重設計時重新規劃 |
| CLAUDE.md 手動記憶 | 全域 76 行 + 專案 57 行 → 維持 |
| Hook 強制規則 | 限制可記內容 → 繼續執行 |

## 執行步驟

**Step 1：研究記憶機制** ✅
- [x] 盤點三種記憶機制（Auto Memory / Agent Memory / CLAUDE.md）
- [x] 確認 Agent Memory 三種範圍（user/project/local）
- [x] 記錄 200 行上限和 Compaction 重讀行為

**Step 2：規劃 v0.30 記憶策略** ⬜
- [ ] 決定 v0.30 Agent 使用哪種 Memory 範圍
- [ ] 評估 Auto Memory 寫入品質（避免記不重要的事）
- [ ] 確認 MEMORY.md 與 SKILL.md 的知識分界

> 狀態：✅ 已確認

---

## 三種記憶機制

| 機制 | 觸發 | 儲存位置 | 範圍 |
|------|------|---------|------|
| Auto Memory | Claude 自動學習 | `~/.claude/projects/<hash>/memory/` | per-project |
| Agent Memory | Subagent 持久記憶 | 三種範圍（見下方） | per-agent |
| CLAUDE.md | 手動維護 | 各層級 CLAUDE.md | 全域/專案 |

---

## Auto Memory

Claude 在對話中自動記錄學習到的知識。

| 設定 | 說明 |
|------|------|
| `autoMemoryEnabled` | 開關（預設開啟） |
| `autoMemoryDirectory` | 自訂儲存路徑 |
| `/memory` | 瀏覽和編輯記憶 |

### 儲存結構

```
~/.claude/projects/<project-hash>/memory/
├── MEMORY.md          # 索引，每次 session 載入前 200 行
├── debugging.md       # 主題檔案（超過 200 行時拆分）
└── architecture.md
```

- 同一 git repo 的所有 worktree/子目錄**共享**同一 memory 目錄
- Compaction 後 memory 從磁碟重讀
- 超過 200 行的內容應移到主題檔案

---

## Agent Memory（Subagent 持久記憶）

在 agent frontmatter 中設定 `memory` 欄位，自動啟用 MEMORY.md + Read/Write/Edit 工具。

### 三種範圍

| 範圍 | 位置 | 用途 |
|------|------|------|
| `user` | `~/.claude/agent-memory/<agent-name>/` | 跨專案個人偏好 |
| `project` | `.claude/agent-memory/<agent-name>/` | 專案特定，可 commit |
| `local` | `.claude/agent-memory-local/<agent-name>/` | 本地，gitignored |

```yaml
# Agent frontmatter
---
name: reviewer
memory: user
---
```

---

## 環境變數

| 變數 | 說明 |
|------|------|
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | 關閉 auto memory |
| `CLAUDE_SESSION_ID` | 當前 session ID |

---

## 我們目前的使用

| 機制 | 使用狀態 |
|------|---------|
| Auto Memory | ✅ 使用中 — `MEMORY.md` 約 200 行 |
| Agent Memory (user) | ✅ 有目錄但 v0.30 agent 已 .bak |
| Agent Memory (project/local) | ✅ 存在 |
| CLAUDE.md | ✅ 全域 76 行 + 專案 57 行 |

### 注意事項

- MEMORY.md 有 200 行上限（超過被截斷）
- Hook 強制規則限制可記內容（見 MEMORY.md 開頭）
- Auto memory 的寫入由 Claude 自動判斷，有時會記不重要的事
