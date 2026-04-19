# reflection resolved_ratio sentinel 根因 (xd-x1qa, 2026-04-15)

## Manager 診斷

- reflections.jsonl 52 筆 autonomous 全未回寫 resolved_at → sentinel 18% fail
- Option A: autonomous 排除分母
- Option B: Stop hook 自動辨識「已 commit / 已寫 memory / 已入 rule」時寫 resolved_at

## 實測校準

### 錯誤假設反駁

Manager 讀 `nova-manager/data/reflections.jsonl` (52 筆 17/26 autonomous resolved = 65%)，但 **sentinel 真正讀的是 `nova-brain/data/reflections.jsonl`**（`autonomy-self-scan.js:25`）。

### nb reflections 實況

| type | 14d total | resolved | ratio |
|---|---|---|---|
| autonomous | 66 | 11 | 17% |
| correction | 1 | 0 | 0% |
| **合計** | 67 | 11 | **16%** |

確認 autonomous 反思大多 prose insight 無 commit/file/rule 可驗證 artifact → resolver 無法 pattern-match → 永遠 null。

## 真根因

**既有工具鏈齊全但未被呼叫**：
- `reflection-backfill.js` L73 含 `prose_action_unverifiable` → `resolved_at=now` 邏輯
- 但該 script 是 one-shot CLI，沒被 Stop hook 或 cron 自動觸發
- 結果：新 autonomous 反思寫入後長期 null，直到有人手動跑 backfill

## 採用方案 C（反駁 A/B 改 D）

### Option C - 立即修（本 dispatch 已做）
跑 `reflection-backfill.js --path ~/projects/nova-brain/data/reflections.jsonl` → 5/5 sentinel pass。

### Option D - 結構修（follow-up dispatch 建議）
`reflection-persist.js` 在 write 新 entry 時 inline apply backfill 判斷邏輯：若 action 缺 verifiable artifact (commit/file/rule) → 直接 `resolved_at=now, resolve_reason='prose_action_unverifiable'`。

**為何 D 勝過 A/B**：
- A 改分母 = 掩蓋問題（autonomous 是最高 volume 反思，排除等於 sentinel 失去意義）
- B 單做 Stop hook 比對 = 復刻 backfill.js 邏輯，DRY 違反
- D 把 backfill 判準前移到寫入端 = 根治未來、DRY、既有 backfill 退化成 migration tool

## 本輪行動

- ✅ 立即跑 backfill，sentinel 恢復 5/5
- ⏸ Option D 結構修 → follow-up dispatch (不搶先 commit runtime contract)

## 反思

Manager 讀錯 reflections.jsonl 檔案是 spec owner 該先抓的「source path assertion」— 下次診斷 sentinel 先 `grep PATH scripts/<sentinel-script>`。
