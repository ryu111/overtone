// checker.js — pass/fail 檢查邏輯
// regex checker：must_match 全部匹配 + must_not_match 全部不匹配 → pass

export function runChecker(task, content) {
	const check = task.check || {};
	if (check.type === "regex") {
		const mustMatch = check.must_match || [];
		const mustNotMatch = check.must_not_match || [];
		for (const p of mustMatch) {
			if (!new RegExp(p).test(content)) {
				return { pass: false, reason: `must_match failed: /${p}/` };
			}
		}
		for (const p of mustNotMatch) {
			if (new RegExp(p).test(content)) {
				return { pass: false, reason: `must_not_match violated: /${p}/` };
			}
		}
		return { pass: true, reason: null };
	}
	return { pass: false, reason: `unknown checker type: ${check.type}` };
}
