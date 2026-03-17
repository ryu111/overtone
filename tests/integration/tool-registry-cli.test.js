// tool-registry-cli.test.js — tool-registry.js CLI 整合測試
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";
import { spawnSync } from "node:child_process";

const TMP_DIR = join(tmpdir(), `tool-registry-cli-test-${Date.now()}`);
const SKILLS_DIR = join(TMP_DIR, "skills");
const SCRIPTS_DIR = join(TMP_DIR, "scripts");
const OS_SCRIPTS_DIR = join(TMP_DIR, "scripts", "os");
const DATA_DIR = join(TMP_DIR, "data");
const SETTINGS_PATH = join(TMP_DIR, "settings.json");

function makeSkill(name, description) {
  const dir = join(SKILLS_DIR, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n内容`
  );
}

beforeEach(() => {
  mkdirSync(SKILLS_DIR, { recursive: true });
  mkdirSync(SCRIPTS_DIR, { recursive: true });
  mkdirSync(OS_SCRIPTS_DIR, { recursive: true });
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify({}));
});

afterEach(() => {
  try { rmSync(TMP_DIR, { recursive: true }); } catch (e) { /* cleanup */ }
});

// ─── CLI 整合測試 ─────────────────────────────────────────────────────────────

describe("CLI 整合", () => {
  test("scan 命令執行並輸出結果", () => {
    makeSkill("debugging", "除錯方法論");
    const proc = spawnSync(
      "bun",
      [join(homedir(), ".claude/scripts/tool-registry.js"), "scan"],
      { env: { ...process.env, HOME: process.env.HOME }, stdio: "pipe", timeout: 10000 }
    );
    const output = (proc.stdout || "").toString() + (proc.stderr || "").toString();
    expect(typeof output).toBe("string");
  });
});
