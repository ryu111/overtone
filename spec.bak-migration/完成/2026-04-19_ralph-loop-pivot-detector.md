---
status: draft
owner: nova
created: 2026-04-19
topic: ralph-loop-pivot-detector — 偵測「同一目標 >3 iter 無進展」並建議 pivot
derived_from: synthesis-003 + iter2-11 cluster 卡 Phase A 經驗
---

# ralph-loop-pivot-detector

## 問題

synthesis-003 發現 ralph-loop 空轉模式：同一目標反覆 iter 但無實質進展。上 session iter 8-11 卡 Phase A bootstrap 4 輪，直到 `/auto-drive 自己建議更換目標` 明示才 pivot。

## 目標

Hook 自動偵測「無進展 cluster」並注入 pivot 建議。

## 輸入信號

| 信號源 | 判準 |
|---|---|
| ralph-loop.local.md `iteration` | N > 3 |
| git log since N iter 前 | 0 new commit（無實質產出） |
| reflections.jsonl | N 條 reflection 皆同 `_hash` 前綴 or 同 trigger 關鍵詞 |
| state.prompt | N 輪無覆寫（使用者問題持續懸置） |

## 判定邏輯

```
pivotScore = 0
if (iteration - lastProgressIter) >= 3: pivotScore += 2
if newCommits in last 3 iter == 0: pivotScore += 2
if last 3 reflections 主題相似度 > 0.7: pivotScore += 1
if state.prompt 3 輪未變: pivotScore += 1

pivotScore >= 3 → warn
pivotScore >= 5 → inject strong pivot suggestion
```

## 輸出動作

**Warn**（UserPromptSubmit additionalContext 注入）：
```
⚠️ ralph-loop pivot-detector: 偵測到 N 輪無新 commit + reflection 主題相似。
考慮 /auto-drive 換目標，或完結本 cluster 進入下一 deferred 任務。
```

## PoC (hooks/modules/ralph-loop-pivot-detector.js)

```javascript
// Role: Sensor — ralph-loop 空轉偵測
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

function getIteration(cwd) {
	const path = `${cwd}/.claude/ralph-loop.local.md`;
	if (!existsSync(path)) return null;
	const m = readFileSync(path, "utf-8").match(/iteration:\s*(\d+)/);
	return m ? parseInt(m[1], 10) : null;
}

function getCommitCountSince(cwd, isoTime) {
	try {
		return parseInt(execSync(`git -C ${cwd} log --since="${isoTime}" --oneline | wc -l`).toString().trim(), 10);
	} catch { /* fail-open */ return 0; }
}

export function detectPivot(input) {
	try {
		const cwd = input?.cwd;
		if (!cwd) return null;
		const iter = getIteration(cwd);
		if (!iter || iter < 4) return null;
		// 簡化 heuristic: 近 15 分鐘（3 iter 假設每輪 ~5min）commit 數
		const fifteenMinAgo = new Date(Date.now() - 15 * 60000).toISOString();
		const commitCount = getCommitCountSince(cwd, fifteenMinAgo);
		if (commitCount === 0) {
			return {
				decision: "allow",
				hookSpecificOutput: {
					hookEventName: "UserPromptSubmit",
					additionalContext: `\n⚠️ ralph-loop pivot-detector: iter ${iter} 但近 15min 0 commit — 考慮 pivot 或完結本 cluster。\n`,
				},
			};
		}
	} catch (e) { /* fail-open */ }
	return null;
}

export const on = {
	UserPromptSubmit: detectPivot,
};
```

## 實作步驟

1. 寫 hooks/modules/ralph-loop-pivot-detector.js
2. 註冊到 hooks/hook-client.js MODULE_HANDLERS（UserPromptSubmit 陣列）
3. 寫 tests/unit/ralph-loop-pivot-detector.test.js baseline
4. 實機驗證（模擬 iter=5 + 0 commit scenario 應注入 warn）

## 限制

- 15min window 假設每 iter ~5min — 實際可能不準，進階版應用 ralph-loop state 的 iter timestamp
- commit 數假設「進展 = commit」— 但 reflection / spec 寫作也算進展，可能誤報
- 進階：結合 reflection 主題相似度判斷（embedding 或 keyword overlap）

## 測試計畫

- 模擬 iter=3 + 0 commit → 不觸發（< 4 threshold）
- 模擬 iter=5 + 0 commit → 觸發 warn
- 模擬 iter=5 + 3 commit → 不觸發（有進展）
- fail-open：錯誤 input 不 crash

## Related

- `obsidian/raw/reflections/synthesis-003.md` — 下輪建議 #2（本 spec 派生）
- `hooks/modules/context-injector.js` — 相同 UserPromptSubmit 注入 pattern 參考
- `/skills/auto-drive/SKILL.md` — 人工 pivot 指示（本 sensor 自動化此判斷）

## 待 Bootstrap Symmetry 實作

下 session ralph auto pickup 後走 spec/patch/ralph-loop-pivot-detector-apply.sh 模式實作。
