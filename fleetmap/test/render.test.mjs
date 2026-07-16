import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, '../examples');
const rendererPath = join(__dirname, '../renderers/render-fleet.mjs');
const rendererExists = existsSync(rendererPath);

test(
  'renderFleet produces HTML with title and <svg> for both examples',
  { skip: !rendererExists && 'renderers/render-fleet.mjs not implemented yet' },
  async () => {
    const { renderFleet } = await import(pathToFileURL(rendererPath).href);
    for (const name of ['microservices-fleet.json', 'trading-fleet.json']) {
      const fleet = JSON.parse(readFileSync(join(examplesDir, name), 'utf8'));
      const html = renderFleet(fleet);
      assert.equal(typeof html, 'string');
      assert.ok(html.includes(fleet.title));
      assert.ok(html.includes('<svg'));
    }
  }
);
