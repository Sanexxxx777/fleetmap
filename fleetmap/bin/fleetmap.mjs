#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename, extname, join } from 'node:path';
import { collectFromEnvironment, groupFromLabel } from '../collectors/collect-pm2.mjs';

const HELP = `fleetmap — JSON fleet diagrams

Usage:
  fleetmap render <fleet.json> [-o out.html]
  fleetmap collect [--group-label X] [--title Y] [-o fleet.json]
  fleetmap --help
`;

function fail(message) {
  process.stderr.write(`fleetmap: ${message}\n`);
  process.exit(1);
}

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-o' || arg === '--output') flags.o = argv[++i];
    else if (arg === '--group-label') flags.groupLabel = argv[++i];
    else if (arg === '--title') flags.title = argv[++i];
    else flags._.push(arg);
  }
  return flags;
}

function defaultOutPath(input) {
  const dir = dirname(resolve(input));
  const base = basename(input, extname(input));
  return join(dir, `${base}.html`);
}

async function cmdRender(argv) {
  const flags = parseFlags(argv);
  const input = flags._[0];
  if (!input) return fail('render: missing <fleet.json> path');

  let fleet;
  try {
    fleet = JSON.parse(readFileSync(input, 'utf8'));
  } catch (err) {
    return fail(`render: cannot read/parse "${input}": ${err.message}`);
  }

  let renderMod;
  try {
    renderMod = await import('../renderers/render-fleet.mjs');
  } catch (err) {
    return fail(`render: renderer unavailable (../renderers/render-fleet.mjs): ${err.message}`);
  }

  const { validateFleet, renderFleet } = renderMod;
  if (typeof validateFleet === 'function') {
    const result = validateFleet(fleet);
    const invalid = result === false || (result && typeof result === 'object' && result.valid === false);
    if (invalid) {
      return fail(`render: "${input}" failed schema validation: ${JSON.stringify(result.errors ?? result)}`);
    }
  }

  let html;
  try {
    html = renderFleet(fleet);
  } catch (err) {
    return fail(`render: renderFleet threw: ${err.message}`);
  }

  const outPath = flags.o || defaultOutPath(input);
  try {
    writeFileSync(outPath, html);
  } catch (err) {
    return fail(`render: cannot write "${outPath}": ${err.message}`);
  }
  process.stdout.write(`${outPath}\n`);
}

async function cmdCollect(argv) {
  const flags = parseFlags(argv);
  const opts = {};
  if (flags.title) opts.title = flags.title;
  if (flags.groupLabel) opts.group = groupFromLabel(flags.groupLabel);

  let fleet;
  try {
    fleet = await collectFromEnvironment(opts);
  } catch (err) {
    return fail(`collect: ${err.message}`);
  }

  const json = `${JSON.stringify(fleet, null, 2)}\n`;
  if (flags.o) {
    writeFileSync(flags.o, json);
    process.stdout.write(`${flags.o}\n`);
  } else {
    process.stdout.write(json);
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    process.stdout.write(HELP);
    return;
  }
  if (cmd === 'render') return cmdRender(rest);
  if (cmd === 'collect') return cmdCollect(rest);
  return fail(`unknown command "${cmd}"\n\n${HELP}`);
}

main().catch((err) => {
  process.stderr.write(`fleetmap: ${err.message}\n`);
  process.exit(1);
});
