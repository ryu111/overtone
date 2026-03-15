import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { execSync } from 'child_process';
import {
  existsSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  mkdtempSync,
  rmSync,
} from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { randomUUID } from 'crypto';

// ─── 測試用 tmpdir 工廠 ───────────────────────────────────────────────────────

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), 'maintainer-test-'));
}

function initGitRepo(dir) {
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });
}

// ─── 從 maintainer.js 提取的純函式（複製邏輯，不 import 本體） ─────────────────

function git(args, cwd) {
  try {
    return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 15000 }).trim();
  } catch (e) {
    return null;
  }
}

function hasRemote(cwd) {
  const remotes = git('remote -v', cwd);
  return remotes && remotes.length > 0;
}

async function askLocalModel(prompt, fallback = null, urlOverride = null) {
  const LOCAL_MODEL_URL = urlOverride || 'http://localhost:8000/v1/chat/completions';
  try {
    const res = await fetch(LOCAL_MODEL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mlx-community/Qwen3.5-35B-A3B-4bit',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || fallback;
  } catch (e) {
    return fallback;
  }
}

function sanitizeCommitMsg(msg, fallback) {
  return (msg || fallback)
    .replace(/\n/g, ' ')
    .replace(/"/g, "'")
    .replace(/`/g, "'")
    .trim();
}

// 數字同步邏輯（從 organizeFiles 提取）
function syncNumbers(content, actualRules, actualSkills) {
  const rulesPattern = /Rules\s+(\d+)\s+個/g;
  const skillsPattern = /Skills\s+(\d+)\s+個/g;
  let updated = false;
  let newContent = content;

  newContent = newContent.replace(rulesPattern, (match, num) => {
    if (parseInt(num) !== actualRules) {
      updated = true;
      return match.replace(num, String(actualRules));
    }
    return match;
  });

  newContent = newContent.replace(skillsPattern, (match, num) => {
    if (parseInt(num) !== actualSkills) {
      updated = true;
      return match.replace(num, String(actualSkills));
    }
    return match;
  });

  return { newContent, updated };
}

// commitAndPush 核心邏輯（無網路呼叫版本，用於測試）
async function commitAndPushLocal(repoDir, _repoName, mockCommitMsg) {
  // git add -A
  const addResult = git('add -A', repoDir);
  if (addResult === null) return { skipped: true, reason: 'add-failed' };

  // 確認 staged 有內容
  const staged = git('diff --cached --stat', repoDir);
  if (!staged) return { skipped: true, reason: 'no-staged' };

  // 使用傳入的 commit message（跳過本地模型）
  const today = new Date().toISOString().slice(0, 10);
  const fallbackMsg = `chore(maintainer): auto-sync ${today}`;
  const commitMsg = sanitizeCommitMsg(mockCommitMsg || fallbackMsg, fallbackMsg);

  const tmpMsgFile = join(tmpdir(), `maintainer-commit-test-${randomUUID()}.txt`);
  writeFileSync(tmpMsgFile, commitMsg);

  const commitResult = git(`commit -F ${tmpMsgFile}`, repoDir);
  try { unlinkSync(tmpMsgFile); } catch {}

  if (commitResult === null) return { skipped: true, reason: 'commit-failed' };
  return { skipped: false, commitMsg };
}

// ─── 1. 自我分離機制 ──────────────────────────────────────────────────────────

describe('自我分離機制', () => {
  const MAINTAINER_SCRIPT = join(homedir(), '.claude/scripts/maintainer.js');

  test('不設 MAINTAINER_BG 時，process 立即 exit(0)', () => {
    // 執行時不設 MAINTAINER_BG — 子進程應立即退出（exit code 0）
    let exitCode = 0;
    try {
      execSync(`bun ${MAINTAINER_SCRIPT}`, {
        encoding: 'utf-8',
        timeout: 5000,
        env: { ...process.env, MAINTAINER_BG: '' },
      });
    } catch (e) {
      exitCode = e.status ?? 1;
    }
    expect(exitCode).toBe(0);
  });

  test('不設 MAINTAINER_BG 時，父進程在 5 秒內結束（自我分離不阻塞）', () => {
    const start = Date.now();
    try {
      execSync(`bun ${MAINTAINER_SCRIPT}`, {
        encoding: 'utf-8',
        timeout: 5000,
        env: { ...process.env, MAINTAINER_BG: '' },
      });
    } catch {}
    const elapsed = Date.now() - start;
    // 自我分離後父進程應在 3 秒內結束（spawn 子進程後立即 exit）
    expect(elapsed).toBeLessThan(3000);
  });
});

// ─── 2. lockfile 防重複 ───────────────────────────────────────────────────────

describe('lockfile 防重複', () => {
  const LOCK = `/tmp/maintainer-test-lock-${randomUUID()}.lock`;

  afterEach(() => {
    try { unlinkSync(LOCK); } catch {}
  });

  test('lock 不存在時，可正常寫入 PID', () => {
    expect(existsSync(LOCK)).toBe(false);
    writeFileSync(LOCK, String(process.pid));
    expect(existsSync(LOCK)).toBe(true);
    const content = readFileSync(LOCK, 'utf-8').trim();
    expect(content).toBe(String(process.pid));
  });

  test('lock 存在時，PID 可被正確讀取', () => {
    const fakePid = '99999';
    writeFileSync(LOCK, fakePid);
    const lockPid = readFileSync(LOCK, 'utf-8').trim();
    expect(lockPid).toBe(fakePid);
    expect(lockPid).not.toBe(String(process.pid)); // 非當前 pid → 應跳過
  });

  test('lock 的 PID 是當前 process 時才移除', () => {
    writeFileSync(LOCK, String(process.pid));
    // removeLock 邏輯
    const lockPid = readFileSync(LOCK, 'utf-8').trim();
    if (lockPid === String(process.pid)) {
      unlinkSync(LOCK);
    }
    expect(existsSync(LOCK)).toBe(false);
  });

  test('lock 的 PID 不是當前 process 時不移除', () => {
    const otherPid = '12345';
    writeFileSync(LOCK, otherPid);
    // removeLock 邏輯
    const lockPid = readFileSync(LOCK, 'utf-8').trim();
    if (lockPid === String(process.pid)) {
      unlinkSync(LOCK);
    }
    // lock 不應被移除
    expect(existsSync(LOCK)).toBe(true);
  });
});

// ─── 3. askLocalModel fallback ────────────────────────────────────────────────

describe('askLocalModel fallback', () => {
  test('模型不可用時（連線失敗）回傳 fallback 值', async () => {
    // 使用不存在的 port
    const result = await askLocalModel('test', 'fallback-value', 'http://localhost:19999/v1/chat/completions');
    expect(result).toBe('fallback-value');
  });

  test('fallback 預設值為 null', async () => {
    const result = await askLocalModel('test', null, 'http://localhost:19999/v1/chat/completions');
    expect(result).toBeNull();
  });

  test('HTTP 非 200 狀態時回傳 fallback', async () => {
    // 用本地 bun 起一個快速的 mock server（回傳 500）
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response('error', { status: 500 });
      },
    });

    try {
      const result = await askLocalModel('test', 'http-error-fallback', `http://localhost:${server.port}/v1/chat/completions`);
      expect(result).toBe('http-error-fallback');
    } finally {
      server.stop();
    }
  });

  test('timeout 後回傳 fallback', async () => {
    // 起一個永不回應的 server
    const server = Bun.serve({
      port: 0,
      fetch() {
        // 故意不回應
        return new Promise(() => {});
      },
    });

    try {
      const result = await (async () => {
        try {
          const res = await fetch(`http://localhost:${server.port}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'test', messages: [], max_tokens: 1 }),
            signal: AbortSignal.timeout(200), // 極短 timeout
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          return data.choices?.[0]?.message?.content?.trim() || 'fallback';
        } catch (e) {
          return 'timeout-fallback';
        }
      })();
      expect(result).toBe('timeout-fallback');
    } finally {
      server.stop();
    }
  });
});

// ─── 4. 數字同步邏輯 ──────────────────────────────────────────────────────────

describe('數字同步邏輯', () => {
  test('roadmap 含 "Rules 10 個"，實際為 14 → 替換為 14', () => {
    const content = '## 元件統計\n- Rules 10 個\n- Skills 5 個\n';
    const { newContent, updated } = syncNumbers(content, 14, 5);
    expect(updated).toBe(true);
    expect(newContent).toContain('Rules 14 個');
    expect(newContent).not.toContain('Rules 10 個');
  });

  test('數字相符時不修改', () => {
    const content = '- Rules 14 個\n- Skills 7 個\n';
    const { newContent, updated } = syncNumbers(content, 14, 7);
    expect(updated).toBe(false);
    expect(newContent).toBe(content);
  });

  test('Rules 正確但 Skills 需更新', () => {
    const content = '- Rules 14 個\n- Skills 3 個\n';
    const { newContent, updated } = syncNumbers(content, 14, 8);
    expect(updated).toBe(true);
    expect(newContent).toContain('Skills 8 個');
    expect(newContent).toContain('Rules 14 個');
  });

  test('同時更新兩個數字', () => {
    const content = '- Rules 5 個\n- Skills 3 個\n';
    const { newContent, updated } = syncNumbers(content, 14, 8);
    expect(updated).toBe(true);
    expect(newContent).toContain('Rules 14 個');
    expect(newContent).toContain('Skills 8 個');
  });

  test('無匹配 pattern 時不更新', () => {
    const content = '## roadmap\n無任何 Rules 或 Skills 計數';
    const { newContent, updated } = syncNumbers(content, 14, 8);
    expect(updated).toBe(false);
    expect(newContent).toBe(content);
  });

  test('spec/index.md 同步 — 內容含 pattern 時同樣被替換', () => {
    const indexContent = '- Rules 10 個\n- Skills 5 個\n';
    const { newContent, updated } = syncNumbers(indexContent, 14, 5);
    expect(updated).toBe(true);
    expect(newContent).toContain('Rules 14 個');
  });
});

// ─── 5. git() helper ─────────────────────────────────────────────────────────

describe('git() helper', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    initGitRepo(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('合法 git 命令回傳字串結果', () => {
    const result = git('status --short', tmpDir);
    expect(typeof result).toBe('string');
  });

  test('非 git 目錄回傳 null', () => {
    const nonGitDir = makeTmpDir();
    try {
      const result = git('status', nonGitDir);
      // git status 在非 git 目錄會 throw — 應回傳 null
      expect(result).toBeNull();
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });

  test('無效 git 命令回傳 null', () => {
    const result = git('不存在的命令', tmpDir);
    expect(result).toBeNull();
  });

  test('git status 在空 repo 回傳空字串', () => {
    const result = git('status --short', tmpDir);
    expect(result).toBe('');
  });
});

// ─── 6. hasRemote() ───────────────────────────────────────────────────────────

describe('hasRemote()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    initGitRepo(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('無 remote 的 repo 回傳 falsy', () => {
    const result = hasRemote(tmpDir);
    // git remote -v 在無 remote 時回傳空字串，hasRemote 回傳 falsy（"" 或 false）
    expect(result).toBeFalsy();
  });

  test('有 remote 的 repo 回傳 true', () => {
    execSync('git remote add origin https://github.com/test/test.git', { cwd: tmpDir });
    const result = hasRemote(tmpDir);
    expect(result).toBe(true);
  });
});

// ─── 7. commit message 清理 ───────────────────────────────────────────────────

describe('commit message 清理', () => {
  const today = new Date().toISOString().slice(0, 10);
  const fallback = `chore(maintainer): auto-sync ${today}`;

  test('換行字元被替換為空格', () => {
    const msg = sanitizeCommitMsg('feat(scope): 第一行\n第二行', fallback);
    expect(msg).not.toContain('\n');
    expect(msg).toContain('feat(scope): 第一行 第二行');
  });

  test('雙引號被替換為單引號', () => {
    const msg = sanitizeCommitMsg('feat: 說明"含引號"', fallback);
    expect(msg).not.toContain('"');
    expect(msg).toContain("'含引號'");
  });

  test('反引號被替換為單引號', () => {
    const msg = sanitizeCommitMsg('feat: 說明`含反引號`', fallback);
    expect(msg).not.toContain('`');
    expect(msg).toContain("'含反引號'");
  });

  test('null 輸入回傳 fallback', () => {
    const msg = sanitizeCommitMsg(null, fallback);
    expect(msg).toBe(fallback);
  });

  test('空字串輸入回傳 fallback（trim 後）', () => {
    const msg = sanitizeCommitMsg('   ', fallback);
    // trim 後是空字串，但 sanitizeCommitMsg 只 trim，不替換空字串為 fallback
    // 實際 maintainer.js 有額外 `if (!commitMsg) commitMsg = fallbackMsg`
    // 此處測試 sanitize 函式本身
    expect(msg).toBe('');
  });

  test('fallback message 格式正確', () => {
    expect(fallback).toMatch(/^chore\(maintainer\): auto-sync \d{4}-\d{2}-\d{2}$/);
  });
});

// ─── 8. commitAndPush 流程 ────────────────────────────────────────────────────

describe('commitAndPush 流程', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    initGitRepo(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('無 staged 變更時跳過 commit', async () => {
    // 空 repo，沒有任何檔案
    const result = await commitAndPushLocal(tmpDir, 'test', null);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no-staged');
  });

  test('有 staged 變更時成功 commit', async () => {
    // 建立一個測試檔案
    writeFileSync(join(tmpDir, 'test.md'), '# Test\n');
    const result = await commitAndPushLocal(tmpDir, 'test', 'feat(test): 測試 commit');
    expect(result.skipped).toBe(false);
    expect(result.commitMsg).toBe('feat(test): 測試 commit');
  });

  test('commit message 含特殊字元時被清理', async () => {
    writeFileSync(join(tmpDir, 'test.md'), '# Test\n');
    const dirtyMsg = 'feat(test): 說明\n換行"引號"`反引號`';
    const result = await commitAndPushLocal(tmpDir, 'test', dirtyMsg);
    expect(result.skipped).toBe(false);
    expect(result.commitMsg).not.toContain('\n');
    expect(result.commitMsg).not.toContain('"');
    expect(result.commitMsg).not.toContain('`');
  });

  test('無 commit message 時使用 fallback 格式', async () => {
    writeFileSync(join(tmpDir, 'fallback.md'), '# Fallback\n');
    const result = await commitAndPushLocal(tmpDir, 'test', null);
    expect(result.skipped).toBe(false);
    expect(result.commitMsg).toMatch(/^chore\(maintainer\): auto-sync \d{4}-\d{2}-\d{2}$/);
  });

  test('第二次 commit 前無新 staged 變更時跳過', async () => {
    // 第一次 commit
    writeFileSync(join(tmpDir, 'first.md'), '# First\n');
    await commitAndPushLocal(tmpDir, 'test', 'feat(test): 第一次');

    // 不加新檔案，再次嘗試
    const result = await commitAndPushLocal(tmpDir, 'test', 'feat(test): 第二次');
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no-staged');
  });
});
