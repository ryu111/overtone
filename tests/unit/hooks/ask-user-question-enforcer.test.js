// tests/unit/hooks/ask-user-question-enforcer.test.js
// 5 case regression 鎖定（xd-jze6）
// 覆蓋：違規觸發 warn / AskUserQuestion 豁免 / cross-dispatch 白名單 / 純資訊呈現 / 自動升級 block

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homedir } from "node:os";

// ── 測試輔助 ──────────────────────────────────────────────────────────────

/**
 * 建立假 transcript jsonl，最後一筆是 assistant message。
 * @param {{ text?: string, toolUses?: Array<{name:string,input:object}> }} opts
 * @returns {string} 檔案路徑
 */
function makeTranscript(dir, { text = "", toolUses = [] } = {}) {
  const content = [];
  // 前置幾筆非 assistant entry
  content.push(JSON.stringify({ role: "user", message: { role: "user", content: "hello" } }));

  // 組 assistant content blocks
  const blocks = [];
  if (text) blocks.push({ type: "text", text });
  for (const tu of toolUses) {
    blocks.push({ type: "tool_use", name: tu.name, input: tu.input || {} });
  }

  content.push(JSON.stringify({
    role: "assistant",
    message: { role: "assistant", content: blocks },
  }));

  const fp = join(dir, "transcript.jsonl");
  writeFileSync(fp, content.join("\n") + "\n");
  return fp;
}

/**
 * 動態 import enforcer（每次測試 fresh，避免模組快取污染）。
 */
async function loadEnforcer() {
  const { on } = await import(
    join(homedir(), ".claude/hooks/modules/ask-user-question-enforcer.js") +
    `?t=${Date.now()}`
  );
  return on.Stop;
}

// ── Fixture setup ─────────────────────────────────────────────────────────

let tmpDir;
let originalViolationsFile;

// 保存並暫時替換 VIOLATIONS_FILE 路徑需要透過環境變數或直接建測試環境。
// 因 enforcer 用 homedir() 固定路徑，測試使用 tmpDir 隔離 transcript，
// violations 寫入真實路徑 — 每個 case 用獨立計數控制（清空或預填）。

const VIOLATIONS_PATH = join(homedir(), ".claude/data/ask-user-violations.jsonl");
const VIOLATIONS_BACKUP = join(homedir(), ".claude/data/ask-user-violations.jsonl.test-bak");

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "enforcer-test-"));
  // 備份現有 violations（若存在）
  try {
    const { copyFileSync } = require("node:fs");
    copyFileSync(VIOLATIONS_PATH, VIOLATIONS_BACKUP);
  } catch { /* 不存在時忽略 */ }
});

afterEach(() => {
  // 清理 tmp
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  // 還原 violations 備份
  try {
    const { copyFileSync, unlinkSync } = require("node:fs");
    copyFileSync(VIOLATIONS_BACKUP, VIOLATIONS_PATH);
    unlinkSync(VIOLATIONS_BACKUP);
  } catch {
    // 原本就不存在：清掉測試產生的
    try { require("node:fs").unlinkSync(VIOLATIONS_PATH); } catch {}
  }
});

// ── Case 1：正例（違規觸發 warn） ─────────────────────────────────────────

describe("ask-user-question-enforcer", () => {
  it("Case 1：last turn 含「方案 A / 方案 B，要哪個？」且無 AskUserQuestion → 回 warn systemMessage", async () => {
    // 清空 violations，確保 count=1 → warn（不 block）
    try { require("node:fs").unlinkSync(VIOLATIONS_PATH); } catch {}

    const transcriptPath = makeTranscript(tmpDir, {
      text: "我建議兩個方案：\n方案 A：直接改 config\n方案 B：重寫模組\n要哪個？",
    });

    const handler = await loadEnforcer();
    const result = handler({ transcript_path: transcriptPath, session_id: "test-case1" });

    expect(result).not.toBeNull();
    expect(result?.decision).not.toBe("block"); // warn 不是 block
    expect(result?.systemMessage).toBeDefined();
    expect(result?.systemMessage).toContain("AskUserQuestion");
  });

  // ── Case 2：反例（正常 AskUserQuestion） ──────────────────────────────

  it("Case 2：last turn 含「方案 A / 方案 B」且有 AskUserQuestion tool_use → return null（豁免）", async () => {
    const transcriptPath = makeTranscript(tmpDir, {
      text: "方案 A 和方案 B，請選擇：",
      toolUses: [
        {
          name: "AskUserQuestion",
          input: { questions: ["要選方案 A 還是 B？"] },
        },
      ],
    });

    const handler = await loadEnforcer();
    const result = handler({ transcript_path: transcriptPath, session_id: "test-case2" });

    expect(result).toBeNull();
  });

  // ── Case 3：白名單（cross-dispatch 寫作） ─────────────────────────────

  it("Case 3：有「方案 A」但有 Bash tool_use command 含 curl cross-dispatch → return null（豁免）", async () => {
    const transcriptPath = makeTranscript(tmpDir, {
      text: "方案 A 的 cross-dispatch 已送出，要等回應。",
      toolUses: [
        {
          name: "Bash",
          input: { command: "curl -s -X POST http://127.0.0.1:3457/api/cross-dispatch -d '{...}'" },
        },
      ],
    });

    const handler = await loadEnforcer();
    const result = handler({ transcript_path: transcriptPath, session_id: "test-case3" });

    expect(result).toBeNull();
  });

  // ── Case 4：純資訊呈現（無疑問上下文） ───────────────────────────────

  it("Case 4：「Option 1: /api/foo, Option 2: /api/bar」無疑問結尾 → return null（不違規）", async () => {
    const transcriptPath = makeTranscript(tmpDir, {
      // 有 Option N 但結尾是純陳述句，無疑問詞
      text: "目前支援兩個端點：Option 1: /api/foo（穩定）, Option 2: /api/bar（beta）。已部署完成。",
    });

    const handler = await loadEnforcer();
    const result = handler({ transcript_path: transcriptPath, session_id: "test-case4" });

    expect(result).toBeNull();
  });

  // ── Case 5：自動升級 block（3+ 筆 violations） ────────────────────────

  it("Case 5：violations.jsonl 已有 3+ 筆 + 本次違規 → decision=block", async () => {
    // 預填 3 筆 violations
    const { writeFileSync } = require("node:fs");
    const existing = [
      JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", session_id: "s1", snippet: "要哪個？", tool_uses: [] }),
      JSON.stringify({ ts: "2026-01-02T00:00:00.000Z", session_id: "s2", snippet: "方案 A 還是 B？", tool_uses: [] }),
      JSON.stringify({ ts: "2026-01-03T00:00:00.000Z", session_id: "s3", snippet: "請選方案", tool_uses: [] }),
    ].join("\n") + "\n";
    mkdirSync(join(homedir(), ".claude/data"), { recursive: true });
    writeFileSync(VIOLATIONS_PATH, existing);

    const transcriptPath = makeTranscript(tmpDir, {
      text: "方案 A：改 hook，方案 B：改 rule，要哪個？你決定。",
    });

    const handler = await loadEnforcer();
    const result = handler({ transcript_path: transcriptPath, session_id: "test-case5" });

    // 本次是第 4 筆（3 + 1）→ count >= 3 → block
    expect(result).not.toBeNull();
    expect(result?.decision).toBe("block");
    expect(result?.systemMessage).toBeDefined();
    expect(result?.systemMessage).toContain("AskUserQuestion");
  });
});
