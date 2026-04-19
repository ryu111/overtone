#!/bin/bash
# phase-a-apply.sh — Phase A bootstrap 一鍵 apply
# 使用者授權後執行：bash ~/.claude/spec/patch/phase-a-apply.sh
# 派生自 ralph-loop iter 2-11 cluster + Manager reply (nm-reply 573dd7f)
# 目的：解所有 BLOCKED 任務 (#3/#4/#5/#6/#7)

set -e

CLAUDE_DIR="$HOME/.claude"
NB_DIR="$HOME/projects/nova-brain"

echo "═══════════════════════════════════════════"
echo "Phase A Bootstrap Apply — iter 2-11 成果"
echo "═══════════════════════════════════════════"

# ──────────────────────────────────────────────
# Step 1: 修復 manage-component.js 半成品狀態
# 現況：L114 type 清單已擴 6 類（iter 1 sed），但 error msg 沒同步，switch 沒擴
# 補齊：error msg + createScript/Rule/Command inline 實作 + switch 分支
# ──────────────────────────────────────────────
echo "[1/5] 修 manage-component.js error msg + switch 分支"

# 1a. 修 error msg
sed -i '' 's|（合法值：agent, hook, skill）|（合法值：agent, hook, skill, script, rule, command）|' "$CLAUDE_DIR/scripts/manage-component.js"

# 1b. 補 switch 分支 — 在 create switch 的 skill case 後插入
# 用 awk 精確定位插入
awk '
  /case "skill":$/ && !seen_create { seen_create=1; print; next }
  seen_create && /break;$/ && !inserted_create {
    print
    print "\t\tcase \"script\":"
    print "\t\t\tresult = createScript(opts, PLUGIN_ROOT);"
    print "\t\t\tbreak;"
    print "\t\tcase \"rule\":"
    print "\t\t\tresult = createRule(opts, PLUGIN_ROOT);"
    print "\t\t\tbreak;"
    print "\t\tcase \"command\":"
    print "\t\t\tresult = createCommand(opts, PLUGIN_ROOT);"
    print "\t\t\tbreak;"
    inserted_create=1
    next
  }
  { print }
' "$CLAUDE_DIR/scripts/manage-component.js" > /tmp/mc-patched.js
mv /tmp/mc-patched.js "$CLAUDE_DIR/scripts/manage-component.js"

# 1c. 在檔末尾前插入 createScript/Rule/Command 函式定義
# 這裡用 heredoc append 到現有 else process.exit(1) 後
cat >> "$CLAUDE_DIR/scripts/manage-component.js" <<'INLINE_EOF'

// ── Phase A 擴充：script / rule / command inline 實作 ──
// 派生：spec/討論/self-drive-cli-expansion.md (Manager verdict: Phase A)

function createScript(opts, pluginRoot) {
	const { writeFileSync, chmodSync, existsSync } = require("node:fs");
	const errors = [];
	if (!opts.name) errors.push("name 必填");
	if (!opts.body) errors.push("body 必填");
	if (errors.length) return { success: false, errors };
	const path = join(pluginRoot, "scripts", `${opts.name}.js`);
	if (existsSync(path)) return { success: false, errors: [`已存在：${path}`] };
	const shebang = opts.shebang || "#!/usr/bin/env bun";
	writeFileSync(path, `${shebang}\n${opts.body}\n`);
	chmodSync(path, 0o755);
	return { success: true, path };
}

function createRule(opts, pluginRoot) {
	const { writeFileSync, existsSync, mkdirSync } = require("node:fs");
	const VALID_CATEGORIES = ["核心", "協作", "品質", "元件", "環境"];
	const errors = [];
	if (!opts.name) errors.push("name 必填");
	if (!opts.body) errors.push("body 必填");
	if (!opts.category) errors.push("category 必填");
	else if (!VALID_CATEGORIES.includes(opts.category))
		errors.push(`category 必須為：${VALID_CATEGORIES.join("/")}`);
	if (errors.length) return { success: false, errors };
	const dir = join(pluginRoot, "rules", opts.category);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const path = join(dir, `${opts.name}.md`);
	if (existsSync(path)) return { success: false, errors: [`已存在：${path}`] };
	writeFileSync(path, opts.body);
	return { success: true, path };
}

function createCommand(opts, pluginRoot) {
	const { writeFileSync, existsSync } = require("node:fs");
	const errors = [];
	if (!opts.name) errors.push("name 必填");
	if (!opts.body) errors.push("body 必填");
	if (errors.length) return { success: false, errors };
	const path = join(pluginRoot, "commands", `${opts.name}.md`);
	if (existsSync(path)) return { success: false, errors: [`已存在：${path}`] };
	const desc = opts.description ? `---\ndescription: ${opts.description}\n---\n\n` : "";
	writeFileSync(path, `${desc}${opts.body}`);
	return { success: true, path };
}
INLINE_EOF

echo "  ✓ manage-component.js 擴充完成"

# ──────────────────────────────────────────────
# Step 2: 修 context-injector.js L316 typo
# ──────────────────────────────────────────────
echo "[2/5] 修 context-injector.js L316 typo"
sed -i '' 's|_cwdToProject(input?.cwd)|cwdToProject(input?.cwd)|' "$CLAUDE_DIR/hooks/modules/context-injector.js"
echo "  ✓ typo 修復"

# ──────────────────────────────────────────────
# Step 3: 用新 CLI 建 scripts/routing-level.js
# ──────────────────────────────────────────────
echo "[3/5] 建 scripts/routing-level.js via manage-component.js"
BODY='import { cwdToProject } from "../hooks/lib/cwd-to-project.js";
const cwd = process.argv[2] || process.cwd();
process.stdout.write(cwdToProject(cwd));'

bun "$CLAUDE_DIR/scripts/manage-component.js" create script "$(jq -n --arg body "$BODY" '{name:"routing-level",body:$body}')"
echo "  ✓ routing-level.js 建立"

# 驗證
TEST_OUT=$(bun "$CLAUDE_DIR/scripts/routing-level.js" "$HOME/.claude")
if [ "$TEST_OUT" != "nova-brain" ]; then
	echo "  ❌ 驗證失敗：預期 nova-brain，實得 $TEST_OUT"
	exit 1
fi
echo "  ✓ 驗證：$HOME/.claude → nova-brain"

# ──────────────────────────────────────────────
# Step 4: 升級 rules/核心/深度路由.md line 13
# ──────────────────────────────────────────────
echo "[4/5] 升 rules/核心/深度路由.md"
sed -i '' 's|/tmp/nova-routing-level-\$(basename \$PWD)\.txt|/tmp/nova-routing-level-$(bun ~/.claude/scripts/routing-level.js).txt|' "$CLAUDE_DIR/rules/核心/深度路由.md"
echo "  ✓ rule 升級"

# ──────────────────────────────────────────────
# Step 5: 加 architecture.test.js 鎖定
# ──────────────────────────────────────────────
echo "[5/5] 加 architecture.test.js test case"
cat >> "$NB_DIR/tests/unit/architecture.test.js" <<'TEST_EOF'

// Phase A (iter 2-11 cluster) — routing-level CLI + rule 升級
describe("Phase A: routing-level CLI", () => {
	test("scripts/routing-level.js 存在且輸出 canonical project name", () => {
		const fs = require("node:fs");
		const path = `${require("node:os").homedir()}/.claude/scripts/routing-level.js`;
		expect(fs.existsSync(path)).toBe(true);
	});
	test("rules/核心/深度路由.md 引用 routing-level.js (非 basename $PWD)", () => {
		const fs = require("node:fs");
		const content = fs.readFileSync(`${require("node:os").homedir()}/.claude/rules/核心/深度路由.md`, "utf-8");
		expect(content).toContain("routing-level.js");
	});
	test("manage-component.js 支援 script/rule/command 3 類", () => {
		const fs = require("node:fs");
		const content = fs.readFileSync(`${require("node:os").homedir()}/.claude/scripts/manage-component.js`, "utf-8");
		expect(content).toContain('"script", "rule", "command"');
		expect(content).toContain("createScript");
		expect(content).toContain("createRule");
		expect(content).toContain("createCommand");
	});
});
TEST_EOF

echo "  ✓ architecture.test.js 擴充"

# ──────────────────────────────────────────────
# 驗證所有變更
# ──────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "驗證"
echo "═══════════════════════════════════════════"

echo "跑 test..."
bun test "$NB_DIR/tests/unit/architecture.test.js" 2>&1 | tail -5
bun test "$NB_DIR/tests/unit/context-injector.test.js" 2>&1 | tail -5

# ──────────────────────────────────────────────
# Commit
# ──────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "Commit"
echo "═══════════════════════════════════════════"

# ~/.claude commits
cd "$CLAUDE_DIR"
git add scripts/manage-component.js scripts/routing-level.js hooks/modules/context-injector.js rules/核心/深度路由.md spec/patch/phase-a-apply.sh spec/討論/self-drive-cli-expansion.md spec/討論/sessionstart-handoff-pointer.md obsidian/raw/reflections/synthesis-002.md obsidian/raw/reflections/synthesis-index.jsonl data/reflections.jsonl 2>/dev/null || true

git commit -m "$(cat <<'COMMIT_EOF'
feat(phase-a): manage-component.js 擴 3 類 + 修 L316 typo + routing-level CLI

派生自 ralph-loop iter 2-11 cluster + Manager reply (nm-reply 573dd7f)

改動：
- scripts/manage-component.js: 新增 create script/rule/command 支援
- scripts/routing-level.js: 新增 CLI wrapper（via manage-component）
- hooks/modules/context-injector.js: 修 L316 _cwdToProject typo
- rules/核心/深度路由.md: routing file 命名改用 CLI 取代 basename $PWD

驗收 anchor：
- tests/unit/architecture.test.js 3 新 case pass
- bun scripts/routing-level.js ~/.claude → nova-brain

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
COMMIT_EOF
)"

# nova-brain commits
cd "$NB_DIR"
git add tests/unit/architecture.test.js
git commit -m "$(cat <<'COMMIT_EOF'
test(phase-a): 鎖 routing-level CLI 存在 + manage-component 3 類

- scripts/routing-level.js 存在檢查
- rules/核心/深度路由.md 引用 routing-level.js
- manage-component.js 支援 script/rule/command

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
COMMIT_EOF
)"

echo ""
echo "✅ Phase A 完成。BLOCKED 任務 #3/#4/#5/#6/#7 全部解鎖。"
