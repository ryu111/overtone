---
## 2026-03-05 | developer:DEV Context
補齊 `config-validator.js` 和 `loop.js` 兩個模組的單元測試，解決 health-check `checkTestFileAlignment` 偵測到的覆蓋缺口。
Keywords: config, validator, loop, health, check, checktestfilealignment
---
## 2026-03-06 | developer:DEV Findings
1. **registry.js 修改方式**：pre-edit-guard.js 保護 registry.js 不允許 Edit 工具直接修改，改用 `bun -e` 腳本透過 fs 直接讀寫

2. **`new Date(null).getTime() = 0` 陷阱**：startedAt 為 null 時，`new Date(null).getTime()` 回傳 0（Unix epoch），ageMs 會是一個極大正數，誤觸 TTL。修復方式：先判斷 `entry.startedAt == null` 跳過，再用 `Number.isFinite(parsed.getTime())` 篩除非法字串

3. **health-check 函式介面**：`checkConcurrencyGuards({ sessionsDirOverride, fsConMdOverride })` 透過 DI 參數支援測試隔離，避免依賴真實 sessions 目錄

4. **timeline 計數測試**：新增 timeline event 後，`dashboard-registry.test.js` 的精確計數斷言（toBe）也需要同步更新（不只是 health-check 測試）

5. **並行競爭 3 fail**：bun scripts/test-parallel.js 仍有 3 個 fail，確認是原有的並行競爭條件問題（stash 前也有 23 fail），非本次引入
Keywords: registry, edit, guard, date, null, gettime, startedat, unix, epoch, agems
---
## 2026-03-06 | retrospective:RETRO Findings
**回顧摘要**：

8 個迭代的並行能力強化整體品質良好。G2 孤兒 TTL 偵測（17 個 scenario 全覆蓋）、CAS 壓力測試、compact 頻率偵測（health-check #21）、suggestOrder 失敗率二次排序、postdev 並行群組、docs 閉環均已正確實作並有對應測試。核心邏輯架構一致，模組化設計合理。

然而發現 **1 個 regression 測試失敗** 和 **1 個文件數字過時**：
Keywords: scenario, compact, health, check, suggestorder, postdev, docs, regression
