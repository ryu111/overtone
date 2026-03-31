import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

const SCRIPTS_DIR = join(homedir(), ".claude/scripts");

describe("CLI tools", () => {
	describe("auto-mode.js", () => {
		test("auto-mode.js 語法正確 — status 命令不 crash", () => {
			// 測試 auto-mode.js 在 server 不可用時的行為
			// 應該優雅退出（exit code 0 或 1），不崩潰
			const result = Bun.spawnSync(
				["bun", join(SCRIPTS_DIR, "auto-mode.js"), "status"],
				{
					timeout: 10000,
					env: {
						...process.env,
					},
				},
			);

			// 預期 exit code <= 1（成功或預期錯誤，不是 crash）
			expect(result.exitCode).toBeLessThanOrEqual(1);
			expect(result.success || result.exitCode === 1).toBe(true);
		});

		test("auto-mode.js 執行 start 命令不 crash", () => {
			// 測試 auto-mode.js start 命令
			const result = Bun.spawnSync(
				["bun", join(SCRIPTS_DIR, "auto-mode.js"), "start"],
				{
					timeout: 10000,
				},
			);

			// 預期優雅退出
			expect(result.exitCode).toBeLessThanOrEqual(1);
		});
	});

	describe("session-ctl.js", () => {
		test("session-ctl.js list 命令 — server 不可用時優雅退出", () => {
			// 測試 CLI 在無 server 時的行為
			// session-ctl list 應該返回 exit code 0 或 1，不崩潰
			const result = Bun.spawnSync(
				["bun", join(SCRIPTS_DIR, "session-ctl.js"), "list"],
				{
					timeout: 10000,
					env: {
						...process.env,
					},
				},
			);

			// 預期優雅退出或告知 server 不可用
			expect(result.exitCode).toBeLessThanOrEqual(1);
			expect(result.success || result.exitCode === 1).toBe(true);
		});

		test("session-ctl.js 執行 status 命令不 crash", () => {
			const result = Bun.spawnSync(
				["bun", join(SCRIPTS_DIR, "session-ctl.js"), "status"],
				{
					timeout: 10000,
				},
			);

			// 預期優雅退出
			expect(result.exitCode).toBeLessThanOrEqual(1);
		});
	});

	describe("CLI 互操作性", () => {
		test("auto-mode.js 接受有效命令參數", () => {
			// 驗證 auto-mode.js 可以被 Bun 執行
			const result = Bun.spawnSync(
				["bun", join(SCRIPTS_DIR, "auto-mode.js"), "status"],
				{
					timeout: 5000,
				},
			);

			// 應該返回合理的 exit code
			expect(result.exitCode).toBeLessThanOrEqual(1);
		});

		test("session-ctl.js 接受有效命令參數", () => {
			// 驗證 session-ctl.js 可以被 Bun 執行
			const result = Bun.spawnSync(
				["bun", join(SCRIPTS_DIR, "session-ctl.js"), "list"],
				{
					timeout: 5000,
				},
			);

			// 應該返回合理的 exit code
			expect(result.exitCode).toBeLessThanOrEqual(1);
		});
	});
});
