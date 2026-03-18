import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const CLAUDE_DIR = join(homedir(), ".claude");
const OVERTONE_DIR = join(homedir(), "projects/overtone");
const DASHBOARD_DIR = join(OVERTONE_DIR, "dashboard");
const PORT = 3500;

function readJsonl(fp) {
  if (!existsSync(fp)) return [];
  try {
    const raw = readFileSync(fp, "utf-8").trim();
    if (!raw) return [];
    return raw.split("\n").map((l) => { try { const o = JSON.parse(l); return (o && typeof o === "object" && !Array.isArray(o)) ? o : null; } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

const h = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json", "Cache-Control": "no-cache" };
const mdH = { "Access-Control-Allow-Origin": "*", "Content-Type": "text/markdown" };
const j = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: h });
const err = (e) => j({ error: String(e?.message ?? e) }, 500);


async function handleApi(path, req) {
  try {
    if (path === "/api/health") {
      try {
        const r = await fetch("http://127.0.0.1:3457/health", { signal: AbortSignal.timeout(3000) });
        return j(await r.json());
      } catch { return j({ status: "offline" }); }
    }

    if (path === "/api/scores") return j(readJsonl(join(CLAUDE_DIR, "data/scores.jsonl")).slice(-500));
    if (path === "/api/behaviors") return j(readJsonl(join(CLAUDE_DIR, "data/behaviors.jsonl")));
    if (path === "/api/errors") return j(readJsonl("/tmp/hook-errors.jsonl"));
    if (path === "/api/sessions") return j(readJsonl(join(CLAUDE_DIR, "data/session-summaries.jsonl")));
    if (path === "/api/improvements") return j(readJsonl(join(CLAUDE_DIR, "data/improvements.jsonl")));
    if (path === "/api/lifecycle") return j(readJsonl(join(CLAUDE_DIR, "data/lifecycle.jsonl")));
    if (path === "/api/decisions") return j(readJsonl(join(CLAUDE_DIR, "data/decision-log.jsonl")).slice(-100));

    if (path === "/api/scripts") {
      const dir = join(CLAUDE_DIR, "scripts");
      if (!existsSync(dir)) return j([]);
      return j(readdirSync(dir).filter((f) => f.endsWith(".js")).map((name) => {
        const fp = join(dir, name);
        const content = readFileSync(fp, "utf-8");
        return { name, lines: content.split("\n").length, bytes: statSync(fp).size };
      }));
    }

    if (path === "/api/components") {
      const cnt = (dir, test) => {
        if (!existsSync(dir)) return 0;
        try { return readdirSync(dir, { recursive: true }).filter(typeof test === "function" ? test : (f) => f.endsWith(test)).length; }
        catch { return 0; }
      };
      return j({
        rules: cnt(join(CLAUDE_DIR, "rules"), ".md"),
        skills: cnt(join(CLAUDE_DIR, "skills"), (f) => f.endsWith("SKILL.md")),
        agents: cnt(join(CLAUDE_DIR, "agents"), ".md"),
        hooks: cnt(join(CLAUDE_DIR, "hooks/modules"), ".js"),
      });
    }

    if (path === "/api/git") {
      const parse = (raw) => raw.trim().split("\n").filter(Boolean).map((l) => {
        const [hash, subject, date] = l.split("|");
        return { hash, subject, date };
      });
      return j({
        nova: parse(execSync(`git -C "${CLAUDE_DIR}" log --format='%H|%s|%ai' -10`, { encoding: "utf-8" })),
        overtone: parse(execSync(`git -C "${OVERTONE_DIR}" log --format='%H|%s|%ai' -10`, { encoding: "utf-8" })),
      });
    }

    if (path === "/api/briefing") {
      const fp = join(CLAUDE_DIR, "data/session-briefing.md");
      return new Response(existsSync(fp) ? readFileSync(fp, "utf-8") : "", { headers: mdH });
    }

    if (path === "/api/radar") {
      const fp = join(OVERTONE_DIR, "docs/技術雷達.md");
      return new Response(existsSync(fp) ? readFileSync(fp, "utf-8") : "", { headers: mdH });
    }

    if (path === "/api/scenarios") {
      const fp = join(OVERTONE_DIR, "docs/目標場景.md");
      if (!existsSync(fp)) return j([]);
      const scenarios = [];
      let cur = null;
      for (const line of readFileSync(fp, "utf-8").split("\n")) {
        const hdr = line.match(/^#{1,3}\s+(.+)/);
        if (hdr) { if (cur) scenarios.push(cur); cur = { name: hdr[1].trim(), conditions: [] }; continue; }
        const cond = line.match(/[-*]\s+\[(x|~| )\]\s+(.+)/i);
        if (cond && cur) cur.conditions.push({ text: cond[2].trim(), status: { x: "done", "~": "partial", " ": "pending" }[cond[1].toLowerCase()] ?? "pending" });
      }
      if (cur) scenarios.push(cur);
      return j(scenarios.filter((s) => s.conditions.length > 0));
    }

    if (path === "/api/locks") {
      const paths = ["/tmp/nova-server.lock", "/tmp/maintainer.lock", "/tmp/learner.lock", "/tmp/judge.lock"];
      return j(paths.map((p) => {
        if (!existsSync(p)) return { path: p, exists: false };
        try {
          const pid = parseInt(readFileSync(p, "utf-8").trim(), 10) || undefined;
          const age = Math.floor((Date.now() - statSync(p).mtimeMs) / 1000);
          return { path: p, exists: true, pid, age };
        } catch { return { path: p, exists: true }; }
      }));
    }

    if (path === "/api/daemons") {
      const last20 = (fp) => existsSync(fp) ? readFileSync(fp, "utf-8").split("\n").filter(Boolean).slice(-20) : [];
      return j({ maintainer: last20("/tmp/maintainer.log"), judge: last20("/tmp/judge.log"), learner: last20("/tmp/learner.log") });
    }

    if (path === "/api/skills") {
      const dir = join(CLAUDE_DIR, "skills");
      if (!existsSync(dir)) return j([]);
      return j(readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
        const sf = join(dir, d.name, "SKILL.md");
        if (!existsSync(sf)) return null;
        const lines = readFileSync(sf, "utf-8").split("\n");
        const head = lines.slice(0, 5).join("\n");
        return {
          name: (head.match(/name:\s*(.+)/i)?.[1] ?? d.name).trim(),
          description: (head.match(/description:\s*(.+)/i)?.[1] ?? "").trim(),
          hasReferences: existsSync(join(dir, d.name, "references")),
          lineCount: lines.length,
        };
      }).filter(Boolean));
    }

    if (path === "/api/events") {
      try {
        const up = await fetch("http://127.0.0.1:3457/events", { signal: AbortSignal.timeout(3000) });
        return new Response(up.body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" } });
      } catch {
        return new Response(new ReadableStream({ start(c) { c.close(); } }), { headers: { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*" } });
      }
    }

    if (path === "/api/actions/clear-locks" && req.method === "POST") {
      const cleared = [];
      for (const p of ["/tmp/maintainer.lock", "/tmp/learner.lock", "/tmp/judge.lock"]) {
        if (existsSync(p) && Math.floor((Date.now() - statSync(p).mtimeMs) / 1000) > 300) {
          try { unlinkSync(p); cleared.push(p); } catch { /* skip */ }
        }
      }
      return j({ cleared });
    }

    if (path === "/api/actions/reload-modules" && req.method === "POST") {
      const r = await fetch("http://127.0.0.1:3457/modules/reload", { method: "POST", signal: AbortSignal.timeout(3000) });
      return j(await r.json());
    }

    if (path === "/api/actions/trigger-maintainer" && req.method === "POST") {
      Bun.spawn(["bun", join(CLAUDE_DIR, "scripts/maintainer.js")], { detached: true, stdio: ["ignore", "ignore", "ignore"] });
      return j({ triggered: true });
    }

    if (path === "/api/processes") {
      try {
        const r = await fetch("http://127.0.0.1:3457/processes", { signal: AbortSignal.timeout(3000) });
        return new Response(await r.text(), { headers: h });
      } catch { return j({}); }
    }

    if (path === "/api/actions/heartbeat-start" && req.method === "POST") {
      try {
        const r = await fetch("http://127.0.0.1:3457/processes/heartbeat/start", { method: "POST", signal: AbortSignal.timeout(5000) });
        return new Response(await r.text(), { headers: h });
      } catch { return j({ ok: false, error: "nova-server unreachable" }); }
    }

    if (path === "/api/actions/heartbeat-stop" && req.method === "POST") {
      try {
        const r = await fetch("http://127.0.0.1:3457/processes/heartbeat/stop", { method: "POST", signal: AbortSignal.timeout(3000) });
        return new Response(await r.text(), { headers: h });
      } catch { return j({ ok: false, error: "nova-server unreachable" }); }
    }

    // LLM 健康狀態
    if (path === "/api/llm") {
      try {
        const r = await fetch("http://localhost:8000/v1/models", { signal: AbortSignal.timeout(3000) });
        if (!r.ok) return j({ status: "offline" });
        const data = await r.json();
        const model = data.data?.[0];
        return j({ status: "online", model: model?.id || "unknown", created: model?.created });
      } catch { return j({ status: "offline" }); }
    }

    // Session 日誌（會議記錄用）
    if (path === "/api/session-log") {
      const fp = join(CLAUDE_DIR, "data/session-summaries.jsonl");
      if (!existsSync(fp)) return j([]);
      try {
        const lines = readFileSync(fp, "utf-8").trim().split("\n").filter(Boolean);
        const entries = lines.slice(-20).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        return j(entries);
      } catch { return j([]); }
    }

    if (path === "/api/system") {
      const mem = process.memoryUsage();

      let orphans = [];
      try {
        const ps = execSync('ps aux | grep "[b]un" | grep -v "nova-"', { encoding: 'utf-8', timeout: 3000 });
        orphans = ps.trim().split('\n').filter(Boolean).map(line => {
          const parts = line.trim().split(/\s+/);
          return { pid: parts[1], cpu: parts[2], mem: parts[3], cmd: parts.slice(10).join(' ').slice(0, 80) };
        });
      } catch { /* no orphans */ }

      let novaProcesses = [];
      try {
        const ps = execSync('ps aux | grep "nova-"', { encoding: 'utf-8', timeout: 3000 });
        novaProcesses = ps.trim().split('\n').filter(l => !l.includes('grep')).map(line => {
          const parts = line.trim().split(/\s+/);
          return { pid: parts[1], cpu: parts[2], mem: parts[3], cmd: parts.slice(10).join(' ').slice(0, 80) };
        });
      } catch { /* empty */ }

      return j({
        memory: { rss: Math.round(mem.rss / 1024 / 1024), heap: Math.round(mem.heapUsed / 1024 / 1024), heapTotal: Math.round(mem.heapTotal / 1024 / 1024) },
        orphanBunProcesses: orphans,
        novaProcesses: novaProcesses,
      });
    }

    return j({ error: "Not Found" }, 404);
  } catch (e) { return err(e); }
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/api/")) return handleApi(path, req);
    const fp = path === "/" ? join(DASHBOARD_DIR, "gallery.html") : join(DASHBOARD_DIR, path);
    try {
      const file = Bun.file(fp);
      if (!(await file.exists())) return new Response("Not Found", { status: 404 });
      return new Response(file);
    } catch { return new Response("Not Found", { status: 404 }); }
  },
});

console.log("Nova Dashboard: http://localhost:3500");
