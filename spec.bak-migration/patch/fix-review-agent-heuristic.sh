#!/bin/bash
# fix-review-agent-heuristic.sh — review-agent.js commit_message.actionable 硬 coded 修復
# 派生：iter 3 發現 + synthesis-003 「下輪建議」
# 問題：L97 硬 coded「補動機至 hooks/modules/」— 不管 commit 實際改什麼檔
#   誤判案：c07294f 只改 obsidian/raw/reflections/synthesis-index.jsonl 被建議補 hooks/modules/ 動機
# Bootstrap Symmetry：第 3 次應用（Phase A + backtick + heuristic）

set -e

CLAUDE_DIR="$HOME/.claude"
NB_DIR="$HOME/projects/nova-brain"

echo "═══════════════════════════════════════════"
echo "Fix review-agent.js heuristic — 依 commit 檔案位置動態選文案"
echo "═══════════════════════════════════════════"

# Step 1: 查當前邏輯
echo "[1/3] 當前 heuristic:"
grep -n "補動機至 hooks/modules" "$CLAUDE_DIR/scripts/review-agent.js" | head -2

# Step 2: 替換硬 coded 字串為動態邏輯
# 原：`補動機至 hooks/modules/ 對應元件說明`（硬 coded）
# 新：依 commit.files 推斷 scope
# 策略：最小改動 — 改成通用「描述改了什麼 + 為什麼」，後續再演化完整邏輯
echo "[2/3] 替換為依 commit.files 的動態選文案"
sed -i '' 's|補動機至 hooks/modules/ 對應元件說明|補 commit message 描述改了什麼 + 為什麼（1-3 句）|' "$CLAUDE_DIR/scripts/review-agent.js"
grep -n "補 commit message" "$CLAUDE_DIR/scripts/review-agent.js" | head -2

# Step 3: 驗證 review-agent.test.js 仍 pass
echo "[3/3] 跑 review-agent test 確認無回歸"
if bun test "$NB_DIR/tests/unit/review-agent.test.js" 2>&1 | grep -q "0 fail"; then
	echo "  ✅ test pass"
else
	echo "  ❌ test 失敗，回滾:"
	bun test "$NB_DIR/tests/unit/review-agent.test.js" 2>&1 | tail -10
	# 回滾
	sed -i '' 's|補 commit message 描述改了什麼 + 為什麼（1-3 句）|補動機至 hooks/modules/ 對應元件說明|' "$CLAUDE_DIR/scripts/review-agent.js"
	echo "  已回滾"
	exit 1
fi

# Commit
echo ""
echo "═══════════════════════════════════════════"
echo "Commit"
echo "═══════════════════════════════════════════"
cd "$CLAUDE_DIR"
git add scripts/review-agent.js

git commit -m "$(cat <<'COMMIT_EOF'
fix(review-agent): commit_message.actionable 從硬 coded 改通用文案

原：建議「補動機至 hooks/modules/ 對應元件說明」— 不管 commit 實際改什麼檔
問題：iter 3 誤判案例 c07294f 只改 obsidian/raw/reflections/synthesis-index.jsonl，
      但建議指向 hooks/modules/ scope 錯置

新：改為通用「補 commit message 描述改了什麼 + 為什麼（1-3 句）」
   避免 scope 誤指，scope-specific 建議待未來 commit.files 分析邏輯演化

派生：synthesis-003 下輪建議 + iter 3 reflection #15
Bootstrap Symmetry：spec/patch/fix-review-agent-heuristic.sh (Phase A 先例第 3 次)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
COMMIT_EOF
)"

echo ""
echo "✅ heuristic 修復完成。"
