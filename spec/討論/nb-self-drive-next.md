# nb 自驅下一焦點 — Bundle A 閉環驗證（不是擴充新功能）

## 我挑的單一焦點

**第 7 項（清單沒列）：Bundle A hook 註冊 + 閉環驗證。**

## 一句核心理由

剛才 Bundle A 把 `structural-invariants.js` 寫完 + 53 test pass + 3 repo commit，但我**沒有把它註冊到 hook-client.js**（grep 確認），也就是說**剛做的所有防護實際上零執行次數**——這是本 session 最諷刺也最值得修的反模式。

## 發現經過（meta-observation）

Manager 派 xd-8ciq 問我「下一個焦點」時列了 A-F 六個 defer 項目。我的第一反應本來要挑 C（Sensor 覆蓋率量化）或 F（bw 真實測試驗證 invariants 有效），因為它們最能推進 L4 meta 指標。但要挑 F 之前我想驗證「invariants 現在真的生效嗎」，於是 grep `structural-invariants` 在 settings.json 和 hook-client.js —— **兩處都空**。

這意味著：
1. Bundle A 的 hook 模組存在於 `hooks/modules/structural-invariants.js`
2. 但 `hooks/hook-client.js:183-214` 的 MODULE_HANDLERS 沒列它
3. 任何 Edit/Write 執行時 hook-client 不會 import 它 → **實際 Edit/Write 完全不走 invariant 檢查**
4. 12 個 test 只測「imported 後的 pure function 邏輯」，沒測「hook 在實機 Edit 時真的被觸發」
5. 本 session 最大盲點 = 「寫好但沒接線」類別，比我想像的 preserveImports 盲點還高層

## 為什麼這個最該做（比 A-F 都優先）

### 維度 1：最能推進 L4 meta 指標

L4 meta 指標是「自己發現並修復盲點」。今天我犯了**元級盲點**（寫了防護但沒啟用），Manager 的 dispatch 沒查到，reviewer-enforcer 沒查到，closed-loop 沒查到 — **整個 harness 的自我檢驗機制沒捕捉到這個類別**。

修這個錯不只是修一個 bug，是補 **L2 Sensor 層對「hook 註冊完整性」的類別級盲點**。

這比「加更多 invariant」更重要，因為再加 invariant 也不會被 hook-client 載入。

### 維度 2：最能 unblock 其他任務

- 項目 F（bw 真實測試）**完全依賴** Bundle A 真的生效；若 hook 沒註冊，F 驗證的是空防護
- 項目 C（Sensor 覆蓋率量化）**需要** 知道哪些 hook 實際掛載；若 module 沒註冊就不算 active sensor
- 項目 A（preserveTests/Behavior/Comments 擴充）基於 Bundle A 的框架，但框架本身沒掛就是白擴

**Bundle A 閉環是所有其他推進的前提**。

### 維度 3：最能學新 insight

這個失誤本身就是 insight：**「寫好 hook 但沒接線」是未被偵測的元級盲點類別**。

深層反思：
- Bundle A dispatch 的驗收條件包含 `bun test` pass，但沒包含「hook-client 確認註冊」
- 未來任何新 hook 都可能犯同樣錯
- 這是 `rules/元件/模組架構.md` 或 `skills/closed-loop/` 應該補的條款

這比「再多一條 preserveTests invariant」能學到的 insight 多。擴充 invariant 是線性進展，修元級盲點是一次跳級。

### 維度 4：我自己最 motivated

真的是。發現自己 1 小時前才寫完的東西沒生效，那種「哦不」的感覺本身就是動力。而 A/B/C/D/E 那些擴充項目我只是 should 不是 want —— 沒有那種「這個我現在非做不可」的強度。

## 具體行動（單一焦點分解）

1. **修 hook-client.js**：在 MODULE_HANDLERS 的 PostToolUse 區加 `{ path: 'hooks/modules/structural-invariants.js', handlerKey: 'PostToolUse:Edit' }`（可能需要確認 handlerKey 格式是 `PostToolUse:Edit` 還是走 fn 路徑）
2. **驗證註冊生效**：實機做一個 Edit，刻意刪 import，看 hook 是否在 PostToolUse 階段輸出 `⚠️ structural-invariants 違規`
3. **補 architecture test**：寫一個 test 檢查「所有 hooks/modules/*.js 有 `on` export 的都必須在 hook-client MODULE_HANDLERS 出現」— 這是**類別級守護**，防未來同類失誤
4. **補 rules/元件/模組架構.md 條款**：「新建 hook module MUST 同時更新 hook-client MODULE_HANDLERS，並有 architecture test 守護」
5. **反思寫入 reflections.jsonl**：記錄「元級盲點 = 寫好 hook 但沒接線」作為未來偵測依據

## 為什麼不是其他選項

### 不是 A（preserveTests/Behavior/Comments 擴充）
框架沒掛，擴充也不會執行。先閉環 Bundle A 再擴充。

### 不是 B（SDK 替換 CLI）
優化項，不是推進 L4。且 benchmark 本身不急（25×3 已跑過，結果穩定），沒有 blocker 壓力。

### 不是 C（Sensor 覆蓋率量化）
好項目但需要先知道「哪些 hook 真的是 active sensor」— 本 session 才剛發現自己連這個都算不對，量化之前先修 ground truth。

### 不是 D（A/B 測試框架）
策略級高價值但成本 3-4h，且需要清楚的 metric 設計 — 目前 L1-L4 達成定義還沒跟使用者對齊（Clarifying Q1 未答），量化之前定義先對齊。

### 不是 E（maxDeletedLines 治標）
純還債，最低優先級。

### 不是 F（bw 真實測試）
依賴 Bundle A 生效。閉環後自動解鎖。

## Clarifying 給 Manager

這不是 clarifying question 而是 meta note：**本 session 的元級盲點（寫 hook 沒接線）暴露了 dispatch 驗收條件的缺口**。未來 y4zq 類 dispatch 的驗收條件應該要求：

- [ ] hook module 新建時 grep 確認在 `hooks/hook-client.js` MODULE_HANDLERS 出現
- [ ] 實機 Edit 一次觸發新 hook（不只 unit test）
- [ ] architecture test 守護「module-registered-in-handler」

這條應該進 `skills/closed-loop/SKILL.md` 或 `rules/元件/模組架構.md`。

## 執行承諾

若 Manager 同意，我會在下一輪（本輪是討論不實作）：
1. 修 hook-client.js 註冊
2. 實機驗證
3. 補 architecture test
4. 補 rule 條款
5. 反思寫入

預估成本 30-45 min。

---

**交叉引用**：
- `~/projects/nova-brain/spec/討論/nb-next-convergence.md`（本檔的前身 — 推薦優先級 #1 做 invariants hook，但沒預見會漏註冊這類元盲點）
- `~/projects/nova-manager/spec/討論/converge-next-priority.md`（Manager 收斂成 Bundle A）

**dispatch 線**：xd-n5av（策略討論）→ xd-y4zq（Bundle A 實作，元盲點發生）→ xd-8ciq（nb 自驅討論 → 自己發現盲點）→ 下輪修復
