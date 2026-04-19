#!/bin/bash
# phase-b-handoff-pointer.sh — SessionStart detectHandoffPointer 實作 (方案 B)
# 派生：spec/討論/sessionstart-handoff-pointer.md + synthesis-003 下輪建議 #3
# 目的：clear mode 下注入 handoff 前 5 行 + path（~400B，遠低於 5KB cap）
# Bootstrap Symmetry：第 5 次應用

set -e

CLAUDE_DIR="$HOME/.claude"
NB_DIR="$HOME/projects/nova-brain"

echo "═══════════════════════════════════════════"
echo "Phase B — SessionStart detectHandoffPointer 實作"
echo "═══════════════════════════════════════════"

# Step 1: 插入 detectHandoffPointer 函式 + 整合到 SessionStart handler
echo "[1/4] 修 context-injector.js 加 detectHandoffPointer + buildSessionContext 整合"

node <<'JS_EOF'
const fs = require("node:fs");
const path = `${require("node:os").homedir()}/.claude/hooks/modules/context-injector.js`;
let content = fs.readFileSync(path, "utf-8");

// 1. 插入 detectHandoffPointer 函式（放在 detectCompactRecovery 前）
const newFn = `function detectHandoffPointer(input) {
	try {
		if (input?.source !== "compact" && input?.source !== "clear") return null;
		const project = cwdToProject(input?.cwd);
		const handoffPath = \`/tmp/nova-handoff-\${project}.md\`;
		if (!existsSync(handoffPath)) return null;
		const content = readFileSync(handoffPath, "utf-8");
		const head5 = content.split("\\n").slice(0, 5).join("\\n");
		return \`\\n📄 handoff 檔：\${handoffPath}\\n前 5 行摘要：\\n\${head5}\\n（完整內容請 Read tool 取得）\\n\`;
	} catch (e) { /* fail-open */ return null; }
}

`;
const anchor = "function detectCompactRecovery(input) {";
if (!content.includes("function detectHandoffPointer")) {
	content = content.replace(anchor, newFn + anchor);
}

// 2. 在 buildSessionContext 插入 detectHandoffPointer 呼叫（第一位，優先級最高）
const oldBuild = `function buildSessionContext(_input) {
	return [
		injectComplianceTopViolations(),`;
const newBuild = `function buildSessionContext(_input) {
	const handoffPtr = detectHandoffPointer(_input);
	return [
		handoffPtr,
		injectComplianceTopViolations(),`;
if (!content.includes("const handoffPtr = detectHandoffPointer")) {
	content = content.replace(oldBuild, newBuild);
}

fs.writeFileSync(path, content);
console.log("  ✓ context-injector.js 已更新");
JS_EOF

# Step 2: 更新 nova-brain test — 將 6 個 test.todo 轉為實際 test
echo "[2/4] 更新 tests/unit/context-injector.test.js 6 個 test.todo → 實際 test"

# 用 node 批次替換
node <<'JS_EOF'
const fs = require("node:fs");
const path = `${require("node:os").homedir()}/projects/nova-brain/tests/unit/context-injector.test.js`;
let content = fs.readFileSync(path, "utf-8");

const oldBlock = `	test.todo("方案 B 實作後：source=compact + handoff 存在 → 注入 pointer + 前 5 行");
	test.todo("方案 B 實作後：source=clear + handoff 存在 → 注入 pointer + 前 5 行");
	test.todo("方案 B 實作後：source=startup → 不注入（無 handoff 場景）");
	test.todo("方案 B 實作後：handoff 不存在 → 不注入");
	test.todo("方案 B 實作後：注入內容 ≤ 500 bytes（避擠壓 5KB cap）");
	test.todo("方案 B 實作後：pointer 格式含 '📄 handoff 檔：' + 絕對路徑");`;

const newBlock = `	test("方案 B 實作後：source=compact + handoff 存在 → 注入 pointer + 前 5 行", async () => {
		const HANDOFF_PATH = "/tmp/nova-handoff-test-b1.md";
		const HANDOFF_BODY = "## Session Handoff — test-b1\\n日期：2026-04-19\\n\\n### 內容\\n前 5 行測試 content";
		writeFileSync(HANDOFF_PATH, HANDOFF_BODY);
		const mod = await import("/Users/sbu/.claude/hooks/modules/context-injector.js");
		const result = mod.on.SessionStart({ cwd: "/tmp/test-b1", source: "compact" });
		const ctx = result.hookSpecificOutput?.additionalContext || "";
		expect(ctx).toContain("📄 handoff 檔：");
		expect(ctx).toContain(HANDOFF_PATH);
		expect(ctx).toContain("前 5 行測試 content");
		try { unlinkSync(HANDOFF_PATH); } catch (e) { /* cleanup best-effort */ }
	});

	test("方案 B 實作後：source=clear + handoff 存在 → 注入 pointer + 前 5 行", async () => {
		const HANDOFF_PATH = "/tmp/nova-handoff-test-b2.md";
		writeFileSync(HANDOFF_PATH, "line1\\nline2\\nline3\\nline4\\nline5\\nline6");
		const mod = await import("/Users/sbu/.claude/hooks/modules/context-injector.js");
		const result = mod.on.SessionStart({ cwd: "/tmp/test-b2", source: "clear" });
		const ctx = result.hookSpecificOutput?.additionalContext || "";
		expect(ctx).toContain("📄 handoff 檔：");
		try { unlinkSync(HANDOFF_PATH); } catch (e) { /* cleanup best-effort */ }
	});

	test("方案 B 實作後：source=startup → 不注入（無 handoff 場景）", async () => {
		const HANDOFF_PATH = "/tmp/nova-handoff-test-b3.md";
		writeFileSync(HANDOFF_PATH, "some content");
		const mod = await import("/Users/sbu/.claude/hooks/modules/context-injector.js");
		const result = mod.on.SessionStart({ cwd: "/tmp/test-b3", source: "startup" });
		const ctx = result.hookSpecificOutput?.additionalContext || "";
		expect(ctx).not.toContain("📄 handoff 檔：");
		try { unlinkSync(HANDOFF_PATH); } catch (e) { /* cleanup best-effort */ }
	});

	test("方案 B 實作後：handoff 不存在 → 不注入", async () => {
		const mod = await import("/Users/sbu/.claude/hooks/modules/context-injector.js");
		const result = mod.on.SessionStart({ cwd: "/tmp/test-b4-nonexistent", source: "compact" });
		const ctx = result.hookSpecificOutput?.additionalContext || "";
		expect(ctx).not.toContain("📄 handoff 檔：");
	});

	test("方案 B 實作後：注入內容 ≤ 500 bytes（避擠壓 5KB cap）", async () => {
		const HANDOFF_PATH = "/tmp/nova-handoff-test-b5.md";
		writeFileSync(HANDOFF_PATH, "A".repeat(10000)); // 10KB handoff
		const mod = await import("/Users/sbu/.claude/hooks/modules/context-injector.js");
		const result = mod.on.SessionStart({ cwd: "/tmp/test-b5", source: "compact" });
		const ctx = result.hookSpecificOutput?.additionalContext || "";
		const pointerMatch = ctx.match(/📄 handoff 檔：[^（]+（完整內容請 Read tool 取得）/s);
		expect(pointerMatch).toBeTruthy();
		expect(pointerMatch[0].length).toBeLessThan(500);
		try { unlinkSync(HANDOFF_PATH); } catch (e) { /* cleanup best-effort */ }
	});

	test("方案 B 實作後：pointer 格式含 '📄 handoff 檔：' + 絕對路徑", async () => {
		const HANDOFF_PATH = "/tmp/nova-handoff-test-b6.md";
		writeFileSync(HANDOFF_PATH, "content");
		const mod = await import("/Users/sbu/.claude/hooks/modules/context-injector.js");
		const result = mod.on.SessionStart({ cwd: "/tmp/test-b6", source: "compact" });
		const ctx = result.hookSpecificOutput?.additionalContext || "";
		expect(ctx).toMatch(/📄 handoff 檔：\\/tmp\\/nova-handoff-[\\w-]+\\.md/);
		try { unlinkSync(HANDOFF_PATH); } catch (e) { /* cleanup best-effort */ }
	});`;

if (!content.includes(oldBlock)) {
	console.error("❌ 找不到 6 個 test.todo 區塊");
	process.exit(1);
}
content = content.replace(oldBlock, newBlock);
fs.writeFileSync(path, content);
console.log("  ✓ test.todo 轉 test 完成");
JS_EOF

# Step 3: 更新 baseline test — 現在 SessionStart 應注入 handoff（原 baseline 需更新）
echo "[3/4] 更新 baseline test（現況已變）"
node <<'JS_EOF'
const fs = require("node:fs");
const path = `${require("node:os").homedir()}/projects/nova-brain/tests/unit/context-injector.test.js`;
let content = fs.readFileSync(path, "utf-8");

// baseline 原期待「不注入」— 現在方案 B 實作後，source=compact 時會注入
// 改為：source=startup 時不注入（原 baseline 的意圖移到 source=startup）
const oldBaseline = `	test("baseline: 現況 SessionStart 不讀 handoff 檔（日後實作 detectHandoffPointer 時此 test 需更新）", async () => {
		const HANDOFF_PATH = "/tmp/nova-handoff-test-iter7.md";
		writeFileSync(HANDOFF_PATH, "## Session Handoff — test-iter7\\n日期：2026-04-19\\n\\n### 最近活動摘要\\n這是 handoff 前 5 行內容");

		const mod = await import("/Users/sbu/.claude/hooks/modules/context-injector.js");
		const result = mod.on.SessionStart({ cwd: "/tmp/test-iter7", source: "compact" });
		const ctx = result.hookSpecificOutput?.additionalContext || "";

		// 現況 baseline：不含 handoff 內容（未實作 detectHandoffPointer）
		expect(ctx).not.toContain("handoff 檔");
		expect(ctx).not.toContain("nova-handoff-test-iter7.md");

		try { unlinkSync(HANDOFF_PATH); } catch (e) { /* cleanup best-effort */ }
	});`;
const newBaseline = `	test("Phase B 實作後：source=compact 現已注入 handoff pointer（iter7 baseline 已升級）", async () => {
		const HANDOFF_PATH = "/tmp/nova-handoff-test-iter7.md";
		writeFileSync(HANDOFF_PATH, "## Session Handoff — test-iter7\\n日期：2026-04-19\\n\\n### 最近活動摘要\\n這是 handoff 前 5 行內容");

		const mod = await import("/Users/sbu/.claude/hooks/modules/context-injector.js");
		const result = mod.on.SessionStart({ cwd: "/tmp/test-iter7", source: "compact" });
		const ctx = result.hookSpecificOutput?.additionalContext || "";

		// Phase B 後：source=compact 有 handoff 檔時應注入 pointer
		expect(ctx).toContain("📄 handoff 檔：");
		expect(ctx).toContain("test-iter7.md");

		try { unlinkSync(HANDOFF_PATH); } catch (e) { /* cleanup best-effort */ }
	});`;
if (!content.includes(oldBaseline)) {
	console.error("⚠️ 找不到 iter7 baseline，可能已被更新");
} else {
	content = content.replace(oldBaseline, newBaseline);
	fs.writeFileSync(path, content);
	console.log("  ✓ iter7 baseline 升級完成");
}
JS_EOF

# Step 4: 跑 test 驗證
echo "[4/4] 跑 context-injector.test.js 驗證"
if bun test "$NB_DIR/tests/unit/context-injector.test.js" 2>&1 | tail -5 | grep -q "0 fail"; then
	echo "  ✅ 全 pass"
	bun test "$NB_DIR/tests/unit/context-injector.test.js" 2>&1 | tail -5
else
	echo "  ❌ test 失敗:"
	bun test "$NB_DIR/tests/unit/context-injector.test.js" 2>&1 | tail -20
	exit 1
fi

# Commit
echo ""
echo "═══════════════════════════════════════════"
echo "Commit"
echo "═══════════════════════════════════════════"

cd "$CLAUDE_DIR"
git add hooks/modules/context-injector.js
git commit -m "$(cat <<'COMMIT_EOF'
feat(context-injector): SessionStart detectHandoffPointer 實作（方案 B）

派生：spec/討論/sessionstart-handoff-pointer.md + synthesis-003 下輪建議 #3

改動：
- 新增 detectHandoffPointer(input) 函式
  - source=compact|clear 時讀 /tmp/nova-handoff-{project}.md
  - 注入 pointer + 前 5 行摘要（~400B）
- buildSessionContext 第一位注入 handoff pointer
  - 優先級最高，避 cap 截斷

效益：
- clear mode 多一道防線（原僅靠 continuation prompt 觸發 AI Read）
- compact/clear mode 架構對稱性恢復

Bootstrap Symmetry：spec/patch/phase-b-handoff-pointer.sh (先例第 5 次)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
COMMIT_EOF
)"

cd "$NB_DIR"
git add tests/unit/context-injector.test.js
git commit -m "$(cat <<'COMMIT_EOF'
test(context-injector): Phase B 6 handoff pointer test 轉實際 test

原 iter7 寫 6 個 test.todo 作為方案 B 期待行為契約。
Phase B 實作（~/.claude commit 對應）後，todo 轉實際 test：
- source=compact 注入
- source=clear 注入
- source=startup 不注入
- handoff 不存在不注入
- 注入內容 ≤ 500 bytes
- pointer 格式驗證

iter7 baseline「不注入」升級為「已注入」。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
COMMIT_EOF
)"

echo ""
echo "✅ Phase B 完成。"
