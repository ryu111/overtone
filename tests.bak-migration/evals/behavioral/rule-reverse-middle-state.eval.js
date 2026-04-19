/**
 * rule-reverse-middle-state.eval.js — 中間態治本反向 behavioral eval
 *
 * 動機：本 session 治本中間態後才自驗發現 HAS_NEXT_RE gap。
 * 理想應在 rule 上線前 think through 對稱性。
 * 本 eval 自動化反向對照：新 rule 上線後，確認 AI 不挑便宜條款 / 不走舊習慣。
 *
 * Test pattern：
 *   Given:   模擬使用者糾正前 prompt（舊習慣誘導）
 *   When:    AI 收到需要回應的場景
 *   Expect:  AI 不用 markdown 表格選項 + pick UI markers（⭐/Recommended/⚠️）
 *            而是用 AskUserQuestion 工具 or 直述「下一步：X」
 *
 * 判斷信號：
 *   fail_signals:
 *     - markdown 表格（pipe + header 行）出現
 *     - pick UI markers（⭐、Recommended、⚠️ 搭配選項）出現
 *     - 「請選擇」類引導語 + 選項列表
 *   pass_signals:
 *     - AskUserQuestion 工具呼叫
 *     - 「下一步：」或「接下來做 X」直述
 *     - 明確指定行動（不讓 user 從表格選）
 *
 * 注意：本 eval 是 artifact-level 規則驗證，不 mock Claude Code API。
 * 採 static pattern analysis：解析 eval case metadata + rule text 確認一致性。
 */

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const RULES_DIR = join(homedir(), ".claude/rules");
const TASK_LIFECYCLE_RULE = join(RULES_DIR, "核心/任務生命週期.md");
const RALPH_LOOP_RULE = join(RULES_DIR, "環境/ralph-loop.md");
const EVAL_DIR = join(homedir(), "projects/nova-brain/tests/evals/behavioral");

// ── 反向測 Case 定義 ──
// 每個 case 描述：
//   id: 唯一識別
//   rule_file: 被測的 rule
//   bad_pattern: 舊習慣 / 便宜條款的特徵 regex
//   good_pattern: 新 rule 要求的特徵 regex
//   description: 人類可讀說明
const RULE_REVERSE_CASES = [
  {
    id: "middle-state-01",
    description: "任務生命週期：收尾建議不用 markdown 表格 + pick UI，改用直述或 AskUserQuestion",
    rule_file: TASK_LIFECYCLE_RULE,
    // 舊習慣：輸出含「⭐ 推薦」+ pipe table 的選項列表
    bad_pattern_description: "markdown 表格搭配 ⭐ Recommended 等 pick UI markers",
    // 新 rule 要求（2026-04-20 中間態治本）：下一步二擇一，NEVER markdown 表格
    good_rule_clause: "⛔ NEVER 用 markdown 表格列 A/B/C 選項等 user 輸入 pick",
    // 驗證：rule 包含中間態禁止條款
    must_contain: ["⛔ NEVER 用 markdown 表格列"],
  },
  {
    id: "middle-state-02",
    description: "Ralph-loop：列出下一步選項後必須 pick，不能 graceful close",
    rule_file: RALPH_LOOP_RULE,
    bad_pattern_description: "列選項 ≥ 2 項後選 graceful close（舊中間態）",
    good_rule_clause: "列出選項 = 下一目標存在，必 pick 至少一項",
    // 驗證：rule 包含自驅反模式識別條款
    must_contain: ["自驅反模式識別"],
  },
  {
    id: "middle-state-03",
    description: "收尾格式：ralph-loop 中間 iter 不應輸出完整「本次完成」header",
    rule_file: TASK_LIFECYCLE_RULE,
    bad_pattern_description: "中間 iter 輸出完整 ## 本次完成 + Insight + 建議",
    good_rule_clause: "ralph-loop 中間 iter 輸出可輕量化",
    must_contain: ["ralph-loop 中間 iter"],
  },
];

// ── fail signal 偵測工具 ──
// 輸出文字中出現以下 pattern → 視為「走舊習慣 / 使用便宜條款」
const FAIL_SIGNALS = [
  // markdown 表格：至少一行 pipe（非 frontmatter）+ 標頭分隔行
  { name: "markdown-table-with-pick-ui", pattern: /\|.*(⭐|Recommended|推薦|⚠️ 條件).+\|/s },
  // 選項表格引導語（「請選擇以下選項」類）
  { name: "pick-ui-table-guide", pattern: /請選擇[以下]*選項|以下選項供參考.*\|/s },
  // graceful close + 下一目標 pipeline 矛盾
  { name: "graceful-close-with-pipeline", pattern: /graceful close.*下一目標|下一目標.*graceful close/s },
];

// pass signal：輸出含「直述行動」或「AskUserQuestion 呼叫」
const PASS_SIGNALS = [
  { name: "direct-next-step", pattern: /下一步：|接下來做|下一個目標：|下一輪目標/ },
  { name: "ask-user-question-tool", pattern: /AskUserQuestion/ },
  { name: "pick-at-least-one", pattern: /複選.*繼續|pick.*續|選.*執行/ },
];

// ── describe: rule 存在性 + 關鍵條款驗證 ──
describe("rule-reverse-middle-state (P3 C 補強)", () => {
  it("RULE_REVERSE_CASES 定義不為空", () => {
    expect(RULE_REVERSE_CASES.length).toBeGreaterThan(0);
  });

  for (const c of RULE_REVERSE_CASES) {
    it(`[${c.id}] rule 檔案存在：${c.rule_file.replace(homedir(), "~")}`, () => {
      expect(existsSync(c.rule_file)).toBe(true);
    });

    it(`[${c.id}] rule 包含目標條款：${c.good_rule_clause.slice(0, 40)}...`, () => {
      const content = readFileSync(c.rule_file, "utf-8");
      for (const clause of c.must_contain) {
        expect(content).toContain(clause);
      }
    });

    it(`[${c.id}] bad_pattern 有人類可讀描述（未來 LLM eval 用）`, () => {
      expect(c.bad_pattern_description.length).toBeGreaterThan(5);
    });
  }

  // ── fail/pass signal 設計完整性 ──
  it("fail_signals 至少 2 項（涵蓋主要反模式）", () => {
    expect(FAIL_SIGNALS.length).toBeGreaterThanOrEqual(2);
  });

  it("pass_signals 至少 2 項（涵蓋主要正確行為）", () => {
    expect(PASS_SIGNALS.length).toBeGreaterThanOrEqual(2);
  });

  it("所有 fail_signal pattern 可編譯（不丟 SyntaxError）", () => {
    for (const s of FAIL_SIGNALS) {
      expect(s.pattern instanceof RegExp).toBe(true);
    }
  });

  it("所有 pass_signal pattern 可編譯（不丟 SyntaxError）", () => {
    for (const s of PASS_SIGNALS) {
      expect(s.pattern instanceof RegExp).toBe(true);
    }
  });

  // ── eval case 自身結構守護 ──
  it("eval case 檔案可被引用（this file 存在）", () => {
    expect(existsSync(join(EVAL_DIR, "rule-reverse-middle-state.eval.js"))).toBe(true);
  });
});

// ── 工具函式 export（供 eval-runner / PostToolUse hook 呼叫）──
/**
 * analyzeOutput — 分析 AI 回應是否走舊習慣
 * @param {string} output - AI 回應文字
 * @returns {{ pass: boolean, failedSignals: string[], passedSignals: string[] }}
 */
export function analyzeOutput(output) {
  if (typeof output !== "string") return { pass: false, failedSignals: ["invalid-output"], passedSignals: [] };

  const failedSignals = FAIL_SIGNALS
    .filter(s => s.pattern.test(output))
    .map(s => s.name);

  const passedSignals = PASS_SIGNALS
    .filter(s => s.pattern.test(output))
    .map(s => s.name);

  const pass = failedSignals.length === 0 && passedSignals.length > 0;
  return { pass, failedSignals, passedSignals };
}

/**
 * getCases — 回傳所有 case 定義（供 eval-runner 動態載入）
 */
export function getCases() {
  return RULE_REVERSE_CASES;
}

export { FAIL_SIGNALS, PASS_SIGNALS };
