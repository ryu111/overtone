import { describe, it, expect } from "bun:test";
import {
	checkSummaryFormat,
	summaryFormatStop,
} from "../../../../.claude/hooks/modules/summary-format-guard.js";

// 防回歸：rules/環境/總結格式.md 強制條款的 hook 實作。
// Manager 多次違反 MUST/NEVER — 這個 hook 是硬閘門。

describe("checkSummaryFormat", () => {
	const goodText = `
## 本次完成

### 任務明細

1. **第一項**：動作、證據、影響
2. **第二項**：動作、證據、影響
3. **第三項**：動作、證據、影響

### ★ Insight

1. 第一個洞察
2. 第二個洞察

## 接下來的建議

建議 X / Y / Z
`;

	it("含本次完成 + 接下來的建議 + Insight + 條列 → valid", () => {
		const r = checkSummaryFormat(goodText);
		expect(r.valid).toBe(true);
	});

	it("不含本次完成 → valid（一般對話不觸發）", () => {
		expect(checkSummaryFormat("純對話回覆沒有完成章節").valid).toBe(true);
		expect(checkSummaryFormat("").valid).toBe(true);
		expect(checkSummaryFormat(null).valid).toBe(true);
	});

	it("含本次完成缺「接下來的建議」→ invalid", () => {
		const text = `## 本次完成\n\n### 任務明細\n1. A\n2. B\n3. C\n### ★ Insight\n洞察`;
		const r = checkSummaryFormat(text);
		expect(r.valid).toBe(false);
		expect(r.reason).toContain("接下來");
	});

	it("含本次完成缺「★ Insight」→ invalid", () => {
		const text = `## 本次完成\n\n### 任務明細\n1. A\n2. B\n3. C\n## 接下來的建議\n建議`;
		const r = checkSummaryFormat(text);
		expect(r.valid).toBe(false);
		expect(r.reason).toContain("Insight");
	});

	it("任務明細用 pipe table 不用條列 → invalid", () => {
		const text = `## 本次完成

### 任務明細

| 項目 | 根因 | 證據 |
|---|---|---|
| A | a | e1 |
| B | b | e2 |
| C | c | e3 |

### ★ Insight
洞察

## 接下來的建議
建議
`;
		const r = checkSummaryFormat(text);
		expect(r.valid).toBe(false);
		expect(r.reason).toContain("條列");
	});

	it("任務明細混合表格+條列（條列 ≥ 3）→ valid", () => {
		const text = `## 本次完成

### 任務明細

1. **第一**：內容 | 可以有 | pipe char in body
2. **第二**：內容
3. **第三**：內容

### ★ Insight
洞察

## 接下來的建議
建議
`;
		const r = checkSummaryFormat(text);
		expect(r.valid).toBe(true);
	});

	it("含本次完成 + ### Insight header → valid", () => {
		const text = `## 本次完成\n\n### 任務明細\n1. A\n2. B\n3. C\n\n### ★ Insight\n洞察\n\n## 接下來的建議\n建議`;
		expect(checkSummaryFormat(text).valid).toBe(true);
	});

	it("含本次完成 + ★ Insight inline（非 header）→ valid", () => {
		const text = `## 本次完成\n\n### 任務明細\n1. A\n2. B\n3. C\n\n\`★ Insight ─────\`\n洞察\n\`─────\`\n\n## 接下來的建議\n建議`;
		expect(checkSummaryFormat(text).valid).toBe(true);
	});
});

describe("summaryFormatStop handler", () => {
	it("無 last_assistant_message → allow", () => {
		expect(summaryFormatStop({}).decision).toBe("allow");
		expect(summaryFormatStop({ last_assistant_message: "" }).decision).toBe("allow");
	});

	it("合規 summary → allow", () => {
		const good = `## 本次完成\n### 任務明細\n1. A\n2. B\n3. C\n### ★ Insight\nx\n## 接下來的建議\ny`;
		expect(summaryFormatStop({ last_assistant_message: good }).decision).toBe("allow");
	});

	it("缺 Insight → block with reason", () => {
		const bad = `## 本次完成\n### 任務明細\n1. A\n2. B\n3. C\n## 接下來的建議\ny`;
		const r = summaryFormatStop({ last_assistant_message: bad });
		expect(r.decision).toBe("block");
		expect(r.reason).toContain("Insight");
	});

	it("fail-open：regex 錯誤時不阻擋（safety net）", () => {
		// input 是特殊物件，handler 會 catch 並 allow
		const r = summaryFormatStop({ last_assistant_message: { toString: () => { throw new Error("bad"); } } });
		// 型別檢查讓它歸為 non-string → valid: true
		expect(r.decision).toBe("allow");
	});
});
