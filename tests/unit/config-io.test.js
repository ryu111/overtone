'use strict';
/**
 * tests/unit/config-io.test.js — config-io.js 單元測試
 *
 * 使用 tmpdir 建立隔離環境，避免影響真實 plugin 目錄。
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');
const {
  resolveCommand,
  readAgentFile,
  readSkillFile,
  readHooksJson,
  getHookHandler,
  readRegistryData,
  writeRegistryData,
  readPluginJson,
  writePluginJson,
} = require(join(SCRIPTS_LIB, 'config-io'));

// ── 輔助函式 ──

function makeTmpDir(prefix = 'config-io-test') {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeTmpPluginRoot() {
  const dir = makeTmpDir('config-io-plugin');
  mkdirSync(join(dir, 'agents'), { recursive: true });
  mkdirSync(join(dir, 'hooks'), { recursive: true });
  mkdirSync(join(dir, 'skills'), { recursive: true });
  mkdirSync(join(dir, 'scripts', 'lib'), { recursive: true });
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  return dir;
}

// ── resolveCommand ──

describe('resolveCommand', () => {
  it('替換單一 ${CLAUDE_PLUGIN_ROOT} 占位符', () => {
    const result = resolveCommand('node ${CLAUDE_PLUGIN_ROOT}/scripts/hook.js', '/my/plugin');
    expect(result).toBe('node /my/plugin/scripts/hook.js');
  });

  it('替換多個 ${CLAUDE_PLUGIN_ROOT} 占位符', () => {
    const result = resolveCommand(
      '${CLAUDE_PLUGIN_ROOT}/a && ${CLAUDE_PLUGIN_ROOT}/b',
      '/root'
    );
    expect(result).toBe('/root/a && /root/b');
  });

  it('無占位符時原樣回傳', () => {
    const result = resolveCommand('echo hello', '/root');
    expect(result).toBe('echo hello');
  });

  it('空字串回傳空字串', () => {
    expect(resolveCommand('', '/root')).toBe('');
  });
});

// ── readAgentFile ──

describe('readAgentFile', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir('read-agent');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('正確解析 frontmatter 和 content', () => {
    const agentPath = join(tmpDir, 'developer.md');
    writeFileSync(agentPath, '---\nname: developer\nmodel: sonnet\n---\n# Developer\nDo stuff.');

    const { frontmatter, content, rawContent } = readAgentFile(agentPath);
    expect(frontmatter.name).toBe('developer');
    expect(frontmatter.model).toBe('sonnet');
    expect(content).toContain('# Developer');
    expect(rawContent).toContain('---');
  });

  it('無 frontmatter 時回傳空 frontmatter 物件', () => {
    const agentPath = join(tmpDir, 'simple.md');
    writeFileSync(agentPath, '# Simple\nNo frontmatter here.');

    const { frontmatter, content } = readAgentFile(agentPath);
    expect(frontmatter).toEqual({});
    expect(content).toContain('# Simple');
  });

  it('frontmatter 含陣列欄位', () => {
    const agentPath = join(tmpDir, 'agent.md');
    writeFileSync(agentPath, '---\nname: agent\nskills:\n  - testing\n  - debugging\n---\nContent.');

    const { frontmatter } = readAgentFile(agentPath);
    expect(frontmatter.skills).toEqual(['testing', 'debugging']);
  });

  it('檔案不存在時拋出錯誤', () => {
    expect(() => readAgentFile(join(tmpDir, 'nonexistent.md'))).toThrow();
  });
});

// ── readSkillFile ──

describe('readSkillFile', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir('read-skill');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('正確解析 SKILL.md frontmatter 和 content', () => {
    const skillPath = join(tmpDir, 'SKILL.md');
    writeFileSync(skillPath, '---\nname: testing\ndomain: testing\n---\n# Testing Skill\nDetails.');

    const { frontmatter, content, rawContent } = readSkillFile(skillPath);
    expect(frontmatter.name).toBe('testing');
    expect(frontmatter.domain).toBe('testing');
    expect(content).toContain('# Testing Skill');
    expect(rawContent).toContain('---');
  });

  it('檔案不存在時拋出錯誤', () => {
    expect(() => readSkillFile(join(tmpDir, 'nonexistent.md'))).toThrow();
  });
});

// ── readHooksJson ──

describe('readHooksJson', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });

  afterEach(() => {
    rmSync(pluginRoot, { recursive: true, force: true });
  });

  it('正常讀取 hooks.json', () => {
    const data = {
      hooks: {
        SessionStart: [
          { matcher: '.*', hooks: [{ type: 'command', command: 'echo start' }] },
        ],
      },
    };
    writeFileSync(join(pluginRoot, 'hooks', 'hooks.json'), JSON.stringify(data));

    const result = readHooksJson(pluginRoot);
    expect(result.hooks.SessionStart).toBeDefined();
    expect(result.hooks.SessionStart[0].hooks[0].command).toBe('echo start');
  });

  it('hooks.json 不存在時回傳 { hooks: {} }', () => {
    // 移除剛建立的 hooks.json
    const hooksPath = join(pluginRoot, 'hooks', 'hooks.json');
    if (existsSync(hooksPath)) rmSync(hooksPath);

    const result = readHooksJson(pluginRoot);
    expect(result).toEqual({ hooks: {} });
  });

  it('hooks.json 為空物件 hooks 時正確解析', () => {
    writeFileSync(join(pluginRoot, 'hooks', 'hooks.json'), JSON.stringify({ hooks: {} }));
    const result = readHooksJson(pluginRoot);
    expect(result.hooks).toEqual({});
  });
});

// ── getHookHandler ──

describe('getHookHandler', () => {
  const makeHooksData = (event, groups) => ({ hooks: { [event]: groups } });

  it('回傳第一個 group 的第一個 hook handler', () => {
    const hooksData = makeHooksData('SessionStart', [
      {
        matcher: '.*',
        hooks: [
          { type: 'command', command: 'echo hello', timeout: 5000 },
          { type: 'command', command: 'echo world' },
        ],
      },
    ]);

    const handler = getHookHandler(hooksData, 'SessionStart');
    expect(handler.type).toBe('command');
    expect(handler.command).toBe('echo hello');
    expect(handler.matcher).toBe('.*');
    expect(handler.timeout).toBe(5000);
  });

  it('handler 無 timeout 時不包含 timeout 欄位（保持 handler 原有欄位）', () => {
    const hooksData = makeHooksData('Stop', [
      {
        hooks: [{ type: 'command', command: 'echo stop' }],
      },
    ]);

    const handler = getHookHandler(hooksData, 'Stop');
    expect(handler.command).toBe('echo stop');
    // matcher 不存在時不強制加入
    expect(handler.matcher).toBeUndefined();
  });

  it('事件不存在時回傳 null', () => {
    const hooksData = { hooks: {} };
    expect(getHookHandler(hooksData, 'NonExistentEvent')).toBeNull();
  });

  it('事件 matcherGroups 為空陣列時回傳 null', () => {
    const hooksData = makeHooksData('SessionStart', []);
    expect(getHookHandler(hooksData, 'SessionStart')).toBeNull();
  });

  it('第一個 group 的 hooks 為空陣列時回傳 null', () => {
    const hooksData = makeHooksData('SessionStart', [{ matcher: '.*', hooks: [] }]);
    expect(getHookHandler(hooksData, 'SessionStart')).toBeNull();
  });

  it('hooks 欄位為 undefined 時回傳 null', () => {
    const hooksData = { hooks: { SessionStart: undefined } };
    expect(getHookHandler(hooksData, 'SessionStart')).toBeNull();
  });

  it('不修改原始 handler 物件（回傳副本）', () => {
    const original = { type: 'command', command: 'echo test' };
    const hooksData = makeHooksData('Stop', [{ matcher: 'x', hooks: [original] }]);

    const handler = getHookHandler(hooksData, 'Stop');
    handler.extra = 'injected';
    expect(original.extra).toBeUndefined();
  });
});

// ── readRegistryData / writeRegistryData ──

describe('readRegistryData + writeRegistryData', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });

  afterEach(() => {
    rmSync(pluginRoot, { recursive: true, force: true });
  });

  it('讀取 registry-data.json 回傳正確物件', () => {
    const data = {
      stages: {
        DEV: { label: '開發', emoji: '💻', agent: 'developer', color: 'yellow' },
      },
      agentModels: { developer: 'sonnet' },
    };
    writeFileSync(
      join(pluginRoot, 'scripts', 'lib', 'registry-data.json'),
      JSON.stringify(data, null, 2)
    );

    const result = readRegistryData(pluginRoot);
    expect(result.stages.DEV.agent).toBe('developer');
    expect(result.agentModels.developer).toBe('sonnet');
  });

  it('寫入後再讀取資料一致', () => {
    const original = {
      stages: {
        TEST: { label: '測試', emoji: '🧪', agent: 'tester', color: 'blue' },
      },
      agentModels: { tester: 'opus' },
    };
    writeRegistryData(pluginRoot, original);

    const result = readRegistryData(pluginRoot);
    expect(result.stages.TEST.agent).toBe('tester');
    expect(result.agentModels.tester).toBe('opus');
  });

  it('writeRegistryData 寫入後檔案為有效 JSON', () => {
    writeRegistryData(pluginRoot, { stages: {}, agentModels: {} });
    const raw = readFileSync(join(pluginRoot, 'scripts', 'lib', 'registry-data.json'), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('registry-data.json 不存在時拋出錯誤', () => {
    rmSync(join(pluginRoot, 'scripts', 'lib', 'registry-data.json'), { force: true });
    expect(() => readRegistryData(pluginRoot)).toThrow();
  });
});

// ── readPluginJson / writePluginJson ──

describe('readPluginJson + writePluginJson', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });

  afterEach(() => {
    rmSync(pluginRoot, { recursive: true, force: true });
  });

  it('讀取 plugin.json 回傳正確物件', () => {
    const data = {
      name: 'ot',
      version: '0.28.0',
      agents: ['./agents/developer.md'],
    };
    writeFileSync(
      join(pluginRoot, '.claude-plugin', 'plugin.json'),
      JSON.stringify(data, null, 2)
    );

    const result = readPluginJson(pluginRoot);
    expect(result.name).toBe('ot');
    expect(result.version).toBe('0.28.0');
    expect(result.agents).toContain('./agents/developer.md');
  });

  it('寫入後再讀取資料一致', () => {
    const original = {
      name: 'ot',
      version: '1.0.0',
      agents: ['./agents/tester.md', './agents/developer.md'],
    };
    writePluginJson(pluginRoot, original);

    const result = readPluginJson(pluginRoot);
    expect(result.version).toBe('1.0.0');
    expect(result.agents).toHaveLength(2);
  });

  it('writePluginJson 寫入後檔案為有效 JSON', () => {
    writePluginJson(pluginRoot, { name: 'ot', version: '0.1.0' });
    const raw = readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('plugin.json 不存在時拋出錯誤', () => {
    rmSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), { force: true });
    expect(() => readPluginJson(pluginRoot)).toThrow();
  });
});
