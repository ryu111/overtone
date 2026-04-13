// session-ctl peek/press/dispatch 子命令測試 (xd-z84l 方案 B)
//
// 白名單驗證：press 只接受 enter/y/n/q/esc/space/tab
// dispatch/send alias：兩者走同一邏輯

import { describe, it, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(homedir(), ".claude/scripts/session-ctl.js");

function runCli(args) {
	return spawnSync("bun", [SCRIPT, ...args], { encoding: "utf-8", timeout: 5000 });
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
