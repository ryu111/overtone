import { describe, it, expect } from "bun:test";
import {
	checkSummaryFormat,
	summaryFormatStop,
} from "../../../../.claude/hooks/modules/summary-format-guard.js";

// 防回歸：rules/環境/總結格式.md 強制條款的 hook 實作。
// 使用者要求任務明細用 markdown 表格（參考 /ask skill），非條列。

const goodTable = `
## 本次完成

### 任務明細

| # | 任務 | 動作/根因 | 證據 | 影響 |
|---|---|---|---|---|
| 1 | 修 bug A | 改 line 10 | commit abc | 解決 |
| 2 | 加 test | 新增 x.test.js | 5 pass | 覆蓋 |
| 3 | 更新 doc | 補說明 | file.md | 清楚 |

### ★ Insight

1. 第一個洞察
2. 第二個洞察

## 接下來的建議

建議 X / Y / Z
`;

describe("checkSummaryFormat", () => {
	it("合規：含本次完成 + 表格任務明細 + Insight + 接下來 → valid", () => {
		const r = checkSummaryFormat(goodTable);
		expect(r.valid).toBe(true);
	});

	it("不含本次完成 → valid（一般對話不觸發）", () => {
		expect(checkSummaryFormat("純對話回覆沒有完成章節").valid).toBe(true);
		expect(checkSummaryFormat("").valid).toBe(true);
		expect(checkSummaryFormat(null).valid).toBe(true);
	});

	it("含本次完成缺「接下來的建議」→ invalid", () => {
		const text = `## 本次完成\n\n### 任務明細\n| # | 任務 |\n|---|---|\n| 1 | A |\n| 2 | B |\n### ★ Insight\n洞察`;
		const r = checkSummaryFormat(text);
		expect(r.valid).toBe(false);
		expect(r.reason).toContain("接下來");
	});

	it("含本次完成缺「★ Insight」→ invalid", () => {
		const text = `## 本次完成\n\n### 任務明細\n| # | 任務 |\n|---|---|\n| 1 | A |\n## 接下來的建議\n建議`;
		const r = checkSummaryFormat(text);
		expect(r.valid).toBe(false);
		expect(r.reason).toContain("Insight");
	});

	it("任務明細用 1. 2. 3. 條列不用表格 → invalid", () => {
		const text = `## 本次完成

### 任務明細

1. **第一項**：動作、證據、影響
2. **第二項**：動作、證據、影響
3. **第三項**：動作、證據、影響

### ★ Insight
洞察

## 接下來的建議
建議
`;
		const r = checkSummaryFormat(text);
		expect(r.valid).toBe(false);
		expect(r.reason).toContain("表格");
	});

	it("任務明細 pipe table 少於 3 行 → invalid", () => {
		const text = `## 本次完成\n\n### 任務明細\n| # | 任務 |\n|---|---|\n\n### ★ Insight\n洞察\n\n## 接下來的建議\n建議`;
		// 只有 header + separator（2 行），沒 data row
		const r = checkSummaryFormat(text);
		expect(r.valid).toBe(false);
		expect(r.reason).toContain("表格");
	});

	it("副作用段可用條列不強制表格（只有任務明細要求表格）", () => {
		const text = `## 本次完成

### 任務明細

| # | 任務 | 證據 |
|---|---|---|
| 1 | A | e1 |
| 2 | B | e2 |

### 副作用與關聯改動

- 順手改了 X
- 順手改了 Y

### ★ Insight
洞察

## 接下來的建議
建議
`;
		expect(checkSummaryFormat(text).valid).toBe(true);
	});

	it("含本次完成 + ★ Insight inline（非 header）→ valid", () => {
		const text = `## 本次完成

### 任務明細
| # | 任務 |
|---|---|
| 1 | A |
| 2 | B |

\`★ Insight ─────\`
洞察
\`─────\`

## 接下來的建議
建議
`;
		expect(checkSummaryFormat(text).valid).toBe(true);
	});
});

describe("summaryFormatStop handler", () => {
	it("無 last_assistant_message → allow", () => {
		expect(summaryFormatStop({}).decision).toBe("allow");
		expect(summaryFormatStop({ last_assistant_message: "" }).decision).toBe("allow");
	});

	it("合規表格 → allow", () => {
		expect(summaryFormatStop({ last_assistant_message: goodTable }).decision).toBe("allow");
	});

	it("條列不用表格 → block", () => {
		const bad = `## 本次完成\n### 任務明細\n1. A\n2. B\n3. C\n### ★ Insight\nx\n## 接下來的建議\ny`;
		const r = summaryFormatStop({ last_assistant_message: bad });
		expect(r.decision).toBe("block");
		expect(r.reason).toContain("表格");
	});

	it("缺 Insight → block with reason", () => {
		const bad = `## 本次完成\n### 任務明細\n| # | 任務 |\n|---|---|\n| 1 | A |\n## 接下來的建議\ny`;
		const r = summaryFormatStop({ last_assistant_message: bad });
		expect(r.decision).toBe("block");
		expect(r.reason).toContain("Insight");
	});

	it("fail-open：非 string input → allow", () => {
		const r = summaryFormatStop({ last_assistant_message: { toString: () => { throw new Error("bad"); } } });
		expect(r.decision).toBe("allow");
	});
});
