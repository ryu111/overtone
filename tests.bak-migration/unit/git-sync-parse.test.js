// git-sync-parse.test.js — parseChangedFiles porcelain parsing
// 根因修 regression：舊 .slice(3) 對某些格式 (短空格 / tab) 吃掉 path 首字元
// xd-1776387738014-hmqt P3 wrapup ata/reflections.jsonl bug
import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

const { parseChangedFiles } = await import(
	join(homedir(), ".claude/scripts/git-sync.js")
);

describe("parseChangedFiles porcelain parsing", () => {
	test("標準格式「XY PATH」（?? untracked）", () => {
		const out = parseChangedFiles("?? data/reflections.jsonl");
		expect(out).toEqual(["data/reflections.jsonl"]);
	});

	test("標準格式（unstaged M）", () => {
		const out = parseChangedFiles(" M data/reflections.jsonl");
		expect(out).toEqual(["data/reflections.jsonl"]);
	});

	test("標準格式（staged A）", () => {
		const out = parseChangedFiles("A  data/reflections.jsonl");
		expect(out).toEqual(["data/reflections.jsonl"]);
	});

	test("regression (xd-1776387738014-hmqt): 不應把 data 吞成 ata", () => {
		const out = parseChangedFiles(" M data/reflections.jsonl");
		expect(out[0]).toBe("data/reflections.jsonl");
		expect(out[0].startsWith("ata/")).toBe(false);
		expect(out[0].startsWith("data/")).toBe(true);
	});

	test("regression: tab 分隔 porcelain 也能正確 parse", () => {
		// 某些 git 版本/locale 用 tab 分隔（模擬根因場景）
		const out = parseChangedFiles("?? \tdata/reflections.jsonl");
		expect(out[0]).toBe("data/reflections.jsonl");
	});

	test("rename 格式「R OLD -> NEW」取 NEW", () => {
		const out = parseChangedFiles("R  old/path.js -> new/path.js");
		expect(out).toEqual(["new/path.js"]);
	});

	test("多行", () => {
		const raw = `?? data/a.jsonl\n M src/b.js\nA  spec/c.md`;
		const out = parseChangedFiles(raw);
		expect(out).toEqual(["data/a.jsonl", "src/b.js", "spec/c.md"]);
	});

	test("空輸入回空陣列", () => {
		expect(parseChangedFiles("")).toEqual([]);
		expect(parseChangedFiles(null)).toEqual([]);
		expect(parseChangedFiles(undefined)).toEqual([]);
	});

	test("全空白行被 filter", () => {
		const out = parseChangedFiles(" \n\n");
		expect(out).toEqual([]);
	});
});
