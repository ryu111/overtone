// report-writer.js — markdown 產生

export function writeModelReport(model, level, results) {
	const pass = results.filter((r) => r.pass).length;
	const fail = results.length - pass;
	const passPct = results.length > 0 ? ((pass / results.length) * 100).toFixed(1) : "0.0";
	const validResults = results.filter((r) => r.ok && r.tokens > 0 && r.elapsed_ms > 0);
	const tokPerSec = validResults.map((r) => (r.tokens / (r.elapsed_ms / 1000)));
	const avgTps = tokPerSec.length > 0 ? (tokPerSec.reduce((a, b) => a + b, 0) / tokPerSec.length).toFixed(2) : "0.00";
	const medianTps = tokPerSec.length > 0
		? [...tokPerSec].sort((a, b) => a - b)[Math.floor(tokPerSec.length / 2)].toFixed(2)
		: "0.00";

	const lines = [
		`# g-tier-benchmark-${model}-${level}`,
		`生成時間: ${new Date().toISOString()}`,
		"",
		"## 參數",
		`- Model: ${model}`,
		`- Level: ${level}`,
		`- Sample count: ${results.length}`,
		"",
		"## 結果總覽",
		"| set | pass | fail | pass% | avg tok/s | median tok/s |",
		"|-----|-----:|-----:|------:|----------:|-------------:|",
		`| ${level} | ${pass} | ${fail} | ${passPct}% | ${avgTps} | ${medianTps} |`,
		"",
		"## 逐 task",
		"| # | id | pass | tok | elapsed(ms) | tok/s | failure reason |",
		"|---|----|:----:|----:|------------:|------:|----------------|",
	];
	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		const tps = (r.ok && r.tokens > 0 && r.elapsed_ms > 0)
			? (r.tokens / (r.elapsed_ms / 1000)).toFixed(2)
			: "-";
		const reason = r.pass ? "" : (r.failureReason || r.error || "check failed").replace(/\|/g, "\\|").slice(0, 80);
		lines.push(`| ${i + 1} | ${r.id} | ${r.pass ? "✅" : "❌"} | ${r.tokens || 0} | ${r.elapsed_ms || 0} | ${tps} | ${reason} |`);
	}
	return lines.join("\n") + "\n";
}

export function writeCompareReport(level, modelResults) {
	const models = Object.keys(modelResults);
	const taskIds = modelResults[models[0]]?.map((r) => r.id) || [];
	const lines = [
		`# g-tier-benchmark-compare-${level}`,
		`生成時間: ${new Date().toISOString()}`,
		`模型：${models.join(" / ")}`,
		"",
		"## 對照表",
		`| task | ${models.join(" | ")} |`,
		`|------|${models.map(() => ":---:").join("|")}|`,
	];
	for (const tid of taskIds) {
		const row = [tid];
		for (const m of models) {
			const r = modelResults[m].find((x) => x.id === tid);
			if (!r) { row.push("-"); continue; }
			const tps = (r.ok && r.tokens > 0 && r.elapsed_ms > 0)
				? (r.tokens / (r.elapsed_ms / 1000)).toFixed(1)
				: "-";
			row.push(`${r.pass ? "✅" : "❌"} ${tps} tok/s`);
		}
		lines.push(`| ${row.join(" | ")} |`);
	}
	lines.push("");
	lines.push("## 總計");
	lines.push("| model | pass | fail | pass% | avg tok/s |");
	lines.push("|-------|-----:|-----:|------:|----------:|");
	for (const m of models) {
		const rs = modelResults[m];
		const pass = rs.filter((r) => r.pass).length;
		const valid = rs.filter((r) => r.ok && r.tokens > 0 && r.elapsed_ms > 0);
		const avg = valid.length > 0
			? (valid.reduce((s, r) => s + r.tokens / (r.elapsed_ms / 1000), 0) / valid.length).toFixed(2)
			: "0.00";
		const pct = rs.length > 0 ? ((pass / rs.length) * 100).toFixed(1) : "0.0";
		lines.push(`| ${m} | ${pass} | ${rs.length - pass} | ${pct}% | ${avg} |`);
	}
	return lines.join("\n") + "\n";
}
