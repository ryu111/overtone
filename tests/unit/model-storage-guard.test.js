// model-storage-guard 單元測試（xd-jx65/5w6i Round 2 授權 P1）
// 7 case：canonical pass / non-canonical warn / 無 target warn / ComfyUI 豁免 / 邊界 / 非 model / snapshot_download

import { describe, it, expect } from "bun:test";
import { analyzeCommand, on } from "../../../../.claude/hooks/modules/model-storage-guard.js";

const handler = on.PostToolUse;

describe("analyzeCommand 判定邏輯", () => {
	it("1. canonical --local-dir ~/models/llm/ → pass", () => {
		const r = analyzeCommand("huggingface-cli download mlx-community/gemma-4-26b --local-dir ~/models/llm/gemma-4-26b-a4b-it-4bit/");
		expect(r.verdict).toBe("pass");
	});

	it("2. 無 --local-dir（走 HF cache）→ warn", () => {
		const r = analyzeCommand("huggingface-cli download mlx-community/gemma-4-26b");
		expect(r.verdict).toBe("warn");
		expect(r.reason).toBe("no_target_dir");
	});

	it("3. non-canonical 路徑 → warn", () => {
		const r = analyzeCommand("huggingface-cli download foo/bar --local-dir ~/some/other/path");
		expect(r.verdict).toBe("warn");
		expect(r.reason).toBe("non_canonical_path");
	});

	it("4. snapshot_download 無 local_dir → warn", () => {
		const r = analyzeCommand("python -c 'from huggingface_hub import snapshot_download; snapshot_download(repo_id=\"foo/bar\")'");
		expect(r.verdict).toBe("warn");
	});

	it("5. ComfyUI 豁免（命令含 ComfyUI/models/）→ pass", () => {
		const r = analyzeCommand("cd ~/ComfyUI/models/checkpoints && huggingface-cli download foo/bar");
		expect(r.verdict).toBe("pass");
		expect(r.reason).toBe("ComfyUI exempt");
	});

	it("6. 邊界：同時含 --local-dir 和 ComfyUI 路徑 → ComfyUI 豁免優先 pass", () => {
		const r = analyzeCommand("huggingface-cli download foo/bar --local-dir ~/ComfyUI/models/checkpoints/foo/");
		expect(r.verdict).toBe("pass");
		expect(r.reason).toBe("ComfyUI exempt");
	});

	it("7. 非 model download（wget 一般檔案）→ pass", () => {
		const r = analyzeCommand("wget https://example.com/data.csv");
		expect(r.verdict).toBe("pass");
		expect(r.reason).toBe("not a model download");
	});

	it("8. mlx_lm.convert --mlx-path canonical → pass", () => {
		const r = analyzeCommand("mlx_lm.convert --hf-path foo/bar --mlx-path ~/models/llm/bar-4bit/");
		expect(r.verdict).toBe("pass");
	});

	it("9. mlx_lm.convert 非 canonical → warn", () => {
		const r = analyzeCommand("mlx_lm.convert --hf-path foo/bar --mlx-path /tmp/bar/");
		expect(r.verdict).toBe("warn");
	});
});

describe("PostToolUse handler", () => {
	it("非 Bash tool → allow 無 additionalContext", () => {
		const r = handler({ tool_name: "Write", tool_input: { content: "x" } });
		expect(r.decision).toBe("allow");
		expect(r.hookSpecificOutput).toBeUndefined();
	});

	it("Bash canonical → allow 無 warn", () => {
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: "huggingface-cli download foo --local-dir ~/models/llm/foo/" },
		});
		expect(r.decision).toBe("allow");
		expect(r.hookSpecificOutput).toBeUndefined();
	});

	it("Bash non-canonical → allow 含 warn additionalContext", () => {
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: "huggingface-cli download foo --local-dir /tmp/foo/" },
		});
		expect(r.decision).toBe("allow");
		expect(r.hookSpecificOutput?.additionalContext).toContain("不在 ~/models");
	});

	it("fail-open: malformed input → allow 不 throw", () => {
		expect(() => handler(null)).not.toThrow();
		expect(handler(null).decision).toBe("allow");
		expect(handler({}).decision).toBe("allow");
	});
});
