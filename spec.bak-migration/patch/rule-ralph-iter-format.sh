#!/bin/bash
# rule-ralph-iter-format.sh — rules/核心/任務生命週期.md 加 ralph-loop 中間 iter 輕量輸出條款
# 派生：reflection #23 「輸出格式自作繭」+ 使用者 iter 1 「怎麼做到真 7/24」
# Bootstrap Symmetry：第 9 次應用

set -e

CLAUDE_DIR="$HOME/.claude"

echo "═══ Rule: ralph-loop 中間 iter 輕量輸出條款 ═══"

node <<'JS_EOF'
const fs = require("node:fs");
const path = `${require("node:os").homedir()}/.claude/rules/核心/任務生命週期.md`;
let content = fs.readFileSync(path, "utf-8");

const anchor = "⛔ NEVER 機械套用 AskUserQuestion 問技術/流程小事 — 收尾建議用表格直接列（附 ⭐ 推薦 / ⚠️ 條件標記）。";
const addition = `
💡 COULD ralph-loop 中間 iter（active=true + deferred 非空）輸出可輕量化 — 1-2 句 progress log（「iter N: 做了 X, 繼續 Y」），不寫「## 本次完成」header（summary-format-guard.js 會自動豁免檢查）。完整格式保留給 session 真正結束 / 使用者查詢 / deferred 清空時使用。
⛔ NEVER 每輪 iter 都輸出完整「本次完成 + Insight + 建議」— 本身是對話收尾格式，ralph-loop stream 不需要，自己給自己製造 friction。`;

if (content.includes("ralph-loop 中間 iter")) {
	console.log("  ⚠️ 已有條款，跳過");
} else if (!content.includes(anchor)) {
	console.error("  ❌ 找不到 anchor");
	process.exit(1);
} else {
	content = content.replace(anchor, anchor + addition);
	fs.writeFileSync(path, content);
	console.log("  ✓ 條款加入");
}
JS_EOF

cd "$CLAUDE_DIR"
git add rules/核心/任務生命週期.md
git commit -m "$(cat <<'COMMIT_EOF'
docs(rules): 任務生命週期.md 加 ralph-loop 中間 iter 輕量輸出條款

派生：reflection #23 「輸出格式自作繭」+ 使用者 iter 1 「怎麼做到真 7/24」

新增：
- 💡 COULD ralph-loop 中間 iter 可輕量 progress log（1-2 句），免完整總結格式
- ⛔ NEVER 每輪都輸出完整格式 — 對話收尾格式污染 stream

summary-format-guard.js L36 HAS_COMPLETION_RE 已有豁免機制，
此條款明示給未來 AI 避免再次自作繭。

Bootstrap Symmetry：spec/patch/rule-ralph-iter-format.sh (先例第 9 次)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
COMMIT_EOF
)" 2>&1 | tail -3
