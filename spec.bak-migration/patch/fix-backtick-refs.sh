#!/bin/bash
# fix-backtick-refs.sh — 修 rules/核心/自驅反思.md L4 backtick path 違規
# 派生：Manager nm-reply (phase-a-test-fail-challenge b3267c3)
#   違 rules/環境/寫作規範.md NEVER 用 backtick 包 vault-internal path
# Bootstrap 先例：Phase A commit 854b5aa（本 script 同模式）

set -e

CLAUDE_DIR="$HOME/.claude"
NB_DIR="$HOME/projects/nova-brain"

echo "═══════════════════════════════════════════"
echo "Fix backtick-refs — 錯誤零容忍 MUST 修復"
echo "═══════════════════════════════════════════"

# Step 1: 驗證 offender（Manager clean verdict 要求）
OFFENDERS=$(bun test "$NB_DIR/tests/unit/architecture.test.js" -t "md-link 唯一 SoT" 2>&1 | grep '"refs"' | wc -l | tr -d ' ')
echo "[1/3] 實測 offenders: $OFFENDERS 處"

# Step 2: sed 替換 backtick path → md-link
# 策略：rules/核心/自驅反思.md L4 唯一違規
# 原：`obsidian/raw/reflections/synthesis-NNN.md`
# 新：[obsidian/raw/reflections/](../../obsidian/raw/reflections/) 下 synthesis-NNN.md
echo "[2/3] 修 rules/核心/自驅反思.md L4"
sed -i '' 's|先讀 `obsidian/raw/reflections/synthesis-NNN.md` 最新版|先讀 [obsidian/raw/reflections/](../../obsidian/raw/reflections/) 下 synthesis-NNN.md 最新版|' "$CLAUDE_DIR/rules/核心/自驅反思.md"

# Step 3: re-run test 驗證
echo "[3/3] re-run test"
if bun test "$NB_DIR/tests/unit/architecture.test.js" -t "md-link 唯一 SoT" 2>&1 | grep -q "0 fail"; then
	echo "  ✅ test pass"
else
	echo "  ❌ test 仍 fail — 回報 stderr:"
	bun test "$NB_DIR/tests/unit/architecture.test.js" -t "md-link 唯一 SoT" 2>&1 | tail -10
	exit 1
fi

# Commit
echo ""
echo "═══════════════════════════════════════════"
echo "Commit"
echo "═══════════════════════════════════════════"
cd "$CLAUDE_DIR"
git add rules/核心/自驅反思.md spec/patch/fix-backtick-refs.sh

git commit -m "$(cat <<'COMMIT_EOF'
fix(rules): rules/核心/自驅反思.md L4 backtick path → md-link

違反 rules/環境/寫作規範.md NEVER 用 backtick 包 vault-internal path
(Obsidian Graph view 不認 backtick 為 edge)

派生：Manager nm-reply phase-a-test-fail-challenge b3267c3
Bootstrap：spec/patch/fix-backtick-refs.sh (Phase A 先例 symmetry)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
COMMIT_EOF
)"

echo ""
echo "✅ backtick bug 修復完成。tests/unit/architecture.test.js 0 fail。"
