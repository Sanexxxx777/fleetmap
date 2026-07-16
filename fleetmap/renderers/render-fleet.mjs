import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', 'assets', 'template.html');

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const NODE_KINDS = ['process', 'feed', 'database', 'bot', 'queue', 'web', 'external'];
const HEALTH_STATES = ['online', 'stopped', 'errored', 'unknown'];
const EDGE_KINDS = ['ws', 'http', 'db', 'tg', 'ipc', 'file'];

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isString(v) {
  return typeof v === 'string';
}

export function validateFleet(fleet) {
  const errors = [];

  if (!isPlainObject(fleet)) {
    return { ok: false, errors: ['root: must be an object'] };
  }

  const rootAllowed = new Set(['title', 'subtitle', 'groups', 'nodes', 'edges']);
  for (const key of Object.keys(fleet)) {
    if (!rootAllowed.has(key)) errors.push(`root: unknown property "${key}"`);
  }

  if (!('title' in fleet)) {
    errors.push('title: required');
  } else if (!isString(fleet.title)) {
    errors.push('title: must be a string');
  } else if (fleet.title.length < 1 || fleet.title.length > 120) {
    errors.push('title: length must be between 1 and 120');
  }

  if ('subtitle' in fleet) {
    if (!isString(fleet.subtitle)) errors.push('subtitle: must be a string');
    else if (fleet.subtitle.length > 200) errors.push('subtitle: length must be at most 200');
  }

  const groupIds = new Set();
  if ('groups' in fleet) {
    if (!Array.isArray(fleet.groups)) {
      errors.push('groups: must be an array');
    } else {
      const groupAllowed = new Set(['id', 'label', 'note']);
      fleet.groups.forEach((g, i) => {
        const prefix = `groups[${i}]`;
        if (!isPlainObject(g)) {
          errors.push(`${prefix}: must be an object`);
          return;
        }
        for (const key of Object.keys(g)) {
          if (!groupAllowed.has(key)) errors.push(`${prefix}: unknown property "${key}"`);
        }
        if (!('id' in g)) {
          errors.push(`${prefix}.id: required`);
        } else if (!isString(g.id) || !ID_RE.test(g.id)) {
          errors.push(`${prefix}.id: invalid id "${g.id}" (expected /^[a-z0-9][a-z0-9_-]{0,39}$/)`);
        } else if (groupIds.has(g.id)) {
          errors.push(`${prefix}.id: duplicate group id "${g.id}"`);
        } else {
          groupIds.add(g.id);
        }
        if (!('label' in g)) {
          errors.push(`${prefix}.label: required`);
        } else if (!isString(g.label) || g.label.length < 1 || g.label.length > 60) {
          errors.push(`${prefix}.label: must be a string with length 1..60`);
        }
        if ('note' in g && (!isString(g.note) || g.note.length > 120)) {
          errors.push(`${prefix}.note: must be a string with length <=120`);
        }
      });
    }
  }

  const nodeIds = new Set();
  if (!('nodes' in fleet)) {
    errors.push('nodes: required');
  } else if (!Array.isArray(fleet.nodes)) {
    errors.push('nodes: must be an array');
  } else {
    if (fleet.nodes.length < 1) errors.push('nodes: must contain at least 1 item');
    if (fleet.nodes.length > 80) errors.push('nodes: must contain at most 80 items');

    const nodeAllowed = new Set(['id', 'label', 'kind', 'group', 'health', 'note', 'meta']);
    fleet.nodes.forEach((n, i) => {
      const prefix = `nodes[${i}]`;
      if (!isPlainObject(n)) {
        errors.push(`${prefix}: must be an object`);
        return;
      }
      for (const key of Object.keys(n)) {
        if (!nodeAllowed.has(key)) errors.push(`${prefix}: unknown property "${key}"`);
      }
      if (!('id' in n)) {
        errors.push(`${prefix}.id: required`);
      } else if (!isString(n.id) || !ID_RE.test(n.id)) {
        errors.push(`${prefix}.id: invalid id "${n.id}" (expected /^[a-z0-9][a-z0-9_-]{0,39}$/)`);
      } else if (nodeIds.has(n.id)) {
        errors.push(`${prefix}.id: duplicate node id "${n.id}"`);
      } else {
        nodeIds.add(n.id);
      }
      if (!('label' in n)) {
        errors.push(`${prefix}.label: required`);
      } else if (!isString(n.label) || n.label.length < 1 || n.label.length > 60) {
        errors.push(`${prefix}.label: must be a string with length 1..60`);
      }
      if (!('kind' in n)) {
        errors.push(`${prefix}.kind: required`);
      } else if (!NODE_KINDS.includes(n.kind)) {
        errors.push(`${prefix}.kind: must be one of ${NODE_KINDS.join(', ')}, got "${n.kind}"`);
      }
      if ('group' in n && (!isString(n.group) || !ID_RE.test(n.group))) {
        errors.push(`${prefix}.group: invalid id "${n.group}"`);
      }
      if ('health' in n && !HEALTH_STATES.includes(n.health)) {
        errors.push(`${prefix}.health: must be one of ${HEALTH_STATES.join(', ')}, got "${n.health}"`);
      }
      if ('note' in n && (!isString(n.note) || n.note.length > 120)) {
        errors.push(`${prefix}.note: must be a string with length <=120`);
      }
      if ('meta' in n) {
        if (!isPlainObject(n.meta)) {
          errors.push(`${prefix}.meta: must be an object`);
        } else {
          const metaKeys = Object.keys(n.meta);
          if (metaKeys.length > 6) errors.push(`${prefix}.meta: must have at most 6 properties`);
          for (const k of metaKeys) {
            const v = n.meta[k];
            if (!isString(v)) errors.push(`${prefix}.meta.${k}: must be a string`);
            else if (v.length > 40) errors.push(`${prefix}.meta.${k}: length must be at most 40`);
          }
        }
      }
    });

    fleet.nodes.forEach((n, i) => {
      if (isPlainObject(n) && isString(n.group) && ID_RE.test(n.group) && !groupIds.has(n.group)) {
        errors.push(`nodes[${i}].group: unknown group id "${n.group}"`);
      }
    });
  }

  if ('edges' in fleet) {
    if (!Array.isArray(fleet.edges)) {
      errors.push('edges: must be an array');
    } else {
      if (fleet.edges.length > 200) errors.push('edges: must contain at most 200 items');
      const edgeAllowed = new Set(['from', 'to', 'kind', 'label', 'bidi']);
      fleet.edges.forEach((e, i) => {
        const prefix = `edges[${i}]`;
        if (!isPlainObject(e)) {
          errors.push(`${prefix}: must be an object`);
          return;
        }
        for (const key of Object.keys(e)) {
          if (!edgeAllowed.has(key)) errors.push(`${prefix}: unknown property "${key}"`);
        }
        if (!('from' in e)) {
          errors.push(`${prefix}.from: required`);
        } else if (!isString(e.from) || !ID_RE.test(e.from)) {
          errors.push(`${prefix}.from: invalid id "${e.from}"`);
        } else if (!nodeIds.has(e.from)) {
          errors.push(`${prefix}.from: unknown node id "${e.from}"`);
        }
        if (!('to' in e)) {
          errors.push(`${prefix}.to: required`);
        } else if (!isString(e.to) || !ID_RE.test(e.to)) {
          errors.push(`${prefix}.to: invalid id "${e.to}"`);
        } else if (!nodeIds.has(e.to)) {
          errors.push(`${prefix}.to: unknown node id "${e.to}"`);
        }
        if ('kind' in e && !EDGE_KINDS.includes(e.kind)) {
          errors.push(`${prefix}.kind: must be one of ${EDGE_KINDS.join(', ')}, got "${e.kind}"`);
        }
        if ('label' in e && (!isString(e.label) || e.label.length > 40)) {
          errors.push(`${prefix}.label: must be a string with length <=40`);
        }
        if ('bidi' in e && typeof e.bidi !== 'boolean') {
          errors.push(`${prefix}.bidi: must be a boolean`);
        }
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

const NODE_W = 180;
const NODE_PAD_Y = 10;
const NODE_HEADER_H = 34;
const NODE_NOTE_H = 16;
const NODE_META_ROW_H = 16;
const NODE_META_COLS = 3;
const NODE_GAP_Y = 26;
const GROUP_PAD = 18;
const GROUP_HEADER_H = 44;
const GROUP_GAP_X = 56;
const CANVAS_MARGIN = 40;
const EXTERNAL_GROUP_ID = '__external__';

const KIND_ICONS = {
  process: '⚙',
  feed: '⇄',
  database: '⛁',
  bot: '✈',
  queue: '≡',
  web: '⌂',
  external: '☁',
};
const KIND_LABELS = {
  process: 'Process',
  feed: 'Feed',
  database: 'Database',
  bot: 'Bot',
  queue: 'Queue',
  web: 'Web',
  external: 'External',
};
const EDGE_LABELS = {
  ws: 'WebSocket',
  http: 'HTTP',
  db: 'DB query',
  tg: 'Telegram',
  ipc: 'IPC',
  file: 'File',
};
const HEALTH_LABELS = {
  online: 'Online',
  stopped: 'Stopped',
  errored: 'Errored',
  unknown: 'Unknown',
};

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(str, maxChars) {
  if (str.length <= maxChars) return str;
  return str.slice(0, Math.max(1, maxChars - 1)) + '…';
}

function nodeContentLayout(node) {
  let cursor = NODE_PAD_Y;
  const headerY = cursor + 17;
  cursor += NODE_HEADER_H;
  let noteY = null;
  if (node.note) {
    noteY = cursor + 10;
    cursor += NODE_NOTE_H;
  }
  const metaKeys = node.meta ? Object.keys(node.meta) : [];
  let metaStartY = null;
  let metaRows = 0;
  if (metaKeys.length) {
    metaRows = Math.ceil(metaKeys.length / NODE_META_COLS);
    cursor += 6;
    metaStartY = cursor;
    cursor += metaRows * NODE_META_ROW_H;
  }
  cursor += NODE_PAD_Y;
  return { height: cursor, headerY, noteY, metaStartY, metaKeys };
}

function layoutColumn(groupId, label, note, nodesInGroup, x, external) {
  const nodeBoxes = [];
  let y = CANVAS_MARGIN + GROUP_HEADER_H + GROUP_PAD;
  for (const node of nodesInGroup) {
    const { height } = nodeContentLayout(node);
    nodeBoxes.push({
      id: node.id,
      node,
      x: x + GROUP_PAD,
      y,
      w: NODE_W,
      h: height,
      cx: x + GROUP_PAD + NODE_W / 2,
      cy: y + height / 2,
    });
    y += height + NODE_GAP_Y;
  }
  const contentBottom = nodeBoxes.length ? y - NODE_GAP_Y : CANVAS_MARGIN + GROUP_HEADER_H + GROUP_PAD;
  const height = contentBottom - CANVAS_MARGIN + GROUP_PAD;
  const width = NODE_W + GROUP_PAD * 2;
  return { id: groupId, label, note, external, x, y: CANVAS_MARGIN, width, height, nodeBoxes };
}

function buildLayout(fleet) {
  const groupDefs = Array.isArray(fleet.groups) ? fleet.groups : [];
  const byGroup = new Map();
  for (const g of groupDefs) byGroup.set(g.id, []);
  const externalNodes = [];
  for (const n of fleet.nodes) {
    if (n.group && byGroup.has(n.group)) byGroup.get(n.group).push(n);
    else externalNodes.push(n);
  }

  const columns = [];
  let cursorX = CANVAS_MARGIN;
  for (const g of groupDefs) {
    const col = layoutColumn(g.id, g.label, g.note, byGroup.get(g.id), cursorX, false);
    columns.push(col);
    cursorX += col.width + GROUP_GAP_X;
  }
  if (externalNodes.length) {
    const col = layoutColumn(EXTERNAL_GROUP_ID, 'External', '', externalNodes, cursorX, true);
    columns.push(col);
    cursorX += col.width + GROUP_GAP_X;
  }

  const canvasWidth = columns.length ? cursorX - GROUP_GAP_X + CANVAS_MARGIN : CANVAS_MARGIN * 2;
  const maxColHeight = columns.reduce((m, c) => Math.max(m, c.height), 0);
  const canvasHeight = CANVAS_MARGIN * 2 + maxColHeight;

  const nodesById = new Map();
  for (const col of columns) for (const nb of col.nodeBoxes) nodesById.set(nb.id, nb);

  return { columns, canvasWidth, canvasHeight, nodesById };
}

function edgeGeometry(a, b) {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  let sx, sy, ex, ey, c1x, c1y, c2x, c2y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      sx = a.x + a.w; sy = a.cy; ex = b.x; ey = b.cy;
    } else {
      sx = a.x; sy = a.cy; ex = b.x + b.w; ey = b.cy;
    }
    const off = Math.max(40, Math.abs(ex - sx) * 0.35);
    c1x = sx + (dx >= 0 ? off : -off); c1y = sy;
    c2x = ex - (dx >= 0 ? off : -off); c2y = ey;
  } else {
    if (dy >= 0) {
      sx = a.cx; sy = a.y + a.h; ex = b.cx; ey = b.y;
    } else {
      sx = a.cx; sy = a.y; ex = b.cx; ey = b.y + b.h;
    }
    const off = Math.max(30, Math.abs(ey - sy) * 0.35);
    c1x = sx; c1y = sy + (dy >= 0 ? off : -off);
    c2x = ex; c2y = ey - (dy >= 0 ? off : -off);
  }
  // cubic bezier midpoint at t=0.5: (P0 + 3P1 + 3P2 + P3) / 8
  const midX = (sx + 3 * c1x + 3 * c2x + ex) / 8;
  const midY = (sy + 3 * c1y + 3 * c2y + ey) / 8;
  return { d: `M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`, midX, midY };
}

function buildMarkers() {
  return EDGE_KINDS.map((kind) => `
<marker id="arrow-end-${kind}" class="edge-arrow edge-arrow-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 Z"/></marker>
<marker id="arrow-start-${kind}" class="edge-arrow edge-arrow-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z"/></marker>`).join('');
}

function buildStyle() {
  return `
.fleetmap-svg{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.fleetmap-svg[data-theme="dark"]{ --node-bg:#171a22; --node-border:#2c313f; --group-bg:#10131a; --group-border:#262b38; --group-label:#9aa4bd; --text:#e7e9ee; --text-muted:#8b93a7; --kind-process:#6ea8fe; --kind-feed:#58d0c9; --kind-database:#f2b84b; --kind-bot:#b389f0; --kind-queue:#f0788a; --kind-web:#7bd88f; --kind-external:#9aa4bd; --health-online:#3ecf6e; --health-stopped:#7a8299; --health-errored:#ef5959; --health-unknown:#e8c547; --edge-ws:#6ea8fe; --edge-http:#7bd88f; --edge-db:#f2b84b; --edge-tg:#3fb6f2; --edge-ipc:#b389f0; --edge-file:#9aa4bd; }
.fleetmap-svg[data-theme="light"]{ --node-bg:#ffffff; --node-border:#d7dbe4; --group-bg:#eef0f4; --group-border:#d7dbe4; --group-label:#5a6172; --text:#1b1e27; --text-muted:#5a6172; --kind-process:#2563eb; --kind-feed:#0d9488; --kind-database:#b6791a; --kind-bot:#7c3aed; --kind-queue:#d6336c; --kind-web:#15803d; --kind-external:#5a6172; --health-online:#16a34a; --health-stopped:#8a90a0; --health-errored:#dc2626; --health-unknown:#ca8a04; --edge-ws:#2563eb; --edge-http:#15803d; --edge-db:#b6791a; --edge-tg:#0ea5e9; --edge-ipc:#7c3aed; --edge-file:#5a6172; }
.group-rect{ fill:var(--group-bg); stroke:var(--group-border); stroke-width:1.5; }
.group-external .group-rect{ stroke-dasharray:5 4; }
.group-label{ fill:var(--group-label); font-size:13px; font-weight:700; }
.group-note{ fill:var(--text-muted); font-size:10.5px; }
.node-rect{ fill:var(--node-bg); stroke:var(--node-border); stroke-width:1.4; }
.node-icon{ font-size:15px; }
.node-kind-process .node-icon{ fill:var(--kind-process); }
.node-kind-feed .node-icon{ fill:var(--kind-feed); }
.node-kind-database .node-icon{ fill:var(--kind-database); }
.node-kind-bot .node-icon{ fill:var(--kind-bot); }
.node-kind-queue .node-icon{ fill:var(--kind-queue); }
.node-kind-web .node-icon{ fill:var(--kind-web); }
.node-kind-external .node-icon{ fill:var(--kind-external); }
.node-label{ fill:var(--text); font-size:12.5px; font-weight:700; }
.node-note{ fill:var(--text-muted); font-size:10px; font-style:italic; }
.node-meta-chip{ fill:var(--group-bg); stroke:var(--node-border); stroke-width:1; }
.node-meta{ fill:var(--text-muted); font-size:9px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.health-dot{ stroke:var(--node-bg); stroke-width:1.5; }
.health-online{ fill:var(--health-online); }
.health-stopped{ fill:var(--health-stopped); }
.health-errored{ fill:var(--health-errored); }
.health-unknown{ fill:var(--health-unknown); }
.edge{ fill:none; }
.edge-ws{ stroke:var(--edge-ws); stroke-width:2.1; }
.edge-http{ stroke:var(--edge-http); stroke-width:1.4; }
.edge-db{ stroke:var(--edge-db); stroke-width:1.6; stroke-dasharray:7 4; }
.edge-tg{ stroke:var(--edge-tg); stroke-width:1.6; stroke-dasharray:6 3 1.5 3; }
.edge-ipc{ stroke:var(--edge-ipc); stroke-width:1.6; stroke-dasharray:1.5 4; stroke-linecap:round; }
.edge-file{ stroke:var(--edge-file); stroke-width:1.6; stroke-dasharray:12 6; }
.edge-arrow path{ stroke:none; }
.edge-arrow-ws{ fill:var(--edge-ws); }
.edge-arrow-http{ fill:var(--edge-http); }
.edge-arrow-db{ fill:var(--edge-db); }
.edge-arrow-tg{ fill:var(--edge-tg); }
.edge-arrow-ipc{ fill:var(--edge-ipc); }
.edge-arrow-file{ fill:var(--edge-file); }
.edge-label-bg{ fill:var(--node-bg); opacity:.9; }
.edge-label{ fill:var(--text-muted); font-size:9.5px; }`;
}

function renderGroups(columns) {
  return columns.map((col) => {
    const cls = col.external ? 'group group-external' : 'group';
    let s = `<g class="${cls}"><rect class="group-rect" x="${col.x}" y="${col.y}" width="${col.width}" height="${col.height}" rx="16" ry="16"/>`;
    s += `<text class="group-label" x="${col.x + GROUP_PAD}" y="${col.y + 24}">${escapeXml(col.label)}</text>`;
    if (col.note) s += `<text class="group-note" x="${col.x + GROUP_PAD}" y="${col.y + 39}">${escapeXml(truncate(col.note, 34))}</text>`;
    s += '</g>';
    return s;
  }).join('');
}

function renderNodes(columns) {
  let s = '';
  for (const col of columns) {
    for (const box of col.nodeBoxes) {
      const node = box.node;
      const health = node.health || 'unknown';
      const layout = nodeContentLayout(node);
      const clipId = `clip-${node.id}`;
      s += `<g class="node node-kind-${node.kind}">`;
      s += `<clipPath id="${clipId}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="12" ry="12"/></clipPath>`;
      s += `<rect class="node-rect" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="12" ry="12"/>`;
      s += `<g clip-path="url(#${clipId})">`;
      s += `<text class="node-icon" x="${box.x + 14}" y="${box.y + layout.headerY}">${KIND_ICONS[node.kind]}</text>`;
      s += `<text class="node-label" x="${box.x + 36}" y="${box.y + layout.headerY}">${escapeXml(truncate(node.label, 17))}</text>`;
      if (layout.noteY !== null) {
        s += `<text class="node-note" x="${box.x + 14}" y="${box.y + layout.noteY}">${escapeXml(truncate(node.note, 24))}</text>`;
      }
      if (layout.metaStartY !== null) {
        const cellW = (box.w - 16) / NODE_META_COLS;
        layout.metaKeys.forEach((key, idx) => {
          const row = Math.floor(idx / NODE_META_COLS);
          const col2 = idx % NODE_META_COLS;
          const cx = box.x + 8 + col2 * cellW;
          const cy = box.y + layout.metaStartY + row * NODE_META_ROW_H;
          const text = truncate(`${key}:${node.meta[key]}`, Math.max(3, Math.floor((cellW - 6) / 5.3)));
          s += `<rect class="node-meta-chip" x="${cx}" y="${cy}" width="${cellW - 4}" height="13" rx="4" ry="4"/>`;
          s += `<text class="node-meta" x="${cx + 4}" y="${cy + 10}">${escapeXml(text)}</text>`;
        });
      }
      s += '</g>';
      s += `<circle class="health-dot health-${health}" cx="${box.x + box.w - 10}" cy="${box.y + 10}" r="5"/>`;
      s += '</g>';
    }
  }
  return s;
}

function renderEdges(edges, nodesById) {
  let s = '';
  edges.forEach((edge, i) => {
    const a = nodesById.get(edge.from);
    const b = nodesById.get(edge.to);
    const kind = edge.kind || 'http';
    const { d, midX, midY } = edgeGeometry(a, b);
    s += `<path class="edge edge-${kind}" d="${d}" marker-end="url(#arrow-end-${kind})"`;
    if (edge.bidi) s += ` marker-start="url(#arrow-start-${kind})"`;
    s += `/>`;
    if (edge.label) {
      const text = truncate(edge.label, 22);
      const w = text.length * 5.6 + 8;
      s += `<rect class="edge-label-bg" x="${midX - w / 2}" y="${midY - 8}" width="${w}" height="14" rx="4" ry="4"/>`;
      s += `<text class="edge-label" x="${midX}" y="${midY + 3}" text-anchor="middle">${escapeXml(text)}</text>`;
    }
    void i;
  });
  return s;
}

function buildSvg(fleet, layout) {
  const edges = Array.isArray(fleet.edges) ? fleet.edges : [];
  const parts = [];
  parts.push(`<svg class="fleetmap-svg" data-theme="dark" xmlns="http://www.w3.org/2000/svg" width="${layout.canvasWidth}" height="${layout.canvasHeight}" viewBox="0 0 ${layout.canvasWidth} ${layout.canvasHeight}">`);
  parts.push(`<style>${buildStyle()}</style>`);
  parts.push(`<defs>${buildMarkers()}</defs>`);
  parts.push(renderGroups(layout.columns));
  parts.push(`<g class="edges">${renderEdges(edges, layout.nodesById)}</g>`);
  parts.push(`<g class="nodes">${renderNodes(layout.columns)}</g>`);
  parts.push('</svg>');
  return parts.join('\n');
}

function uniqueInOrder(values, order) {
  const set = new Set(values);
  return order.filter((v) => set.has(v));
}

function buildLegend(fleet) {
  const usedKinds = uniqueInOrder(fleet.nodes.map((n) => n.kind), NODE_KINDS);
  const usedEdgeKinds = uniqueInOrder((fleet.edges || []).map((e) => e.kind || 'http'), EDGE_KINDS);
  const usedHealth = uniqueInOrder(fleet.nodes.map((n) => n.health || 'unknown'), HEALTH_STATES);

  const kindItems = usedKinds.map((k) =>
    `<span class="legend-item"><span class="legend-icon legend-kind-${k}">${KIND_ICONS[k]}</span>${KIND_LABELS[k]}</span>`
  ).join('');
  const edgeItems = usedEdgeKinds.map((k) =>
    `<span class="legend-item"><span class="legend-line legend-edge-${k}"></span>${EDGE_LABELS[k]}</span>`
  ).join('');
  const healthItems = usedHealth.map((h) =>
    `<span class="legend-item"><span class="legend-dot legend-health-${h}"></span>${HEALTH_LABELS[h]}</span>`
  ).join('');

  return `<div class="legend-group"><span class="legend-title">Nodes</span>${kindItems}</div>` +
    `<div class="legend-group"><span class="legend-title">Edges</span>${edgeItems}</div>` +
    `<div class="legend-group"><span class="legend-title">Health</span>${healthItems}</div>`;
}

export function renderFleet(fleet) {
  const { ok, errors } = validateFleet(fleet);
  if (!ok) throw new Error('Invalid fleet: ' + errors.join('; '));

  const layout = buildLayout(fleet);
  const svg = buildSvg(fleet, layout);
  const legend = buildLegend(fleet);
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const subtitleHtml = fleet.subtitle ? `<p class="subtitle">${escapeXml(fleet.subtitle)}</p>` : '';

  return template
    .replaceAll('{{TITLE}}', escapeXml(fleet.title))
    .replaceAll('{{SUBTITLE}}', subtitleHtml)
    .replaceAll('{{SVG}}', svg)
    .replaceAll('{{LEGEND}}', legend);
}
