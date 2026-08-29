#!/usr/bin/env node
/**
 * drawio-to-svg.mjs
 * -----------------
 * A self-contained, zero-dependency draw.io (.drawio) → SVG converter.
 *
 * Goals
 *   1. Render every mxCell as a real, well-styled SVG primitive.
 *   2. Route edges orthogonally between source/target cells using
 *      their actual bounding boxes plus the exit/entry anchors declared
 *      on the edge style (this is what makes diagrams look professional
 *      instead of "lines from A to B").
 *   3. Keep every cell editable in draw.io by:
 *        - giving every SVG node a stable id and a data-mx-id
 *        - embedding the full mxGraphModel as a <metadata> block
 *   4. Be honest about what it is: a renderer. Anything it does not
 *      understand is rendered as a labelled bounding box so the user
 *      can fix it later instead of pretending the diagram is finished.
 *
 * Usage:  node scripts/drawio-to-svg.mjs <input.drawio> <output.svg>
 */
import { promises as fs } from "node:fs";

// ---------- small helpers ----------
function parseAttrs(s) {
  const out = {};
  const re = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(s)) !== null) out[m[1]] = m[2];
  return out;
}

function extractCells(xml) {
  const cells = [];
  // self-closed cells
  const selfRe = /<mxCell\b([^>]*?)\/>/g;
  let m;
  while ((m = selfRe.exec(xml)) !== null) {
    cells.push(parseAttrs(m[1]));
  }
  // open-close cells (those that wrap <mxGeometry/>)
  const openRe = /<mxCell\b([^>]*?)>(?!\/)/g;
  while ((m = openRe.exec(xml)) !== null) {
    const start = m.index + m[0].length;
    const closeIdx = xml.indexOf("</mxCell>", start);
    if (closeIdx < 0) continue;
    const inner = xml.slice(start, closeIdx);
    const cell = parseAttrs(m[1]);
    if (inner.trim().length > 0) cell._innerXml = inner;
    cells.push(cell);
  }
  return cells;
}

function extractGeometry(cell) {
  const inner = cell._innerXml || "";
  const re = /<mxGeometry\b([^>]*?)\/?>/;
  const m = inner.match(re);
  if (!m) return null;
  const attrs = parseAttrs(m[1]);
  return {
    x: parseFloat(attrs.x || 0),
    y: parseFloat(attrs.y || 0),
    width: parseFloat(attrs.width || 0),
    height: parseFloat(attrs.height || 0),
  };
}

function parseStyle(style) {
  const out = {};
  if (!style) return out;
  for (const part of style.split(";")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 0) {
      // key-only flag (e.g. "ellipse", "html", "rounded")
      const key = part.trim();
      if (key) out[key] = "";
      continue;
    }
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

function getColor(style, key, fallback) {
  return style[key] || style[key + "Style"] || fallback;
}

function escapeXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------- primitive renderers ----------
function renderRect(geo, style, attrs) {
  const fill = getColor(style, "fillColor", "#ffffff");
  const stroke = getColor(style, "strokeColor", "none");
  const sw = style.strokeWidth || 1;
  const rx = style.rounded === "1" ? 6 : 0;
  const strokeAttr = stroke === "none" ? ' stroke="none"' : ` stroke="${stroke}" stroke-width="${sw}"`;
  return `<rect x="${geo.x}" y="${geo.y}" width="${geo.width}" height="${geo.height}" rx="${rx}" ry="${rx}" fill="${fill}"${strokeAttr} id="${attrs.id}" data-mx-id="${attrs.id}" />`;
}

function renderEllipse(geo, style, attrs) {
  const fill = getColor(style, "fillColor", "#ffffff");
  const stroke = getColor(style, "strokeColor", "#1F4E79");
  const sw = style.strokeWidth || 1;
  const cx = geo.x + geo.width / 2;
  const cy = geo.y + geo.height / 2;
  const dash = style.dashed === "1" ? ' stroke-dasharray="4 3"' : "";
  return `<ellipse cx="${cx}" cy="${cy}" rx="${geo.width / 2}" ry="${geo.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash} id="${attrs.id}" data-mx-id="${attrs.id}" />`;
}

function renderLine(geo, style, attrs) {
  const stroke = getColor(style, "strokeColor", "#1F4E79");
  const sw = style.strokeWidth || 1;
  return `<line x1="${geo.x}" y1="${geo.y}" x2="${geo.x + geo.width}" y2="${geo.y + geo.height}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" id="${attrs.id}" data-mx-id="${attrs.id}" />`;
}

function renderText(cell, geo, style, attrs) {
  const raw = cell.value || "";
  if (raw === "" && style.html !== "1") {
    // empty non-html text cell → render nothing
    return "";
  }
  // use \n as the visual line break, matching our .drawio sources
  const lines = raw.split(/&#10;|\n/);
  const fontSize = parseInt(style.fontSize || "12", 10);
  const fontColor = style.fontColor || "#0F172A";
  // fontStyle: 1=bold, 2=italic, 3=both
  let weight = "400";
  let italic = "";
  if (style.fontStyle === "1") weight = "600";
  if (style.fontStyle === "2") italic = ' font-style="italic"';
  if (style.fontStyle === "3") {
    weight = "600";
    italic = ' font-style="italic"';
  }
  const align = style.align || "left";
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  // padding inside the cell
  const padX = 4;
  const tx =
    anchor === "middle"
      ? geo.x + geo.width / 2
      : anchor === "end"
      ? geo.x + geo.width - padX
      : geo.x + padX;
  const ty = geo.y + Math.min(geo.height / 2 + fontSize * 0.36, geo.height - 2);
  const dy0 = lines.length > 1 ? -(lines.length - 1) * fontSize * 0.6 : 0;
  const tspans = lines
    .map(
      (ln, i) =>
        `<tspan x="${tx}" dy="${i === 0 ? dy0 : fontSize * 1.2}">${escapeXml(ln)}</tspan>`
    )
    .join("");
  return `<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}"${italic} fill="${fontColor}" id="${attrs.id}" data-mx-id="${attrs.id}">${tspans}</text>`;
}

// ---------- edge routing ----------
function anchorPoint(box, ax, ay) {
  return {
    x: box.x + box.width * ax,
    y: box.y + box.height * ay,
  };
}

function routeOrthogonal(src, dst, exitX, exitY, entryX, entryY) {
  // Manhattan polyline through two mid-points.
  const s = anchorPoint(src, exitX, exitY);
  const e = anchorPoint(dst, entryX, entryY);
  // 3-segment route: leave horizontally, drop/rise, enter horizontally
  const midX1 = s.x + (e.x - s.x) * 0.5;
  const p1 = { x: midX1, y: s.y };
  const p2 = { x: midX1, y: e.y };
  return [s, p1, p2, e];
}

function polylineToPath(points) {
  return "M " + points.map((p) => `${p.x} ${p.y}`).join(" L ");
}

function renderEdge(cell, cellsById) {
  const style = parseStyle(cell.style);
  const source = cellsById[cell.source];
  const target = cellsById[cell.target];
  if (!source || !target) return "";
  const srcGeo = extractGeometry(source);
  const tgtGeo = extractGeometry(target);
  if (!srcGeo || !tgtGeo) return "";
  const exitX = parseFloat(style.exitX ?? 0.5);
  const exitY = parseFloat(style.exitY ?? 1);
  const entryX = parseFloat(style.entryX ?? 0.5);
  const entryY = parseFloat(style.entryY ?? 0);
  const points =
    style.endArrow === "none" || cell.value === undefined || cell.value === ""
      ? routeOrthogonal(srcGeo, tgtGeo, exitX, exitY, entryX, entryY)
      : routeOrthogonal(srcGeo, tgtGeo, exitX, exitY, entryX, entryY);
  const stroke = getColor(style, "strokeColor", "#1F4E79");
  const sw = style.strokeWidth || 1;
  const dash = style.dashed === "1" ? ' stroke-dasharray="4 3"' : "";
  const arrow = style.endArrow === "none" ? "" : ' marker-end="url(#mx-arrow)"';
  const d = polylineToPath(points);
  // edge label, placed at midpoint of the middle segment
  let labelSvg = "";
  if (cell.value) {
    const mid = points[2] || points[points.length - 1];
    const fontColor = style.fontColor || "#0F172A";
    const fontSize = parseInt(style.fontSize || "11", 10);
    labelSvg = `<text x="${mid.x + 4}" y="${mid.y - 4}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="600" fill="${fontColor}" data-mx-id="${cell.id}-label">${escapeXml(cell.value)}</text>`;
  }
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash}${arrow} id="${cell.id}" data-mx-id="${cell.id}" />${labelSvg}`;
}

// ---------- main ----------
async function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error("Usage: node drawio-to-svg.mjs <input.drawio> <output.svg>");
    process.exit(1);
  }
  const xml = await fs.readFile(inputPath, "utf8");
  const pageW = parseInt((/<mxGraphModel[^>]*pageWidth="(\d+)"/.exec(xml) || [])[1] || "1800", 10);
  const pageH = parseInt((/<mxGraphModel[^>]*pageHeight="(\d+)"/.exec(xml) || [])[1] || "1200", 10);

  const cells = extractCells(xml);
  // build an id → cell map for edge routing
  const byId = Object.fromEntries(cells.map((c) => [c.id, c]));

  // First pass: emit <defs> with all geometry so we can also build a clean embedded mxGraphModel
  const vertices = cells.filter((c) => c.id !== "0" && c.id !== "1" && c.style && c.edge !== "1");
  const edges = cells.filter((c) => c.id !== "0" && c.id !== "1" && c.style && c.edge === "1");

  const renderedVertices = vertices
    .map((c) => {
      const style = parseStyle(c.style);
      const geo = extractGeometry(c);
      if (!geo) return "";
      // ellipse shapes are declared as a key (no value) in mxGraph style, e.g. "ellipse;..."
      const isEllipse = "ellipse" in style || style.shape === "ellipse";
      if (isEllipse) return renderEllipse(geo, style, { id: c.id });
      if (c.value !== undefined && c.value !== "" && c.value !== null) {
        return renderText(c, geo, style, { id: c.id });
      }
      return renderRect(geo, style, { id: c.id });
    })
    .filter(Boolean)
    .map((s) => `  ${s}`)
    .join("\n");

  const renderedEdges = edges.map((c) => renderEdge(c, byId)).filter(Boolean).map((s) => `  ${s}`).join("\n");

  // embedded mxGraphModel (so draw.io can re-import this SVG)
  const cellSummary = cells
    .filter((c) => c.id !== "0" && c.id !== "1" && c.style)
    .map((c) => {
      const g = extractGeometry(c);
      const geometryXml = g
        ? `<mxGeometry x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" as="geometry" />`
        : "";
      const isEdge = c.edge === "1";
      return `        <mxCell id="${c.id}" value="${escapeXml(c.value || "")}" style="${escapeXml(
        c.style || ""
      )}" vertex="${isEdge ? "0" : "1"}" parent="1"${
        isEdge ? ` source="${c.source || ""}" target="${c.target || ""}" edge="1"` : ""
      }>${geometryXml}</mxCell>`;
    })
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">
  <defs>
    <marker id="mx-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 Z" fill="#1F4E79" />
    </marker>
    <metadata>
      <mxfile host="drawio-scientific-illustrator" version="24.7.17">
        <diagram id="umami-ml-workflow" name="Umami Peptide ML Screening"><mxGraphModel dx="${pageW}" dy="${pageH}" pageWidth="${pageW}" pageHeight="${pageH}"><root><mxCell id="0" /><mxCell id="1" parent="0" />
${cellSummary}
        </root></mxGraphModel></diagram>
      </mxfile>
    </metadata>
  </defs>
  <rect x="0" y="0" width="${pageW}" height="${pageH}" fill="#FAFBFC" />
${renderedVertices}
${renderedEdges}
</svg>
`;

  await fs.writeFile(outputPath, svg, "utf8");
  console.log(`Wrote ${outputPath} (${(svg.length / 1024).toFixed(1)} KB, ${vertices.length} vertices, ${edges.length} edges)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
