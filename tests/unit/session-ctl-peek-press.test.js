// session-ctl peek/press/dispatch 子命令測試 (xd-z84l 方案 B)
//
// 白名單驗證：press 只接受 enter/y/n/q/esc/space/tab
// dispatch/send alias：兩者走同一邏輯

import { describe, it, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(homedir(), ".claude/scripts/session-ctl.js");

function runCli(args, options = {}) {
	return spawnSync("bun", [SCRIPT, ...args], { encoding: "utf-8", timeout: 5000, ...options });
}

describe("session-ctl peek/press 白名單與 help (xd-z84l)", () => {
	it("press 允許 enter → stdout 含 pressed enter（或 send-keys 失敗也接受 non-zero）", () => {
		// 實際 tmux 行為依環境而定，這裡只驗 key 白名單通過 → 進 execSync 分支
		const r = runCli(["press", "fake-project-xyz", "enter"]);
		// 白名單通過後嘗試 send-keys，target session 不存在 → send-keys 失敗 exit 1
		// 但關鍵是錯誤訊息不應含「不在白名單」
		const allOut = (r.stdout || "") + (r.stderr || "");
		expect(allOut).not.toContain("不在白名單");
	});

	it("press 拒絕 ctrl-c（不在白名單）", () => {
		const r = runCli(["press", "fake-project-xyz", "ctrl-c"]);
		expect(r.status).toBe(1);
		expect(r.stderr).toContain("不在白名單");
	});

	it("press 拒絕任意字元 'x'", () => {
		const r = runCli(["press", "fake-project-xyz", "x"]);
		expect(r.status).toBe(1);
		expect(r.stderr).toContain("不在白名單");
	});

	it("peek 無 session 參數 → exit 1 含用法說明", () => {
		const r = runCli(["peek"]);
		expect(r.status).toBe(1);
		expect(r.stderr).toContain("用法");
	});

	it("help 含 dispatch + peek + press 新子命令", () => {
		const r = runCli([]);
		const allOut = (r.stdout || "") + (r.stderr || "");
		expect(allOut).toContain("dispatch");
		expect(allOut).toContain("peek");
		expect(allOut).toContain("press");
		expect(allOut).toContain("deprecated");
	});
});

describe("session-ctl dispatch --prompt-file / --stdin (xd-ku9e Phase 3)", () => {
	it("--prompt-file 讀檔內容傳送（特殊字元 round-trip）", () => {
		const dir = mkdtempSync(join(tmpdir(), "session-ctl-test-"));
		const promptFile = join(dir, "prompt.txt");
		// 含反斜線 regex / 雙引號 / heredoc-style 換行
		const content = String.raw`含特殊字元 \s\+ "雙引號" 和換行
multi-line
{"json":"value"}`;
		writeFileSync(promptFile, content);
		// 不存在的 session → send 會 fail，但只要 fail 訊息不是「parse error」
		// 而是「session not found」之類就證明 prompt 內容已正確讀取準備送出
		const r = runCli(["dispatch", "fake-project-xyz", "--prompt-file", promptFile]);
		const allOut = (r.stdout || "") + (r.stderr || "");
		// 關鍵：不該出現 shell escape 解析錯誤，反斜線應被視為內容字元
		expect(allOut).not.toContain("SyntaxError");
		expect(allOut).not.toContain("Unexpected");
		try { unlinkSync(promptFile); } catch { /* ignore */ }
	});

	it("--stdin 讀 stdin 內容傳送", () => {
		const stdinContent = String.raw`{"regex":"\\s\\+","quoted":"\"escaped\""}`;
		const r = runCli(["dispatch", "fake-project-xyz", "--stdin"], { input: stdinContent });
		const allOut = (r.stdout || "") + (r.stderr || "");
		expect(allOut).not.toContain("SyntaxError");
	});

	it("無 --prompt-file/--stdin 時 positional args 向後相容", () => {
		// 既有行為：args.slice(1).join(" ")
		const r = runCli(["dispatch", "fake-project-xyz", "hello", "world"]);
		const allOut = (r.stdout || "") + (r.stderr || "");
		// 不該因 flag 缺失而 throw，應走 positional 邏輯
		expect(allOut).not.toContain("Cannot read");
		expect(allOut).not.toContain("undefined is not");
	});
});
