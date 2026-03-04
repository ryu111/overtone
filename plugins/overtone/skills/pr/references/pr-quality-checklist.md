# PR 品質檢查清單

> 📋 **何時讀取**：建立或審查 PR 時，確認 PR 品質符合標準。

## 品質檢查項目

### 必要檢查（阻擋合併）

| # | 項目 | 檢查方式 | 不合格標準 |
|:-:|------|---------|-----------|
| 1 | Title 格式 | 正則匹配 | 不符合 `type: description` 格式 |
| 2 | Body 非空 | 字串長度 | body 為空或僅含模板未填內容 |
| 3 | 有 commits | `git log base..HEAD` | 無新 commit |
| 4 | Tests 通過 | workflow.json stages | TEST stage 為 FAIL |
| 5 | 無衝突 | `gh pr view --json mergeable` | 有合併衝突 |

### 建議檢查（警告但不阻擋）

| # | 項目 | 檢查方式 | 警告標準 |
|:-:|------|---------|---------|
| 6 | Diff 大小 | `git diff --stat` | 超過 500 行變更 |
| 7 | 檔案數量 | `git diff --stat` | 超過 20 個檔案 |
| 8 | 單一職責 | commit 主題分析 | commits 涵蓋多個不相關主題 |
| 9 | 文件更新 | 變更檔案清單 | 改了程式碼但未更新相關文件 |
| 10 | 測試覆蓋 | 變更檔案清單 | 改了 `src/` 但無對應 `tests/` 變更 |

## Title 格式規範

### 正確格式

```
type: 簡短描述（不超過 70 字元）
```

### Type 對照表

| Type | 使用場景 | 範例 |
|------|---------|------|
| `feat` | 全新功能 | `feat: 新增用戶認證流程` |
| `fix` | Bug 修復 | `fix: 修正登入頁面白屏問題` |
| `refactor` | 重構（不改行為） | `refactor: 拆分 utils 為獨立模組` |
| `docs` | 純文件修改 | `docs: 更新 API 使用範例` |
| `test` | 測試相關 | `test: 補充 auth 模組單元測試` |
| `chore` | 雜務（CI、設定） | `chore: 更新 CI pipeline 設定` |
| `perf` | 效能優化 | `perf: 優化列表頁載入速度` |
| `style` | 格式調整（不改邏輯） | `style: 統一縮排為 2 spaces` |

### 好的 vs 壞的 Title

| 品質 | 範例 | 問題 |
|:----:|------|------|
| ✅ 好 | `feat: 新增 GitHub Issue 自動匯入功能` | 明確說明「做了什麼」 |
| ✅ 好 | `fix: 修正並行 agent 狀態競爭問題` | 指出具體 bug |
| ❌ 壞 | `更新程式碼` | 無 type prefix、過於模糊 |
| ❌ 壞 | `feat: 更新` | type 正確但描述空洞 |
| ❌ 壞 | `fix: 修正了很多 bugs 包括登入頁面和設定頁面還有 API` | 超過 70 字元、多職責 |
| ❌ 壞 | `WIP` | 不完整的 PR 不該開啟 |

## Body 完整性檢查

### 必要區段

| 區段 | 用途 | 內容要求 |
|------|------|---------|
| Summary | 變更摘要 | 1-3 個 bullet point，說明「為什麼做」和「做了什麼」 |
| Changes | 變更清單 | 列出主要變更的檔案或模組 |
| Test Results | 測試結果 | 各 stage 結果（PASS/FAIL）+ BDD scenario 摘要 |

### 選填區段

| 區段 | 用途 | 何時包含 |
|------|------|---------|
| Closes | 關聯 Issue | workflow.json 有 issueNumber 時 |
| Breaking Changes | 破壞性變更 | API 或行為有不相容改動時 |
| Screenshots | 畫面截圖 | 涉及 UI 變更時 |

### Body 範例對比

| 品質 | 特徵 |
|:----:|------|
| ✅ 好 | Summary 2-3 bullet（說明 why + what）、Changes 列出主要檔案、Test Results 含 stage 結果、有 Closes # |
| ❌ 壞 | 一句話帶過（"修了一些東西"）、無結構、無測試結果 |

## Diff 大小與拆分

| Diff 大小 | 評級 | 建議 |
|:---------:|:----:|------|
| 1-100 行 | 小型 | 快速合併 |
| 101-300 行 | 中型 | 仔細審查 |
| 301-500 行 | 大型 | 考慮拆分 |
| 500+ 行 | 超大 | 強烈建議拆分（按主題 / 按層 / refactor 與 feat 分開）|

## 合併策略決策

### 決策樹

```
PR 要合併
  │
  ├─ 只有 1 個 commit？
  │    └─→ Merge（保持歷史簡潔）
  │
  ├─ 多個 commits 但主題單一？
  │    └─→ Squash merge（合為一個有意義的 commit）
  │
  ├─ 多個 commits 各自獨立有意義？
  │    └─→ Merge（保留完整歷史）
  │
  └─ 從長期分支合回 main？
       └─→ Merge（保留分支歷史脈絡）
```

### 策略比較

| 策略 | 指令 | 優點 | 缺點 | 適用場景 |
|------|------|------|------|---------|
| Merge | `gh pr merge --merge` | 保留完整歷史 | 歷史可能雜亂 | 多個有意義的 commit |
| Squash | `gh pr merge --squash` | 歷史簡潔 | 丟失中間 commit | 多個瑣碎 commit |
| Rebase | `gh pr merge --rebase` | 線性歷史 | 可能衝突 | 小型 PR + 線性偏好 |

## 自動化檢查腳本參考

### PR 建立前自動檢查順序

```
1. git log base..HEAD --oneline     → 確認有 commits
2. git diff base..HEAD --stat       → 統計 diff 大小
3. gh pr list --head <branch>       → 檢查是否已有 PR
4. workflow.json stages             → 取得測試結果
5. 組裝 title + body                → 套用格式規範
6. gh pr create                     → 建立 PR
```
