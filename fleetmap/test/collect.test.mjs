import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fleetFromJlist } from '../collectors/collect-pm2.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/pm2-jlist.json'), 'utf8'));

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

test('fleetFromJlist maps all pm2 processes with correct health', () => {
  const fleet = fleetFromJlist(fixture, { title: 'Test fleet' });
  assert.equal(fleet.nodes.length, 18);

  const online = fleet.nodes.filter((n) => n.health === 'online');
  const stopped = fleet.nodes.filter((n) => n.health === 'stopped');
  assert.equal(online.length, 15);
  assert.equal(stopped.length, 3);
});

test('ids are unique and match the schema id pattern', () => {
  const fleet = fleetFromJlist(fixture, { title: 'Test fleet' });
  const ids = fleet.nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, ID_PATTERN);
});

test('meta.mem and meta.uptime are human readable, uptime only when online', () => {
  const fleet = fleetFromJlist(fixture, { title: 'Test fleet' });
  for (const node of fleet.nodes) {
    if (node.meta?.mem) assert.match(node.meta.mem, /^\d+(\.\d+)? (MB|GB)$/);
    if (node.meta?.uptime) assert.match(node.meta.uptime, /^\d+(d|h|m)$/);
    if (node.health !== 'online') assert.equal(node.meta?.uptime, undefined);
    assert.ok(Object.keys(node.meta ?? {}).length <= 6);
  }
});

test('empty jlist throws a clear error', () => {
  assert.throws(() => fleetFromJlist([]), /empty/i);
});

test('duplicate names get deduped via suffix', () => {
  const dupes = [
    {
      pid: 1,
      name: 'Worker',
      pm_id: 0,
      monit: { memory: 0, cpu: 0 },
      pm2_env: { name: 'Worker', pm_id: 0, status: 'online', pm_uptime: Date.now() - 1000, restart_time: 0 },
    },
    {
      pid: 2,
      name: 'worker',
      pm_id: 1,
      monit: { memory: 0, cpu: 0 },
      pm2_env: { name: 'worker', pm_id: 1, status: 'online', pm_uptime: Date.now() - 1000, restart_time: 0 },
    },
  ];
  const fleet = fleetFromJlist(dupes, { title: 'Dupe fleet' });
  const ids = fleet.nodes.map((n) => n.id);
  assert.deepEqual(ids, ['worker', 'worker-2']);
});

test('opts.group assigns all nodes to the group and sets fleet.groups', () => {
  const fleet = fleetFromJlist(fixture.slice(0, 2), {
    title: 'Grouped',
    group: { id: 'demo-host', label: 'demo-host' },
  });
  assert.deepEqual(fleet.groups, [{ id: 'demo-host', label: 'demo-host' }]);
  for (const node of fleet.nodes) assert.equal(node.group, 'demo-host');
});
