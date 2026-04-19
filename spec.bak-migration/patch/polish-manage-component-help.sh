#!/bin/bash
# polish-manage-component-help.sh — manage-component.js --help 文字補 3 類
# 派生：synthesis-003 下輪建議 #4
# 問題：L79-81 Types 只列 agent/hook/skill；L13 comment 同；實際支援 6 類 (Phase A)
# Bootstrap Symmetry：第 4 次應用

set -e

CLAUDE_DIR="$HOME/.claude"

echo "═══════════════════════════════════════════"
echo "Polish manage-component.js --help 補 3 類"
echo "═══════════════════════════════════════════"

# Step 1: 用 Python/node heredoc 替換（sed 多行替換易錯）
echo "[1/2] 替換 help Types 段"

node <<'JS_EOF'
const fs = require("node:fs");
const path = `${require("node:os").homedir()}/.claude/scripts/manage-component.js`;
let content = fs.readFileSync(path, "utf-8");

// L13 header comment: " * Types:   agent, hook, skill"
content = content.replace(
	" * Types:   agent, hook, skill",
	" * Types:   agent, hook, skill, script, rule, command",
);

// L79-81 usage array
const oldBlock = `		"Types:",
		"  agent   — Agent 定義（agents/*.md + registry-data.json + plugin.json）",
		"  hook    — Hook 條目（hooks/hooks.json）",
		"  skill   — Skill 定義（skills/*/SKILL.md）",`;
const newBlock = `		"Types:",
		"  agent   — Agent 定義（agents/*.md + registry-data.json + plugin.json）",
		"  hook    — Hook 條目（hooks/hooks.json）",
		"  skill   — Skill 定義（skills/*/SKILL.md）",
		"  script  — CLI script（scripts/*.js + shebang + chmod +x）",
		"  rule    — Rule 文件（rules/{category}/*.md, category ∈ 核心/協作/品質/元件/環境）",
		"  command — Slash command（commands/*.md + frontmatter description）",`;

if (!content.includes(oldBlock)) {
	console.error("❌ 找不到 oldBlock，可能已被改過");
	process.exit(1);
}
content = content.replace(oldBlock, newBlock);

fs.writeFileSync(path, content);
console.log("  ✓ help Types 擴 6 類");
JS_EOF

# Step 2: 驗證 --help 輸出
echo "[2/2] 驗證 --help 輸出含 script/rule/command"
if bun "$CLAUDE_DIR/scripts/manage-component.js" --help 2>&1 | grep -q "script  — CLI script"; then
	echo "  ✅ --help 已更新"
else
	echo "  ❌ 驗證失敗"
	exit 1
fi

# Commit
echo ""
cd "$CLAUDE_DIR"
git add scripts/manage-component.js

git commit -m "$(cat <<'COMMIT_EOF'
docs(manage-component): --help Types 段補 script/rule/command 3 類

Phase A commit 854b5aa 擴實作後 --help 文字未同步。本次 polish 補齊。

派生：synthesis-003 下輪建議 #4
Bootstrap Symmetry：spec/patch/polish-manage-component-help.sh (先例第 4 次)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
COMMIT_EOF
)"

echo ""
echo "✅ polish 完成。"
