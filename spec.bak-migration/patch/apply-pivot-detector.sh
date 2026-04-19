#!/bin/bash
# apply-pivot-detector.sh — ralph-loop-pivot-detector 實作 + 註冊 + test
# 派生：spec/討論/ralph-loop-pivot-detector.md
# Bootstrap Symmetry：第 8 次應用

set -e

CLAUDE_DIR="$HOME/.claude"
NB_DIR="$HOME/projects/nova-brain"

echo "═══════════════════════════════════════════"
echo "Apply ralph-loop-pivot-detector"
echo "═══════════════════════════════════════════"

# Step 1: 建 hooks/modules/ralph-loop-pivot-detector.js
echo "[1/4] 建 pivot-detector hook module"
cat > "$CLAUDE_DIR/hooks/modules/ralph-loop-pivot-detector.js" <<'HOOK_EOF'
// Role: Sensor — ralph-loop 空轉偵測
// 派生：spec/討論/ralph-loop-pivot-detector.md
// 偵測同一目標 >= 4 iter 但近 15min 0 commit → UserPromptSubmit 注入 warn

import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

export function getIteration(cwd) {
	const path = `${cwd}/.claude/ralph-loop.local.md`;
	if (!existsSync(path)) return null;
	const m = readFileSync(path, "utf-8").match(/iteration:\s*(\d+)/);
	return m ? parseInt(m[1], 10) : null;
}

export function getCommitCountSince(cwd, isoTime) {
	try {
		const out = execSync(`git -C ${cwd} log --since="${isoTime}" --oneline 2>/dev/null | wc -l`).toString().trim();
		return parseInt(out, 10) || 0;
	} catch (e) { /* fail-open */ return 0; }
}

export function detectPivot(input) {
	try {
		const cwd = input?.cwd;
		if (!cwd) return null;
		const iter = getIteration(cwd);
		if (!iter || iter < 4) return null;
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
	} catch (e) {
		process.stderr.write(`[ralph-loop-pivot-detector] error: ${e.message}\n`);
	}
	return null;
}

export const on = {
	UserPromptSubmit: detectPivot,
};
HOOK_EOF
echo "  ✓ hook module 建立"

# Step 2: 註冊到 hook-client.js MODULE_HANDLERS
echo "[2/4] 註冊到 LOCAL_MODULES.UserPromptSubmit"
node <<'JS_EOF'
const fs = require("node:fs");
const path = `${require("node:os").homedir()}/.claude/hooks/hook-client.js`;
let content = fs.readFileSync(path, "utf-8");

const oldLine = `    { path: 'hooks/modules/model-metrics-emitter.js', handlerKey: 'UserPromptSubmit' },
  ],
  'PreToolUse:Bash': [`;
const newLine = `    { path: 'hooks/modules/model-metrics-emitter.js', handlerKey: 'UserPromptSubmit' },
    { path: 'hooks/modules/ralph-loop-pivot-detector.js', handlerKey: 'UserPromptSubmit' },
  ],
  'PreToolUse:Bash': [`;

if (content.includes("ralph-loop-pivot-detector.js")) {
	console.log("  ⚠️ 已註冊，跳過");
} else if (!content.includes(oldLine)) {
	console.error("  ❌ 找不到註冊 anchor");
	process.exit(1);
} else {
	content = content.replace(oldLine, newLine);
	fs.writeFileSync(path, content);
	console.log("  ✓ 註冊完成");
}
JS_EOF

# Step 3: 建 baseline test
echo "[3/4] 建 tests/unit/ralph-loop-pivot-detector.test.js"
cat > "$NB_DIR/tests/unit/ralph-loop-pivot-detector.test.js" <<'TEST_EOF'
// ralph-loop-pivot-detector.test.js — 空轉偵測 baseline
// 派生：spec/討論/ralph-loop-pivot-detector.md

import { describe, test, expect } from "bun:test";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";

const TMPDIR = "/tmp/pivot-detector-test";

function setup(iter) {
	if (existsSync(TMPDIR)) rmSync(TMPDIR, { recursive: true });
	mkdirSync(`${TMPDIR}/.claude`, { recursive: true });
	writeFileSync(
		`${TMPDIR}/.claude/ralph-loop.local.md`,
		`---\niteration: ${iter}\n---\n`,
	);
}

describe("ralph-loop-pivot-detector", () => {
	test("iter < 4 不觸發", async () => {
		setup(3);
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectPivot({ cwd: TMPDIR });
		expect(result).toBeNull();
	});

	test("iter >= 4 + 0 commit → 觸發 warn", async () => {
		setup(5);
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectPivot({ cwd: TMPDIR });
		expect(result?.hookSpecificOutput?.additionalContext).toContain("pivot-detector");
		expect(result?.hookSpecificOutput?.additionalContext).toContain("iter 5");
	});

	test("缺 cwd 不 crash", async () => {
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectPivot({});
		expect(result).toBeNull();
	});

	test("ralph-loop.local.md 不存在不 crash", async () => {
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectPivot({ cwd: "/tmp/nonexistent-pivot-test" });
		expect(result).toBeNull();
	});

	test("hook-client.js 已註冊", () => {
		const fs = require("node:fs");
		const content = fs.readFileSync(`${require("node:os").homedir()}/.claude/hooks/hook-client.js`, "utf-8");
		expect(content).toContain("ralph-loop-pivot-detector.js");
	});
});
TEST_EOF
echo "  ✓ test 建立"

# Step 4: 跑 test 驗證
echo "[4/4] 跑 test"
if bun test "$NB_DIR/tests/unit/ralph-loop-pivot-detector.test.js" 2>&1 | tail -3 | grep -q "0 fail"; then
	echo "  ✅ 全 pass"
	bun test "$NB_DIR/tests/unit/ralph-loop-pivot-detector.test.js" 2>&1 | tail -3
else
	echo "  ❌ test fail:"
	bun test "$NB_DIR/tests/unit/ralph-loop-pivot-detector.test.js" 2>&1 | tail -15
	exit 1
fi

# Commit
echo ""
cd "$CLAUDE_DIR"
git add hooks/modules/ralph-loop-pivot-detector.js hooks/hook-client.js

git commit -m "$(cat <<'COMMIT_EOF'
feat(pivot-detector): ralph-loop 空轉偵測 sensor

派生：spec/討論/ralph-loop-pivot-detector.md + synthesis-003 下輪建議 #2

偵測邏輯：
- iter >= 4 且近 15min 0 new commit → UserPromptSubmit 注入 warn
- fail-open：錯誤/缺 input 不阻擋主流程

補 ralph-loop 『同一目標 >3 iter 無進展』盲點。
iter 8-11 卡 Phase A 4 輪直到 /auto-drive 人工觸發 pivot 的根因修復。

Bootstrap Symmetry：spec/patch/apply-pivot-detector.sh (先例第 8 次)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
COMMIT_EOF
)"

cd "$NB_DIR"
git add tests/unit/ralph-loop-pivot-detector.test.js
git commit -m "$(cat <<'COMMIT_EOF'
test(pivot-detector): ralph-loop-pivot-detector baseline 5 test

- iter < 4 不觸發
- iter >= 4 + 0 commit → 觸發 warn
- 缺 cwd / 檔案不存在 不 crash (fail-open)
- hook-client.js LOCAL_MODULES.UserPromptSubmit 註冊驗證

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
COMMIT_EOF
)"

echo ""
echo "✅ pivot-detector 完成。"
