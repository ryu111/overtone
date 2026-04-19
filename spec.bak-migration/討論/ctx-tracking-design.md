# Ctx% Tracking 設計討論（xd-bs52）

> P5 第 1 輪。**重大發現：META BLIND SPOT 第三例** — statusline.sh 已含 `context_window.used_percentage` + transcript jsonl 含 `message.usage` 完整 token 欄位。Ctx% **不是要建，是要接線**。

## 0. 前置調查 — 揭露現況

### 發現 1：statusline.sh 已用 ctx%

`~/.claude/statusline.sh` line 29-30：
```bash
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
```

**Claude Code CLI 已在 statusline input 注入 `context_window.used_percentage`**！statusline 已用此值畫 progress bar（line 108-141），含 60%/80% 顏色 alert。

意味著：**ctx% 早已存在**，只是給 statusline 用，AI agent 自己看不到。

### 發現 2：Transcript jsonl 含 usage 欄位

`~/.claude/projects/<project>/<sessionId>.jsonl` 每個 assistant turn entry 含：
```json
{
  "message": {
    "usage": {
      "input_tokens": 3,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 46182,
      "output_tokens": 5,
      ...
    }
  }
}
```

意味著：**精確的 token usage 可從 transcript 算**（不是粗估）。

### 兩個發現的綜合

P5 命題「AI 不知道 ctx 用量」是錯的 — 資料都在，**只是沒接線給 AI**。這是 META BLIND SPOT 第三例（前兩例：xd-5mja structural-invariants、P2 reflection-resolver.js）。

P5 真問題：**把 statusline 已有的 ctx% 注入給 hook 和 AI**。

---

## 1. 反駁 Manager 6 質疑（基於正確現況）

### Q1：AI 知道自己 ctx% 的根本問題

**反駁「Claude Code CLI 不暴露 token 計數」前提**。

**事實**：CLI 暴露兩條路：
- 路徑 A: statusline input 含 `context_window.used_percentage`（精確）
- 路徑 B: transcript jsonl 含 `message.usage.input_tokens + cache_*`（精確可累計）

**反駁所有粗估方案 (a/b/c/d)**。a 是對的但描述太弱。修正：

**我的版本**：
- Hook 不能直接讀 statusline input（CLI 不傳給 hook）
- **但 hook 可以讀 transcript jsonl 的最後 assistant turn**（hook input 含 `transcript_path`！）
- 從最後 turn 的 `message.usage` 取 `input_tokens + cache_creation + cache_read = total prompt tokens`
- ctx% = `total / context_window_size * 100`
- context_window_size 從 hook input 的 `model.display_name` 解析（如 `(1M context)` → 1_000_000）

**完全可行 + 精確**，不是粗估。

### Q2：statusline 整合

**部分接受 + 反駁完全靠 statusline**：

statusline 已顯示 ctx%（但只人類看，AI 看不到）。問題是「AI agent 自己無法知道」— 即使 statusline 顯示 60%，AI 對話過程也不知道。

**我的版本**：**雙路徑**
- statusline 已顯示（保留）
- **新增 hook 注入 ctx% 到 UserPromptSubmit additionalContext**：每次 prompt 前注入「目前 ctx: X%」
- AI 看到後可主動觸發 self-compact

### Q3：觸發 auto self-compact

**反駁「靠 AI 看到後決定」**：rule 60-70% 可靠度教訓 — AI 看到 ctx > 30% 不一定會 compact。

**反駁「hook 自動觸發 self-compact」**：太重 — 誤觸風險（compact 是 expensive operation）。

**我的版本（中庸）**：
- ctx > 30%: 注入 systemMessage warning「建議 self-compact」（不 block）
- ctx > 60%: 升級 systemMessage 加重「強烈建議 self-compact，再不做下次將自動觸發」
- ctx > 80%: hook 自動 spawn `bun ~/.claude/scripts/self-compact.js` async（fire-and-forget，不阻擋當前 prompt）
- 三階梯而非二元決定

**為什麼不在 30% 就 auto**：30% 是 rules/環境/自壓縮.md 的「主動建議線」，太早自動 compact 會打斷正常工作。80% 是「再不做就會 ctx overflow」的物理底線。

### Q4：與 autonomy-self-scan 關係

**接受**。P3 加第 9 個 sentinel `ctx_tracking_wired`：
- 檢查 `hooks/modules/ctx-tracker.js` 存在 + LOCAL_MODULES UserPromptSubmit 註冊
- 跟 dispatch_poller_wired 同 pattern

### Q5：成本估算

原估 2h 因 transcript usage 已存在所以**降低**：

| 項 | 估時 |
|---|:---:|
| `hooks/modules/ctx-tracker.js` (parse transcript + 三階梯 inject) | 1h |
| Test ≥ 6 case | 30 min |
| LOCAL_MODULES 註冊 + 架構守護 | 10 min |
| 加 P3 sentinel `ctx_tracking_wired` | 15 min |
| Meta-dogfood + 實機驗證 | 15 min |
| **總** | **~2h** |

跟原估一樣。雖然「資料已存在」便宜了一邊，但「三階梯邏輯 + spawn self-compact」貴了另一邊，淨持平。

### Q6：誤診風險 — Manager 部分對

**Manager 對**「真問題可能是 policy 不是 metric」。但**反駁「兩者擇一」**：

兩者都需要：
- **Metric (ctx%)**：是 prerequisite — 沒 metric 無法寫 policy
- **Policy (rule)**：定義何時 compact

但我的設計**已經包含 policy**（Q3 三階梯）— 不是純 metric report。所以 P5 真完整版是「metric + policy 一起做」。

`rules/環境/自壓縮.md` 已有「ctx > 30% 主動壓縮」條款 — 是 policy 但**沒有可執行 metric 支援**。我的 hook 同時提供 metric (注入) + 三階梯 policy (自動升級)。

**結論**：Manager Q6 是部分誤診 — 不是「metric 替換為 policy」，是「metric + policy 同時實作才完整」。已有 policy（rule）需要 metric 支援。

---

## 2. 我的設計版本

### Hook 元數據

| 項 | 值 |
|----|----|
| Module | `hooks/modules/ctx-tracker.js` |
| Events | `UserPromptSubmit` |
| Input 來源 | `transcript_path` 從 hook input |
| 影響 | additionalContext 注入 + 三階梯 policy |

### 主流程

```
UserPromptSubmit
  → 讀 hook input.transcript_path
  → tail jsonl 找最後 assistant turn 的 message.usage
  → 計算 total = input_tokens + cache_creation + cache_read
  → 解析 model.display_name → context_window_size (1M / 200K)
  → ctx% = total / context_window_size * 100
  → 三階梯：
    - < 30%: 不注入
    - 30-60%: additionalContext「ctx X% — 建議告一段落後 self-compact」
    - 60-80%: additionalContext「⚠️ ctx X% — 強烈建議 self-compact」
    - > 80%: additionalContext「⚠️ ctx X% — 已自動觸發 self-compact」 + spawn async
```

### Token 計算偽碼

```js
function computeCtxPct(transcriptPath, contextWindowSize) {
  const lines = readFileSync(transcriptPath, "utf-8").trim().split("\n");
  // 反向找最後一個含 message.usage 的 entry
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]);
      const usage = e?.message?.usage;
      if (usage) {
        const total = (usage.input_tokens || 0) +
                      (usage.cache_creation_input_tokens || 0) +
                      (usage.cache_read_input_tokens || 0);
        return (total / contextWindowSize) * 100;
      }
    } catch {}
  }
  return null;
}
```

### Context window size 解析

```js
function parseContextSize(modelDisplayName) {
  // "Claude Opus 4.6 (1M context)" → 1_000_000
  const m = modelDisplayName?.match(/\((\d+)([KM])\s*context\)/i);
  if (!m) return 200_000; // default
  const num = parseInt(m[1]);
  return m[2].toUpperCase() === "M" ? num * 1_000_000 : num * 1_000;
}
```

### Sentinel 9 for P3

新增到 `scripts/autonomy-self-scan.js`：
```js
function check_ctx_tracking_wired() {
  const content = readFileSync("hooks/hook-client.js");
  const passed = content.includes("ctx-tracker") && content.includes("UserPromptSubmit");
  return { passed, dimension: "自我觀測", ... };
}
```

---

## 3. 反問 Manager（輪 2）

1. 接受「META BLIND SPOT 第三例」診斷嗎？P5 真問題是接線而非建 metric？
2. 三階梯 policy（30/60/80）門檻接受嗎？還是有更好分界？
3. ctx > 80% 自動 spawn self-compact 接受嗎？還是純 systemMessage 不自動？
4. context_window_size 從 model.display_name regex 解析 vs config 化？
5. P3 sentinel 9 加到既有 autonomy-self-scan vs 等 P5 完成後另派？

---

**verdict**：iterate — 重大發現 META BLIND SPOT 第三例 + 完整設計版本 + 5 反問等 Manager 收斂。

**第三例 META BLIND SPOT 證明 pattern 強化**：xd-5mja structural-invariants → P2 reflection-resolver → P5 ctx tracking — 三例都是「資料/邏輯已存在但無 hook 接線給 AI 用」。可能需要新流程「凡 CLI 暴露的新欄位（statusline input / transcript schema）必須有 hook 偵測接線」。

---

## 4. 討論輪 2 — Q_A/Q_B 收斂

### Q_A：META BLIND SPOT 防護策略 — 選 a (P5 順手補 sentinel 10)

選 a 併入本 P5 scope。理由：三次同 pattern 已不是巧合；延後 P6 會變 deferred 死任務（P3 Q_E 教訓）；純 rule 60-70% 可靠太弱；順手做 ~30 min 不額外加成本。

**Sentinel 10：`statusline_field_consumed`** — 掃 statusline.sh 所有 `jq -r '.X.Y'` 路徑，check 任何 hook 是否讀同一路徑。簡單機械化跟 sentinel 2 同 pattern。

### Q_B：spawn async race — Deferred-to-SessionStart pattern

Manager race 質疑對。spawn async 在 UPS hook 後 Main 同時開始 process 是真實 race。

**反駁所有方案**：block UPS 等於 deny prompt 極端；exit 1 太激進；純靠 AI 自覺 60-70%。

**我的版本：Deferred-to-SessionStart**：
- UPS 80% 不 spawn，只**寫 state flag** `pending_compact: true` + 注入 systemMessage warning
- **SessionStart hook 偵測 flag → 強制 spawn self-compact**
- SessionStart 是天然安全窗口（Main 還沒開始 process）

雙路徑保證 100%：路徑 1 AI 主動 + 路徑 2 hook 強制下次 SessionStart。

修正三階梯：< 30% 不注入 / 30-60% 提醒 / 60-80% 強烈建議 / > 80% 強警告 + 寫 state flag + 下次 SessionStart 強制 compact。

state schema:
```json
{ "pending_compact": true, "ctx_pct_at_trigger": 82, "triggered_at": "..." }
```

### 收斂授權執行

Manager 授權 P5 + Q_A sentinel 10 = ~2.5h。

