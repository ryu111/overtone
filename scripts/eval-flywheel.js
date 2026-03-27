/**
 * Eval Flywheel — 從真實使用中自動補充 eval case set
 *
 * 用法：
 *   bun scripts/eval-flywheel.js guard   # 從 hook-errors.jsonl 提取 guard FP 案例
 *   bun scripts/eval-flywheel.js skill   # 從 skill-triggers.jsonl 提取觸發統計
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const HOME = homedir();
const HOOK_ERRORS_PATH = join(tmpdir(), 'hook-errors.jsonl');
const SKILL_TRIGGERS_PATH = join(HOME, '.claude/data/skill-triggers.jsonl');
const GUARD_CASES_PATH = join(HOME, 'projects/nova-brain/tests/evals/guard/cases.json');
const SKILL_CASES_DIR = join(HOME, 'projects/nova-brain/tests/evals/skill-trigger');

// ─── 通用工具 ───────────────────────────────────────────────────────────────

/**
 * 安全讀取 JSONL，容錯不存在或損壞行
 */
function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

/**
 * 原子寫入 JSON（寫 .tmp 再 rename）
 */
function writeJsonAtomic(filePath, data) {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, filePath);
}

// ─── Guard Flywheel ──────────────────────────────────────────────────────────

/**
 * 判斷一個被阻擋的命令是否為 FP（誤判）。
 *
 * FP 案例特徵：命令本身是安全的（grep/echo/commit msg 等），
 * 但因為包含危險關鍵字被誤攔截。
 *
 * 返回 { isFP: boolean, reason: string }
 */
function classifyFP(command) {
  // grep/rg 搜尋含危險關鍵字 → FP（搜尋行為，非執行）
  if (/^(?:grep|rg)\b.*['"]/.test(command)) {
    return { isFP: true, reason: 'grep/rg 搜尋含危險關鍵字' };
  }
  if (/\bgrep\b.+(?:killall|eval|rm\s+-rf)\b/.test(command)) {
    return { isFP: true, reason: 'grep 搜尋危險詞' };
  }

  // echo 到 stdout 或重定向 → FP（不執行，只印出）
  if (/^echo\s+['"]/.test(command) && !/\|\s*(ba)?sh/.test(command)) {
    return { isFP: true, reason: 'echo 含危險詞但不執行' };
  }

  // git commit -m 含危險詞 → FP（只是 message 字串）
  if (/\bgit\s+commit\b.*-m\s+['"]/.test(command)) {
    return { isFP: true, reason: 'git commit message 含危險關鍵字' };
  }

  // cat + pipe grep → FP（讀取分析，非執行）
  if (/^cat\b.*\|\s*grep\b/.test(command) && !/\|\s*(ba)?sh/.test(command)) {
    return { isFP: true, reason: 'cat | grep 分析日誌' };
  }

  // heredoc 含危險詞 → FP
  if (/<<\s*['"]?EOF/.test(command)) {
    return { isFP: true, reason: 'heredoc 含危險詞' };
  }

  // ripgrep 搜尋 → FP
  if (/^rg\b/.test(command) && !/\|\s*(ba)?sh/.test(command)) {
    return { isFP: true, reason: 'ripgrep 搜尋含危險詞' };
  }

  return { isFP: false, reason: '' };
}

/**
 * Guard flywheel 主邏輯
 *
 * 從 hook-errors.jsonl 提取 PreToolUse:Bash 事件中被阻擋的命令，
 * 判斷是否為 FP，追加到 guard/cases.json。
 */
async function runGuardFlywheel() {
  console.log('[eval-flywheel:guard] 開始分析...');
  console.log(`  hook-errors 路徑: ${HOOK_ERRORS_PATH}`);

  const errors = readJsonl(HOOK_ERRORS_PATH);
  console.log(`  讀取到 ${errors.length} 條記錄`);

  // 篩選 PreToolUse:Bash 且包含 guard 阻擋記錄
  // hook-errors.jsonl 記錄 hook 系統錯誤（非 block 事件）
  // 格式：{ ts, event, error, phase, command? }
  const bashEvents = errors.filter(e =>
    e.event === 'PreToolUse:Bash' ||
    (e.event && e.event.includes('Bash') && e.command)
  );

  // 也嘗試提取 error 字串中包含的命令（若日誌格式包含命令）
  const blockedEvents = errors.filter(e =>
    typeof e.error === 'string' && e.error.includes('危險命令被阻擋') && e.command
  );

  const candidateEvents = [...new Map(
    [...bashEvents, ...blockedEvents].map(e => [e.command || e.error, e])
  ).values()].filter(e => e.command);

  console.log(`  PreToolUse:Bash / 阻擋事件: ${candidateEvents.length} 條`);

  // 讀取現有 cases.json
  if (!existsSync(GUARD_CASES_PATH)) {
    console.log(`  [錯誤] cases.json 不存在: ${GUARD_CASES_PATH}`);
    process.exit(1);
  }

  const casesData = JSON.parse(readFileSync(GUARD_CASES_PATH, 'utf-8'));
  const existingCommands = new Set(casesData.cases.map(c => c.command));

  let added = 0;
  const fpCandidates = [];
  const tpCandidates = [];

  for (const event of candidateEvents) {
    const cmd = event.command;
    if (existingCommands.has(cmd)) continue;

    const { isFP, reason } = classifyFP(cmd);
    if (isFP) {
      fpCandidates.push({ command: cmd, reason });
    } else {
      tpCandidates.push({ command: cmd });
    }
  }

  // 追加 FP 候選（應放行的案例）
  for (const { command, reason } of fpCandidates) {
    if (existingCommands.has(command)) continue;
    casesData.cases.push({
      command,
      expected: 'negative',
      label: `[flywheel-FP] ${reason}: ${command.slice(0, 60)}`,
    });
    existingCommands.add(command);
    added++;
    console.log(`  + FP case: ${command.slice(0, 80)}`);
  }

  // 追加 TP 候選（應阻擋的案例，flywheel 確認真正危險）
  for (const { command } of tpCandidates) {
    if (existingCommands.has(command)) continue;
    casesData.cases.push({
      command,
      expected: 'positive',
      label: `[flywheel-TP] ${command.slice(0, 60)}`,
    });
    existingCommands.add(command);
    added++;
    console.log(`  + TP case: ${command.slice(0, 80)}`);
  }

  if (added > 0) {
    writeJsonAtomic(GUARD_CASES_PATH, casesData);
    console.log(`  已追加 ${added} 個新 case 到 guard/cases.json`);
  } else {
    console.log('  無新 case（全部重複或無資料）');
  }

  // 統計報告
  const total = casesData.cases.length;
  const positives = casesData.cases.filter(c => c.expected === 'positive').length;
  const negatives = casesData.cases.filter(c => c.expected === 'negative').length;
  const flywheelCases = casesData.cases.filter(c => c.label?.startsWith('[flywheel')).length;

  console.log(`\n  Guard cases 統計:`);
  console.log(`    總計:     ${total} cases`);
  console.log(`    positive: ${positives} (應阻擋)`);
  console.log(`    negative: ${negatives} (應放行)`);
  console.log(`    flywheel: ${flywheelCases} (自動加入)`);

  // 執行 guard eval 確認 F1 變化
  if (added > 0) {
    console.log('\n  執行 guard eval 確認影響...');
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync('bun', ['tests/evals/guard/run.js'], {
      cwd: join(HOME, 'projects/nova-brain'),
      encoding: 'utf-8',
      env: { ...process.env },
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }

  console.log('\n[eval-flywheel:guard] 完成');
}

// ─── Skill Flywheel ──────────────────────────────────────────────────────────

/**
 * 統計 skill 觸發頻率
 * 返回 Map<skillName, { count, tasks: string[] }>
 */
function aggregateSkillStats(triggers) {
  const stats = new Map();

  for (const entry of triggers) {
    const skills = Array.isArray(entry.skills) ? entry.skills : [];
    const task = entry.taskSnippet || '';

    for (const skill of skills) {
      if (!stats.has(skill)) {
        stats.set(skill, { count: 0, tasks: [] });
      }
      const s = stats.get(skill);
      s.count++;
      if (task && s.tasks.length < 10 && !s.tasks.includes(task)) {
        s.tasks.push(task);
      }
    }
  }

  return stats;
}

/**
 * 從 taskSnippet 生成 eval case
 * 基於高頻 skill 和真實任務樣本
 */
function generateSkillCases(_skillName, tasks) {
  const cases = [];

  for (const task of tasks) {
    if (!task || task.length < 5) continue;

    cases.push({
      task,
      expected: 'positive',
      label: `[flywheel] ${task.slice(0, 40)}`,
    });
  }

  return cases;
}

/**
 * 讀取或初始化 skill cases.json
 * 返回現有的 cases 資料，如果不存在則建立基本結構
 */
function loadSkillCases(skillName) {
  const casesPath = join(SKILL_CASES_DIR, 'cases.json');
  if (!existsSync(casesPath)) {
    // 找對應 skill 的 SKILL.md 取得 description
    const skillPath = join(HOME, `.claude/skills/${skillName}/SKILL.md`);
    let description = `${skillName} 知識域`;
    if (existsSync(skillPath)) {
      const content = readFileSync(skillPath, 'utf-8');
      const match = content.match(/^#\s+(.+)$/m);
      if (match) description = match[1];
    }

    return {
      name: `Skill 觸發精準度 — ${skillName}`,
      description: `測量 ${skillName} skill 的觸發精準度`,
      skill_name: skillName,
      skill_description: description,
      cases: [],
    };
  }
  return JSON.parse(readFileSync(casesPath, 'utf-8'));
}

/**
 * Skill flywheel 主邏輯
 *
 * 1. 讀取 skill-triggers.jsonl 統計觸發頻率
 * 2. 輸出統計報告
 * 3. 為高頻 skill 自動生成 eval cases
 */
async function runSkillFlywheel() {
  console.log('[eval-flywheel:skill] 開始分析...');
  console.log(`  skill-triggers 路徑: ${SKILL_TRIGGERS_PATH}`);

  const triggers = readJsonl(SKILL_TRIGGERS_PATH);
  console.log(`  讀取到 ${triggers.length} 條觸發記錄`);

  if (triggers.length === 0) {
    console.log('  無觸發記錄，跳過分析');
    console.log('\n[eval-flywheel:skill] 完成');
    return;
  }

  const stats = aggregateSkillStats(triggers);

  // 按觸發頻率排序
  const sorted = [...stats.entries()].sort((a, b) => b[1].count - a[1].count);

  // 統計報告
  console.log('\n  Skill 觸發統計：');
  console.log(`  ${'Skill'.padEnd(30)} ${'次數'.padStart(6)}  ${'任務樣本'}`);
  console.log(`  ${'─'.repeat(70)}`);

  const neverTriggered = [];
  const highFrequency = [];

  for (const [skill, { count, tasks }] of sorted) {
    const sampleTask = tasks[0] ? tasks[0].slice(0, 35) : '(無)';
    console.log(`  ${skill.padEnd(30)} ${String(count).padStart(6)}  ${sampleTask}`);
    if (count >= 3) highFrequency.push({ skill, count, tasks });
  }

  // 找出從未被載入的 skill（有 SKILL.md 但無觸發）
  const allSkills = [];
  try {
    const { readdirSync } = await import('node:fs');
    const skillsDir = join(HOME, '.claude/skills');
    allSkills.push(...readdirSync(skillsDir).filter(f => {
      return existsSync(join(skillsDir, f, 'SKILL.md'));
    }));
  } catch { /* 目錄不存在或無法讀取 */ }

  for (const skill of allSkills) {
    if (!stats.has(skill)) {
      neverTriggered.push(skill);
    }
  }

  if (neverTriggered.length > 0) {
    console.log(`\n  從未觸發的 skill (${neverTriggered.length} 個)：`);
    for (const skill of neverTriggered) {
      console.log(`    - ${skill}`);
    }
  }

  // 為高頻 skill 補充 eval cases
  console.log(`\n  為高頻 skill 補充 eval cases（觸發次數 >= 3）...`);

  const currentSkillCases = loadSkillCases('commit-convention');
  const existingCasesPath = join(SKILL_CASES_DIR, 'cases.json');
  const existingData = existsSync(existingCasesPath)
    ? JSON.parse(readFileSync(existingCasesPath, 'utf-8'))
    : currentSkillCases;

  // 找 skill-trigger cases 對應的 skill（目前只有 commit-convention）
  const targetSkill = existingData.skill_name || 'commit-convention';
  const targetStats = stats.get(targetSkill);

  let addedCases = 0;

  if (targetStats) {
    const existingTasks = new Set(existingData.cases.map(c => c.task));
    const newCases = generateSkillCases(targetSkill, targetStats.tasks)
      .filter(c => !existingTasks.has(c.task));

    for (const c of newCases) {
      existingData.cases.push(c);
      addedCases++;
      console.log(`  + case [${targetSkill}]: ${c.task.slice(0, 60)}`);
    }

    if (addedCases > 0) {
      writeJsonAtomic(existingCasesPath, existingData);
      console.log(`  已追加 ${addedCases} 個新 case 到 skill-trigger/cases.json`);
    } else {
      console.log(`  [${targetSkill}] 無新 case（全部重複或無資料）`);
    }
  }

  // 總結
  const totalTriggers = triggers.length;
  const uniqueSkills = stats.size;
  console.log(`\n  摘要：`);
  console.log(`    總觸發次數:   ${totalTriggers} 次`);
  console.log(`    唯一 skills:  ${uniqueSkills} 個`);
  console.log(`    高頻 skills:  ${highFrequency.length} 個（>= 3 次）`);
  console.log(`    從未觸發:     ${neverTriggered.length} 個`);
  console.log(`    自動新增 cases: ${addedCases} 個`);

  console.log('\n[eval-flywheel:skill] 完成');
}

// ─── CLI 入口 ────────────────────────────────────────────────────────────────

export function parseCLI(args) {
  const cmd = args[0];
  if (!cmd) return { error: '用法: bun scripts/eval-flywheel.js <guard|skill>' };
  if (cmd !== 'guard' && cmd !== 'skill') {
    return { error: `未知子命令: ${cmd}。支援: guard, skill` };
  }
  return { command: cmd };
}

if (import.meta.main) {
  const parsed = parseCLI(process.argv.slice(2));
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }

  try {
    if (parsed.command === 'guard') {
      await runGuardFlywheel();
    } else {
      await runSkillFlywheel();
    }
  } catch (e) {
    console.error('[eval-flywheel] 錯誤:', e.message);
    process.exit(1);
  }
}
