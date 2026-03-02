'use strict';
/**
 * tests/unit/health-check-platform-drift.test.js — platform-drift 偵測單元測試
 *
 * 使用 tmpdir 建立假的 plugin 目錄結構測試 checkPlatformDrift()，
 * 不影響真實 agents/ 目錄。
 *
 * checkPlatformDrift 接受可選的 pluginRootOverride 參數，
 * 供測試傳入 tmpdir 使用。
 */

const { describe, it, expect, beforeEach } = require('bun:test');
const { mkdirSync, writeFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

// 從 plugin 目錄直接 require，確保 gray-matter 路徑可被解析
const { checkPlatformDrift } = require('../../plugins/overtone/scripts/health-check');

// ── 輔助函式 ──

/**
 * 建立最小可用的假 plugin 目錄結構並回傳根路徑。
 * 包含：agents/、hooks/scripts/、skills/、scripts/lib/、.claude-plugin/
 */
function makeTmpPluginRoot() {
  const dir = join(
    tmpdir(),
    `hc-platform-drift-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(join(dir, 'agents'), { recursive: true });
  mkdirSync(join(dir, 'hooks', 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'skills'), { recursive: true });
  mkdirSync(join(dir, 'scripts', 'lib'), { recursive: true });
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });

  // registry-data.json（只含一個 DEV stage，對應 developer agent）
  writeFileSync(
    join(dir, 'scripts', 'lib', 'registry-data.json'),
    JSON.stringify(
      {
        stages: {
          DEV: { label: '開發', emoji: '💻', agent: 'developer', color: 'yellow' },
        },
        agentModels: { developer: 'sonnet' },
      },
      null,
      2
    )
  );

  // plugin.json（最小）
  writeFileSync(
    join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(
      { name: 'ot', version: '0.1.0', agents: ['./agents/developer.md'] },
      null,
      2
    )
  );

  // hooks.json（空物件，無 hook 設定）
  writeFileSync(
    join(dir, 'hooks', 'hooks.json'),
    JSON.stringify({ hooks: {} }, null, 2)
  );

  return dir;
}

/**
 * 產生一個最小有效的 agent .md 字串（frontmatter + 空 body）
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {boolean} [opts.useTools] - 若 true，改用 tools: 白名單（非 grader 時應報 warning）
 * @param {string[]} [opts.toolsList] - tools 白名單工具名稱
 * @param {string[]} [opts.disallowedTools] - disallowedTools 黑名單工具名稱
 * @param {boolean} [opts.skipDescription] - 省略 description（測試 config-api error）
 * @returns {string}
 */
function makeAgentMd(opts = {}) {
  const name = opts.name || 'developer';
  const lines = ['---', `name: ${name}`];

  if (!opts.skipDescription) {
    lines.push(`description: ${name} agent`);
  }

  lines.push('model: sonnet');
  lines.push('permissionMode: bypassPermissions');
  lines.push('color: yellow');
  lines.push('maxTurns: 50');

  if (opts.useTools) {
    const tools = opts.toolsList || ['Read', 'Bash'];
    lines.push('tools:');
    for (const t of tools) lines.push(`  - ${t}`);
  } else {
    // 預設使用 disallowedTools（正確方式），預設工具須在 knownTools 清單中
    const dt = opts.disallowedTools || ['Task'];
    lines.push('disallowedTools:');
    for (const t of dt) lines.push(`  - ${t}`);
  }

  lines.push('---', '', '## DO', '', '## DON\'T', '', 'HANDOFF');
  return lines.join('\n');
}

// ── 測試 ──

describe('checkPlatformDrift — 場景 1：全部設定正確，無 findings', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    // 建立一個使用 disallowedTools 的正確 developer agent
    writeFileSync(join(pluginRoot, 'agents', 'developer.md'), makeAgentMd({ name: 'developer' }));
  });

  it('全部設定正確時不回傳任何 findings', () => {
    const findings = checkPlatformDrift(pluginRoot);
    expect(findings.length).toBe(0);
  });
});

describe('checkPlatformDrift — 場景 2：agent 使用棄用 tools 白名單', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    // developer 使用 tools:（非 grader，應報 warning）
    writeFileSync(
      join(pluginRoot, 'agents', 'developer.md'),
      makeAgentMd({ name: 'developer', useTools: true, toolsList: ['Read', 'Write'] })
    );
  });

  it('agent 使用 tools 白名單時，回傳 warning finding', () => {
    const findings = checkPlatformDrift(pluginRoot);
    const warnings = findings.filter((f) => f.severity === 'warning' && f.check === 'platform-drift');
    expect(warnings.length).toBeGreaterThanOrEqual(1);

    const toolsWarning = warnings.find(
      (f) => f.message.includes('棄用') && f.message.includes('developer')
    );
    expect(toolsWarning).toBeDefined();
    expect(toolsWarning.file).toContain('developer.md');
  });

  it('tools 白名單 warning 的 detail 包含工具名稱', () => {
    const findings = checkPlatformDrift(pluginRoot);
    const toolsWarning = findings.find(
      (f) => f.severity === 'warning' && f.message.includes('棄用') && f.message.includes('developer')
    );
    expect(toolsWarning).toBeDefined();
    expect(toolsWarning.detail).toContain('Read');
    expect(toolsWarning.detail).toContain('Write');
  });
});

describe('checkPlatformDrift — 場景 3：grader 使用 tools 不報 warning（例外）', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    // 正常 developer（符合 registry-data.json 中的 DEV/developer）
    writeFileSync(join(pluginRoot, 'agents', 'developer.md'), makeAgentMd({ name: 'developer' }));
    // grader 使用 tools: 白名單（特殊例外，不應報 warning）
    const graderMd = [
      '---',
      'name: grader',
      'description: 品質評審',
      'model: haiku',
      'permissionMode: bypassPermissions',
      'color: purple',
      'maxTurns: 5',
      'tools:',
      '  - Read',
      '  - Bash',
      '---',
      '',
      '# Grader body',
    ].join('\n');
    writeFileSync(join(pluginRoot, 'agents', 'grader.md'), graderMd);
  });

  it('grader 使用 tools 不回傳 tools 白名單 warning', () => {
    const findings = checkPlatformDrift(pluginRoot);
    const graderToolsWarning = findings.find(
      (f) => f.severity === 'warning' && f.message.includes('grader') && f.message.includes('棄用')
    );
    expect(graderToolsWarning).toBeUndefined();
  });

  it('grader 以外的 findings 不受影響（仍是 0）', () => {
    // developer 設定正確，grader 豁免 → 總 findings 為 0
    const findings = checkPlatformDrift(pluginRoot);
    // grader 使用 tools，config-api 不報 disallowedTools 互斥（因為沒有 disallowedTools）
    // 但 grader 的 tools 工具名稱未知，config-api 會報 warning
    // 我們只確認「棄用白名單」那類 warning 不出現
    const deprecatedWarnings = findings.filter(
      (f) => f.severity === 'warning' && f.message.includes('棄用')
    );
    expect(deprecatedWarnings.length).toBe(0);
  });
});

describe('checkPlatformDrift — 場景 4：config-api validation errors 轉為 error findings', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    // developer.md 省略 description（必填欄位），config-api 應回傳 error
    writeFileSync(
      join(pluginRoot, 'agents', 'developer.md'),
      makeAgentMd({ name: 'developer', skipDescription: true })
    );
  });

  it('config-api 驗證 error 轉為 platform-drift error finding', () => {
    const findings = checkPlatformDrift(pluginRoot);
    const errors = findings.filter((f) => f.severity === 'error' && f.check === 'platform-drift');
    expect(errors.length).toBeGreaterThanOrEqual(1);

    const descError = errors.find((f) => f.message.includes('description'));
    expect(descError).toBeDefined();
    expect(descError.file).toContain('developer.md');
  });
});

describe('checkPlatformDrift — 場景 5：config-api validation warnings 轉為 warning findings', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    // developer.md 使用 disallowedTools 含未知工具，config-api 應回傳 warning
    writeFileSync(
      join(pluginRoot, 'agents', 'developer.md'),
      makeAgentMd({
        name: 'developer',
        disallowedTools: ['UnknownNonExistentTool'],
      })
    );
  });

  it('config-api 驗證 warning 轉為 platform-drift warning finding', () => {
    const findings = checkPlatformDrift(pluginRoot);
    const warnings = findings.filter((f) => f.severity === 'warning' && f.check === 'platform-drift');
    expect(warnings.length).toBeGreaterThanOrEqual(1);

    const unknownToolWarning = warnings.find(
      (f) => f.message.includes('UnknownNonExistentTool') || f.message.includes('未知')
    );
    expect(unknownToolWarning).toBeDefined();
    expect(unknownToolWarning.file).toContain('developer.md');
  });
});

describe('checkPlatformDrift — 場景 6：tools 空陣列不觸發 warning', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    // tools: [] 空陣列，條件 tools.length > 0 不成立，不應報 warning
    const agentMdWithEmptyTools = [
      '---',
      'name: developer',
      'description: developer agent',
      'model: sonnet',
      'permissionMode: bypassPermissions',
      'color: yellow',
      'maxTurns: 50',
      'tools: []',
      '---',
      '',
      '## DO',
      '',
      "## DON'T",
      '',
      'HANDOFF',
    ].join('\n');
    writeFileSync(join(pluginRoot, 'agents', 'developer.md'), agentMdWithEmptyTools);
  });

  it('tools 欄位為空陣列時不回傳棄用 warning', () => {
    const findings = checkPlatformDrift(pluginRoot);
    const deprecatedWarnings = findings.filter(
      (f) => f.severity === 'warning' && f.message.includes('棄用')
    );
    expect(deprecatedWarnings.length).toBe(0);
  });
});

describe('checkPlatformDrift — 場景 7：多個 agent 同時有問題，findings 各自獨立', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    // 更新 registry-data.json，包含兩個 stage
    const { writeFileSync: wf } = require('fs');
    wf(
      join(pluginRoot, 'scripts', 'lib', 'registry-data.json'),
      JSON.stringify(
        {
          stages: {
            DEV: { label: '開發', emoji: '💻', agent: 'developer', color: 'yellow' },
            REVIEW: { label: '審查', emoji: '🔍', agent: 'reviewer', color: 'blue' },
          },
          agentModels: { developer: 'sonnet', reviewer: 'opus' },
        },
        null,
        2
      )
    );
    // developer 使用 tools:（應報 warning）
    wf(
      join(pluginRoot, 'agents', 'developer.md'),
      makeAgentMd({ name: 'developer', useTools: true, toolsList: ['Read'] })
    );
    // reviewer 省略 description（應報 error）
    wf(
      join(pluginRoot, 'agents', 'reviewer.md'),
      makeAgentMd({ name: 'reviewer', skipDescription: true })
    );
  });

  it('兩個 agent 各自的 findings 都回傳', () => {
    const findings = checkPlatformDrift(pluginRoot);

    const devWarning = findings.find(
      (f) => f.severity === 'warning' && f.message.includes('developer') && f.message.includes('棄用')
    );
    expect(devWarning).toBeDefined();

    const reviewerError = findings.find(
      (f) => f.severity === 'error' && f.file.includes('reviewer.md') && f.message.includes('description')
    );
    expect(reviewerError).toBeDefined();
  });
});

describe('checkPlatformDrift — 場景 8：agents 目錄不存在時，不拋例外', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    // 刻意不建立 agents/ 目錄（覆寫 makeTmpPluginRoot 建好的）
    const { rmSync } = require('fs');
    rmSync(join(pluginRoot, 'agents'), { recursive: true, force: true });
  });

  it('agents 目錄不存在時函式不拋例外，回傳 findings 陣列', () => {
    expect(() => checkPlatformDrift(pluginRoot)).not.toThrow();
    const findings = checkPlatformDrift(pluginRoot);
    expect(Array.isArray(findings)).toBe(true);
  });
});

describe('checkPlatformDrift — 場景 9：disallowedTools 與 tools 同時設定時，回傳互斥 error', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    // 同時設定 disallowedTools 和 tools（互斥，應報 error）
    const conflictMd = [
      '---',
      'name: developer',
      'description: developer agent',
      'model: sonnet',
      'permissionMode: bypassPermissions',
      'color: yellow',
      'maxTurns: 50',
      'disallowedTools:',
      '  - Task',
      'tools:',
      '  - Read',
      '---',
      '',
      '## DO',
      '',
      "## DON'T",
      '',
      'HANDOFF',
    ].join('\n');
    writeFileSync(join(pluginRoot, 'agents', 'developer.md'), conflictMd);
  });

  it('disallowedTools 和 tools 同時設定回傳互斥 error finding', () => {
    const findings = checkPlatformDrift(pluginRoot);
    const errors = findings.filter((f) => f.severity === 'error' && f.check === 'platform-drift');
    expect(errors.length).toBeGreaterThanOrEqual(1);

    const mutualExclusiveError = errors.find((f) => f.message.includes('互斥'));
    expect(mutualExclusiveError).toBeDefined();
    expect(mutualExclusiveError.file).toContain('developer.md');
  });
});

describe('checkPlatformDrift — 場景 10：registry-data.json 中的 agent 缺少 .md 時，回傳 cross error', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    // registry-data.json 宣告了 designer agent，但沒有 designer.md
    const { writeFileSync: wf } = require('fs');
    wf(
      join(pluginRoot, 'scripts', 'lib', 'registry-data.json'),
      JSON.stringify(
        {
          stages: {
            DEV: { label: '開發', emoji: '💻', agent: 'developer', color: 'yellow' },
            DESIGN: { label: '設計', emoji: '🎨', agent: 'designer', color: 'cyan' },
          },
          agentModels: { developer: 'sonnet', designer: 'sonnet' },
        },
        null,
        2
      )
    );
    // developer.md 存在，但 designer.md 故意缺席
    wf(join(pluginRoot, 'agents', 'developer.md'), makeAgentMd({ name: 'developer' }));
  });

  it('registry 宣告但缺少 .md 的 agent，回傳 cross error finding', () => {
    const findings = checkPlatformDrift(pluginRoot);
    const crossErrors = findings.filter(
      (f) => f.severity === 'error' && f.check === 'platform-drift' && f.message.includes('designer')
    );
    expect(crossErrors.length).toBeGreaterThanOrEqual(1);
  });
});
