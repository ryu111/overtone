// data-layer.js — 共用資料層
// 所有 dashboard 面板共用，統一 fetch + 快取 + 自動刷新

const DATA = {
  health: null, llm: null, components: null, scores: null, errors: null,
  scripts: null, git: null, sessions: null, behaviors: null, locks: null,
  improvements: null, scenarios: null, daemons: null, sessionLog: null,
  system: null, decisions: null,
  _ts: 0, _loading: false, _listeners: [],
};

async function fetchApi(ep) {
  try {
    const r = await fetch(`/api/${ep}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? await r.json() : await r.text();
  } catch (e) {
    console.error(`API ${ep}:`, e.message);
    return null;
  }
}

async function postApi(ep) {
  try {
    const r = await fetch(`/api/${ep}`, { method: 'POST', signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.error(`POST ${ep}:`, e.message);
    return null;
  }
}

async function loadAllData() {
  if (DATA._loading) return DATA;
  DATA._loading = true;
  try {
    const [health, llm, components, scores, errors, scripts, git, sessions, behaviors, locks, improvements, scenarios, daemons, sessionLog, system, decisions] = await Promise.all([
      fetchApi('health'), fetchApi('llm'), fetchApi('components'),
      fetchApi('scores'), fetchApi('errors'), fetchApi('scripts'),
      fetchApi('git'), fetchApi('sessions'), fetchApi('behaviors'),
      fetchApi('locks'), fetchApi('improvements'), fetchApi('scenarios'),
      fetchApi('daemons'), fetchApi('session-log'), fetchApi('system'),
      fetchApi('decisions'),
    ]);
    Object.assign(DATA, { health, llm, components, scores, errors, scripts, git, sessions, behaviors, locks, improvements, scenarios, daemons, sessionLog, system, decisions, _ts: Date.now() });
    DATA._listeners.forEach(fn => { try { fn(DATA); } catch (e) { console.error('listener error:', e); } });
  } finally {
    DATA._loading = false;
  }
  return DATA;
}

function onDataUpdate(fn) {
  DATA._listeners.push(fn);
}

// 30 秒自動刷新
setInterval(loadAllData, 30000);

// ── 共用工具函式 ──

function gradeColor(grade) {
  return { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444' }[grade] || '#6b7280';
}

function formatUptime(seconds) {
  if (!seconds) return 'N/A';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h${m}m`;
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function getLatestScores(scores) {
  if (!scores?.length) return [];
  const latestDate = scores[scores.length - 1]?.date;
  return scores.filter(s => s.date === latestDate);
}

function gradeDistribution(scores) {
  const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const s of scores) dist[s.grade] = (dist[s.grade] || 0) + 1;
  return dist;
}

function clusterErrors(errors) {
  if (!errors?.length) return {};
  const clusters = {};
  for (const e of errors) {
    const key = `${e.event}:${e.phase || '?'}`;
    clusters[key] = (clusters[key] || 0) + 1;
  }
  return clusters;
}

function calcHealthScore(data) {
  const scores = getLatestScores(data.scores);
  const avg = scores.length ? scores.reduce((s, e) => s + e.total, 0) / scores.length : 50;
  const errPenalty = Math.min((data.errors?.length || 0) * 5, 30);
  const lockPenalty = (data.locks?.filter(l => l.exists)?.length || 0) * 10;
  return Math.max(0, Math.min(100, Math.round(avg - errPenalty - lockPenalty)));
}

// ── 決策統計 ──

function generateDecisionSummary(data) {
  if (!data.decisions?.length) return '尚無決策記錄';
  const parts = [];

  // 按 action 分組統計
  const byAction = {};
  for (const d of data.decisions) {
    const key = d.action || 'unknown';
    if (!byAction[key]) byAction[key] = { count: 0, totalReward: 0 };
    byAction[key].count++;
    byAction[key].totalReward += (d.reward || 0);
  }

  parts.push('## 決策統計\n');
  parts.push('| 動作 | 次數 | 平均 Reward |');
  parts.push('|------|:----:|:-----------:|');
  for (const [action, stats] of Object.entries(byAction)) {
    const avg = (stats.totalReward / stats.count).toFixed(2);
    parts.push(`| ${action} | ${stats.count} | ${avg} |`);
  }

  // 最近 5 筆
  parts.push('\n## 最近決策\n');
  for (const d of data.decisions.slice(-5)) {
    const reward = d.reward >= 0.8 ? '✅' : d.reward >= 0.5 ? '⚠️' : '❌';
    parts.push(`- ${reward} **${d.action}** (reward=${d.reward}) — ${d.context || ''}`);
  }

  return parts.join('\n');
}

// ── 會議記錄（第 5 Tab）生成 ──

function generateMeetingNotes(data) {
  const parts = [];
  const now = new Date().toLocaleString('zh-TW', { hour12: false });

  parts.push(`# Nova Session 會議記錄\n> ${now}\n`);

  // 系統狀態摘要
  const serverOk = data.health?.status === 'ok';
  const llmOk = data.llm?.status === 'online';
  parts.push(`## 系統狀態\n- Server：${serverOk ? '✅ 在線' : '❌ 離線'}${serverOk ? `（uptime ${formatUptime(data.health?.uptime)}）` : ''}\n- LLM：${llmOk ? `✅ ${data.llm?.model}` : '❌ 離線'}\n- 元件：Rules ${data.components?.rules || 0} / Skills ${data.components?.skills || 0} / Agents ${data.components?.agents || 0} / Hooks ${data.components?.hooks || 0}`);

  // 品質報告
  const latest = getLatestScores(data.scores);
  if (latest.length) {
    const avg = Math.round(latest.reduce((s, e) => s + e.total, 0) / latest.length);
    const dist = gradeDistribution(latest);
    const fList = latest.filter(s => s.grade === 'F');
    parts.push(`## 品質報告\n- 平均分：${avg}/100\n- 分布：A:${dist.A} B:${dist.B} C:${dist.C} D:${dist.D} F:${dist.F}`);
    if (fList.length) {
      parts.push(`- ⚠️ F 級元件：\n${fList.map(s => `  - ${s.path}（${s.total}/100）`).join('\n')}`);
    }
  }

  // 錯誤狀況
  const errCount = data.errors?.length || 0;
  if (errCount > 0) {
    const clusters = clusterErrors(data.errors);
    parts.push(`## 錯誤狀況\n- 過去 1 小時：${errCount} 個 hook error\n- 根因聚類：\n${Object.entries(clusters).map(([k, v]) => `  - ${k}（${v} 次）`).join('\n')}`);
  } else {
    parts.push(`## 錯誤狀況\n- ✅ 過去 1 小時無 hook error`);
  }

  // 腳本健康
  const overThreshold = (data.scripts || []).filter(s => s.lines > 600);
  if (overThreshold.length) {
    parts.push(`## 腳本健康\n${overThreshold.map(s => `- ${s.lines > 800 ? '🔴' : '⚠️'} ${s.name}：${s.lines} 行`).join('\n')}`);
  }

  // 最近活動
  const recentGit = [...(data.git?.nova || []), ...(data.git?.overtone || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  const allSessions = data.sessions || [];
  const userSessions = allSessions.filter(s => s.source !== 'heartbeat');
  const recentSessions = (userSessions.length > 0 ? userSessions : allSessions).slice(-3).reverse();
  const hbStats = allSessions.filter(s => s.source === 'heartbeat');
  if (recentGit.length || recentSessions.length || hbStats.length) {
    parts.push(`## 最近活動`);
    if (hbStats.length) {
      const ok = hbStats.filter(s => s.status === 'success').length;
      parts.push(`🔄 心跳任務 ${ok}/${hbStats.length} 成功`);
    }
    if (recentSessions.length) {
      parts.push(`### Sessions\n${recentSessions.map(s => `- ${relativeTime(s.date)}：${s.summary || '（無摘要）'}`).join('\n')}`);
    }
    if (recentGit.length) {
      parts.push(`### Git Commits\n${recentGit.map(c => `- \`${c.hash?.slice(0, 7)}\` ${c.subject || c.message || '—'}`).join('\n')}`);
    }
  }

  // 行為觀察
  const notable = (data.behaviors || []).filter(b => b.confidence >= 0.3);
  if (notable.length) {
    parts.push(`## 行為觀察\n${notable.map(b => `- ${b.polarity === -1 ? '⚠️' : '💡'} ${b.id}（信心 ${b.confidence}）${b.suggestion ? `→ ${b.suggestion.content?.slice(0, 50)}` : ''}`).join('\n')}`);
  }

  // 改善建議
  const imps = (data.improvements || []).slice(-3);
  if (imps.length) {
    parts.push(`## 待辦改善\n${imps.map(i => `- **${i.path}**：${(i.suggestions || []).slice(0, 2).join('；')}`).join('\n')}`);
  }

  // 場景狀態
  if (data.scenarios?.length) {
    parts.push(`## 場景達成\n${data.scenarios.map(s => `- ${s.name}：${s.done || 0}✅ ${s.partial || 0}🔄 / ${s.total || 0} 項`).join('\n')}`);
  }

  // 系統資源
  if (data.system) {
    parts.push(`## 系統資源\n`);
    parts.push(`- 記憶體：RSS ${data.system.memory.rss}MB / Heap ${data.system.memory.heap}MB`);
    if (data.system.orphanBunProcesses?.length > 0) {
      parts.push(`- ⚠️ 孤兒 Bun 進程：${data.system.orphanBunProcesses.length} 個`);
      data.system.orphanBunProcesses.forEach(p => parts.push(`  - PID ${p.pid}: ${p.cmd}`));
    } else {
      parts.push(`- 孤兒進程：0（正常）`);
    }
    if (data.system.novaProcesses?.length > 0) {
      parts.push(`- Nova 進程：${data.system.novaProcesses.length} 個`);
      data.system.novaProcesses.forEach(p => parts.push(`  - PID ${p.pid}: ${p.cmd} (CPU ${p.cpu}%)`));
    }
    parts.push('');
  }

  // Daemon 日誌摘要
  if (data.daemons) {
    const daemonSummary = [];
    for (const [name, lines] of Object.entries(data.daemons)) {
      if (lines?.length) {
        const last = lines[lines.length - 1];
        daemonSummary.push(`- ${name}：最後活動 — ${last.slice(0, 80)}`);
      }
    }
    if (daemonSummary.length) parts.push(`## Daemon 日誌\n${daemonSummary.join('\n')}`);
  }

  parts.push(`\n---\n*自動生成於 ${now}*`);
  return parts.join('\n\n');
}
