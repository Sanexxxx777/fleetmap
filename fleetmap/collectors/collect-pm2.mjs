import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function sanitizeId(raw) {
  let id = String(raw ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  id = id.replace(/^[^a-z0-9]+/, '');
  if (!id) id = 'node';
  return id.slice(0, 40);
}

function dedupeId(id, used) {
  if (!used.has(id)) {
    used.add(id);
    return id;
  }
  let n = 2;
  let candidate;
  do {
    const suffix = `-${n}`;
    candidate = id.slice(0, 40 - suffix.length) + suffix;
    n += 1;
  } while (used.has(candidate));
  used.add(candidate);
  return candidate;
}

function mapHealth(status) {
  if (status === 'online') return 'online';
  if (status === 'stopped') return 'stopped';
  if (status === 'errored' || status === 'error') return 'errored';
  return 'unknown';
}

function humanMem(bytes) {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function humanUptime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(sec / 3600);
  if (hours > 0) return `${hours}h`;
  const mins = Math.floor(sec / 60);
  return `${mins}m`;
}

export function fleetFromJlist(jlistArray, opts = {}) {
  if (!Array.isArray(jlistArray)) {
    throw new Error('fleetFromJlist: expected an array (output of `pm2 jlist`)');
  }
  if (jlistArray.length === 0) {
    throw new Error('fleetFromJlist: empty process list — fleet.schema.json requires at least 1 node');
  }

  const usedIds = new Set();
  const nodes = jlistArray.map((proc) => {
    const env = proc.pm2_env ?? {};
    const name = env.name ?? proc.name ?? `process-${proc.pid ?? 'unknown'}`;
    const id = dedupeId(sanitizeId(name), usedIds);
    const health = mapHealth(env.status);

    const meta = {};
    const pmId = env.pm_id ?? proc.pm_id;
    if (pmId !== undefined && pmId !== null) meta.pm2 = String(pmId);

    const mem = humanMem(proc.monit?.memory);
    if (mem) meta.mem = mem;

    if (health === 'online' && Number.isFinite(env.pm_uptime)) {
      const uptime = humanUptime(Date.now() - env.pm_uptime);
      if (uptime) meta.uptime = uptime;
    }

    if (env.restart_time > 0) meta.restarts = String(env.restart_time);

    const node = { id, label: name, kind: 'process', health };
    if (opts.group?.id) node.group = opts.group.id;
    if (Object.keys(meta).length > 0) node.meta = meta;
    return node;
  });

  const fleet = {
    title: opts.title || 'PM2 fleet',
    nodes,
  };
  if (opts.group?.id && opts.group?.label) {
    fleet.groups = [{ id: opts.group.id, label: opts.group.label }];
  }
  return fleet;
}

export function groupFromLabel(label) {
  return { id: sanitizeId(label), label };
}

function pm2Jlist() {
  const result = spawnSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 });
  if (result.error) {
    throw new Error(`failed to run \`pm2 jlist\`: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`\`pm2 jlist\` exited with code ${result.status}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function collectFromEnvironment(opts = {}) {
  let jlist;
  if (!process.stdin.isTTY) {
    const raw = await readStdin();
    jlist = raw.trim() ? JSON.parse(raw) : pm2Jlist();
  } else {
    jlist = pm2Jlist();
  }
  return fleetFromJlist(jlist, opts);
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--group-label') opts.groupLabel = argv[++i];
    else if (arg === '--title') opts.title = argv[++i];
  }
  return opts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const opts = {};
  if (args.title) opts.title = args.title;
  if (args.groupLabel) opts.group = groupFromLabel(args.groupLabel);

  const fleet = await collectFromEnvironment(opts);
  process.stdout.write(`${JSON.stringify(fleet, null, 2)}\n`);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`collect-pm2: ${err.message}\n`);
    process.exit(1);
  });
}
