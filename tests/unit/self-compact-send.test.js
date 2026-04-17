// self-compact-send.test.js — Bug 1 regression
// xd-1776393999624-cyg7：/compact 不應附 preserve/discard args（Claude Code 讀 CLAUDE.md + PreCompact hook 產 handoff）
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SELF_COMPACT = join(homedir(), ".claude/scripts/self-compact.js");

describe("self-compact /compact 純指令", () => {
	test("regression Bug 1: /compact 不再附 compactArgs", () => {
		const src = readFileSync(SELF_COMPACT, "utf-8");
		// 反 regression：確保 send("/compact " + compactArgs) 不存在
		expect(src).not.toMatch(/send\s*\(\s*["']\/compact\s+["']\s*\+\s*compactArgs/);
	});

	test("實際 send 呼叫是純 /compact", () => {
		const src = readFileSync(SELF_COMPACT, "utf-8");
		expect(src).toMatch(/await\s+send\s*\(\s*["']\/compact["']\s*\)/);
	});

	test("xd-1776393999624-cyg7 標註存在（溯源）", () => {
		const src = readFileSync(SELF_COMPACT, "utf-8");
		expect(src).toContain("xd-1776393999624-cyg7");
	});
});
