import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, '../examples');
const rendererPath = join(__dirname, '../renderers/render-fleet.mjs');

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

const examples = ['microservices-fleet.json', 'trading-fleet.json'].map((name) => ({
  name,
  fleet: JSON.parse(readFileSync(join(examplesDir, name), 'utf8')),
}));

function structuralSmoke(fleet) {
  assert.equal(typeof fleet.title, 'string');
  assert.ok(fleet.title.length > 0);
  assert.ok(Array.isArray(fleet.nodes));
  assert.ok(fleet.nodes.length > 0);
  for (const node of fleet.nodes) {
    assert.equal(typeof node.id, 'string');
    assert.match(node.id, ID_PATTERN);
    assert.equal(typeof node.label, 'string');
    assert.equal(typeof node.kind, 'string');
  }
}

test('example fleets are valid', async () => {
  let validateFleet = null;
  if (existsSync(rendererPath)) {
    const mod = await import(pathToFileURL(rendererPath).href);
    validateFleet = mod.validateFleet;
  }

  for (const { name, fleet } of examples) {
    if (typeof validateFleet === 'function') {
      const result = validateFleet(fleet);
      const invalid = result === false || (result && typeof result === 'object' && result.valid === false);
      assert.ok(!invalid, `${name} failed validateFleet: ${JSON.stringify(result)}`);
    } else {
      structuralSmoke(fleet);
    }
  }
});
