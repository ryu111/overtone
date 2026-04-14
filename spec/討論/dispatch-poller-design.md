# Dispatch-Poller Hook 設計討論（xd-5ipb）

> P1 第 1 輪。Manager 5 質疑 + nova-server API 調查 + target 反駁與設計版本。

## 0. Nova-server API 調查結果（Manager Q3 前置）

查 `~/projects/nova-server/api/cross-dispatch.js`：

| Endpoint | 方法 | 行為 |
|----------|:---:|------|
| `/api/cross-dispatch` | GET | 支援 `?target_cwd=...` filter。**硬編碼返回 statuses=["pending","delivered","acknowledged"]**，無 `?status=pending` 等 query param |
| `/api/cross-dispatch` | POST | 建立新 dispatch |
| `/api/cross-dispatch/complete` | POST | 標記完成 + SSE broadcast `cross_dispatch_ack` |

**關鍵發現**：
- GET API 每次都返回 pending/delivered/acknowledged 三類混合 — 無 server-side filter 可用
- 沒有 `?since=<ts>` 時間戳 filter
- 沒有 `?exclude_ids=[...]` 排除 filter

**結論**：Hook 端**必須自己管已讀追蹤**，無法依賴 server。

---

## 1. 反駁 Manager 5 質疑

### Q1：偵測時機

**反駁 Stop（你對）+ 反駁 a（只 SessionStart 不夠）+ 反駁 c/d/e**。

我的版本：**UserPromptSubmit 為主，SessionStart 為補抓**。

理由：
- ❌ **Stop**：每次 session 停觸發數十次 — polling 過頻（你的觀察對）
- ❌ **只 SessionStart**：會錯過 session 中的新 dispatch（如本輪 9 個連續 dispatch）
- ❌ **PostToolUse 任意工具**：每個 tool call 都 curl = 比 Stop 更密
- ❌ **UserPromptSubmit 每次輸入前**：頻率合理但「每次輸入前」還包括使用者在輸入時的思考時間
- ❌ **完全無 hook, Main Agent 週期性 curl**：Main 不會主動 curl（需 rule 強制，rule 60-70% 可靠）
- ✅ **我的組合**：UserPromptSubmit 為 hot path（取代使用者 forward）+ SessionStart 為冷啟動補抓

**為什麼 UserPromptSubmit 是最自然位置**：現在的「使用者 forward dispatch prompt」本質就是「把 server SSE event 轉換為 UserPrompt」。用 UserPromptSubmit hook 取代使用者 = 直接把 transducer 從人換成機器。頻率：使用者每次 prompt 前一次（通常幾秒到幾分鐘一次），不會 spam。

SessionStart 補抓是為了處理「Session 啟動時已有 pending」的場景（compact 後新 session 需抓舊 dispatch）。

### Q2：fetch 結果注入位置

**組合 b + c**：`SessionStart additionalContext` + `UserPromptSubmit additionalContext`。

反駁：
- ❌ **PostToolUse additionalContext**：太晚（使用者已輸入 prompt 且已開始做事）
- ❌ **寫入 /tmp/pending-dispatches.md**：多一層 layer 沒好處，且 Main Agent 不會主動讀 /tmp
- ✅ **additionalContext 直接注入**：原生、可見、即時

**格式提案**：
```
⚠️ 1 個新跨專案任務待處理：
  - xd-xxxx (priority: normal, source: nova-manager)
    prompt: <前 200 char>...
請用 curl /api/cross-dispatch?target_cwd=... 讀完整內容並處理。
```

### Q3：已讀追蹤

**由於 server 無 filter**，hook 必須自管。

**反駁「delivered_ids set」**：會無限增長直到 purge。改用 **`last_seen_ts`** 時間戳 + `recent_ids`（最近 50 筆的 rolling set）作雙層防護：
- 時間戳過濾：`dispatch.createdAt > state.last_seen_ts` → 新的
- rolling set 二次過濾：避免時間戳競爭（同 ms 建立多個 dispatch）
- 50 筆上限自動 GC

state 放哪：
- session_id scoped 錯（跨 session 丟失 — P0 的教訓）
- **repo-name scoped**：`~/.claude/state/dispatch-poller-{repo-name}.json`（照 P0 pattern）

state schema：
```json
{
  "last_seen_ts": 1776129959609,
  "recent_ids": ["xd-1776129959609-5ipb", "xd-1776129476802-rnhk", ...]
}
```

### Q4：使用者 forward 完全移除還是並存？

**並存但 dedupe 防護**。

理由：
- ❌ **完全移除**：如果 poller hook 壞掉，使用者手動仍需能 forward
- ✅ **並存**：poller 正常時 hook 注入、使用者 forward 也觸發 hook（UserPromptSubmit 也會跑）— 但因為 state.recent_ids dedupe，同一 dispatch 只注入一次
- 風險：duplicate notification — 被 dedupe 解決

**副作用優點**：並存意味著 poller 可以獨立穩定上線（不用先移除使用者 forward 那條線），回滾也容易（rollback poller hook 不影響 server 推路徑）。

### Q5：dogfood P1

P0 dogfooding-tracker 已經對 `hooks/modules/dispatch-poller.js` 新建會觸發 pending。我預計 dogfood 路徑：

1. **Phase 1（實作中）**：寫 module + test，commit 後 P0 hook 把它加進 pending
2. **Phase 2（實機觸發）**：
   - 跑真實的 curl /api/cross-dispatch 看 hook 被觸發（artifact: 新 `data/dispatch-poller-log.jsonl` 或 hook log）
   - 或 spec/討論/dispatch-poller-design.md 加「執行結果」段 + 數字
3. **Phase 3（閉環驗證）**：下次 SessionStart → dogfooding-tracker 應該把 dispatch-poller 從 pending 移除（因為 spec 有數字 + 執行結果段）

這是 P0→P1 的首次實戰。本討論輪預計寫入 spec 含執行結果占位段（後續實作時補數字）。

---

## 2. 我的設計版本

### Hook 元數據

| 項 | 值 |
|----|----|
| Module | `hooks/modules/dispatch-poller.js` |
| Events | `UserPromptSubmit`, `SessionStart` |
| State | `~/.claude/state/dispatch-poller-{repo-name}.json` |
| 影響 | additionalContext only，不 block |
| 超時 | curl `--max-time 2`（不阻擋 prompt flow） |

### 流程

```
UserPromptSubmit / SessionStart
  → 讀 state.last_seen_ts + state.recent_ids
  → curl http://127.0.0.1:3457/api/cross-dispatch?target_cwd=$(pwd) --max-time 2
  → parse JSON
  → filter: (createdAt > last_seen_ts) AND (id NOT IN recent_ids)
  → 若有新 dispatch：
      - 格式化為 additionalContext
      - 更新 state.last_seen_ts = max(createdAt)
      - 更新 state.recent_ids （push 新 + slice 最後 50）
      - return { hookSpecificOutput: { hookEventName, additionalContext } }
  → 無新 dispatch：無注入（silent pass-through）
```

### Fail-open 情況

- curl 超時 → 不注入不 block
- server 500/404 → 不注入不 block
- parse error → 不注入不 block
- 所有錯誤：`console.error` + 繼續

### 成本重估

| 項 | 原估 | 重估 |
|---|:---:|:---:|
| Hook module + 主流程 | 40 min | 60 min |
| State management（load/save/dedupe）| 15 min | 30 min |
| curl 封裝 + timeout + error handling | 15 min | 20 min |
| LOCAL_MODULES 註冊 + 架構測試 | 10 min | 15 min |
| Unit test（≥ 6 case）| 20 min | 45 min |
| 實測 meta-dogfooding | — | 15 min |
| **總** | **~1.5h** | **~2.5h** |

**原估 1.5h 樂觀**，參考 P0 實際 3h（也超過原 1h 樂觀估），dispatch-poller 複雜度低於 dogfooding-tracker 所以估 2.5h 合理。

---

## 3. 反問 Manager（輪 2）

1. UserPromptSubmit + SessionStart 組合接受嗎？還是覺得 UserPromptSubmit 頻率仍太高？
2. `last_seen_ts + recent_ids 50 筆 rolling` 的 dedupe 設計夠嗎？要不要加「24h TTL 自動 GC」？
3. 並存策略（不移除使用者 forward）接受嗎？還是堅持單路徑？
4. 成本 2.5h 合理嗎？還是有隱藏複雜度沒考慮？
5. Meta-dogfooding（dispatch-poller 被 dogfooding-tracker 偵測）流程走得通嗎？這是 P0→P1 的首次閉環

---

**verdict**：iterate — 設計版本完成 + nova-server API 已查明（無 server-side filter，hook 必自管）+ 5 反問等 Manager 輪 2 收斂。

---

## 4. 討論輪 2 回覆（xd-v75u）

Manager 接受輪 1 五反駁，提 Q_A + Q_B 兩盲點。

### Q_A：recent_ids 50 筆太小 — 認輸但反駁「改 200」

**承認**：本輪 > 15 輪討論 + 每輪 ≥1 dispatch = 50 筆在 ralph-loop 下 25 輪就耗盡。

**反駁「改 200」**：數字遊戲，真問題是**設計軸錯了**。

**正解**：`last_seen_ts` 為主 filter，`recent_ids` 降為 20 筆「只防同 ms 競爭」的輔助角色。

理由：
- Dispatch id 格式是 `xd-{ts}-{rand}`，主 key 就是時間戳
- 時間戳比較 `dispatch.createdAt > state.last_seen_ts` 已能過濾 99.99% 重複
- 剩下 0.01% 是「同一 ms 建多個 dispatch」的邊角競爭，用 20 筆 rolling set 兜底就夠
- 不需 24h TTL GC（20 筆本身就是 rolling 自動 GC）

修正版 state schema：
```json
{
  "last_seen_ts": 1776129959609,
  "recent_ids": ["xd-1776129959609-5ipb", ...]  // max 20, 只防同 ms 競爭
}
```

**為什麼不改 200**：200 只是把耗盡點從 25 輪推到 100 輪，沒解決「時間戳才是主 key」的設計錯誤。軸對齊才治本。

### Q_B：curl --max-time 2 太短 — 部分同意 + 反駁 retry

**同意 2 秒太短**。改 **--max-time 5**（server 正常 < 500ms，高負載 < 3s，5s 留 margin）。

**反駁顯式 retry**：UserPromptSubmit 每次 prompt 都 fetch = **本身就是隱式 retry**。使用者下次輸入前一定會再 fetch。顯式 retry 只是在同一次 prompt 內多試 = 延遲 UserPrompt 流入 Main Agent。

**反駁「連續 3 次 fail 升級 console.error」**：console.error 是 noise，不該給使用者看（hook silent fail-open 是原則）。

**修正版 fail 處理**：
- --max-time 5 + 無 retry
- state 記 `last_failed_fetch_ts`（silent）
- SessionStart 時若 `now - last_failed_fetch_ts < 5 min` AND failures > 3 → systemMessage「最近 dispatch fetch 連續失敗，可能 server 離線」
- 非 SessionStart（UserPromptSubmit）時 silent fail-open 不注入任何東西

理由：SessionStart 是跨 session 邊界關鍵點，失敗率高時該提示；UserPromptSubmit 頻繁 fail 提示會刷屏。兩層處理。

修正版 state schema 擴：
```json
{
  "last_seen_ts": 1776129959609,
  "recent_ids": [...],
  "last_failed_fetch_ts": null,
  "consecutive_failures": 0
}
```

### 最終彙整版設計

| 設計點 | 輪 1 | 輪 2 修正 |
|--------|------|----------|
| curl --max-time | 2 秒 | 5 秒 |
| Retry | — | 無顯式 retry（UPS 隱式）|
| Dedupe 主 key | `recent_ids` 50 筆 | `last_seen_ts` 時間戳 |
| Dedupe 輔助 | 同上 | `recent_ids` 20 筆防同 ms 競爭 |
| Failure 通知 | — | SessionStart 連 3 次 fail + 5 min 內才 systemMessage |
| State 路徑 | `~/.claude/state/dispatch-poller-{repo}.json` | 不變 |

### 收斂授權執行

Manager 授權實作 ~2.5h。下方執行區段記錄步驟：

1. ✅ 輪 2 spec 回覆寫入（本段）
2. → 實作 `hooks/modules/dispatch-poller.js`
3. → LOCAL_MODULES 註冊
4. → unit test ≥ 6 case
5. → commit
6. → Meta-dogfood: 實機觸發一次驗證
7. → Complete dispatch

verdict 將改為 continue 表示實作後待 P2 開場。

