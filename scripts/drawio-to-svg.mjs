#!/usr/bin/env node
/**
 * drawio-to-svg.mjs
 * -----------------
 * A self-contained converter that takes a draw.io (.drawio) file in mxGraphModel
 * format and emits an SVG that:
 *   - renders every cell as a real SVG element (rect, ellipse, text, path, line, etc.)
 *   - keeps each cell's id, geometry, style and value as mxGraph-style attributes
 *     so the file can be re-imported into draw.io and continue to be edited
 *   - is also fully editable as plain SVG in tools like Inkscape / Illustrator
 *
 * This is intentionally a pure-Node, zero-dependency implementation so it can run
 * anywhere, even in a sandbox without draw.io installed.
 *
 * Usage:  node drawio-to-svg.mjs <input.drawio> <output.svg>
 */
import { promises as fs } from "node:fs";

const STYLE_COLORS = {
  // very small subset of the mxGraph stylesheet — just enough to honour fillColor / strokeColor
};

// ---------- helpers ----------
const stripQuotes = (s) => s.replace(/^["']|["']$/g, "");

function parseStyle(style) {
  const map = {};
  if (!style) return map;
  for (const part of style.split(";")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    map[k] = v;
  }
  return map;
}

function getColor(map, key, fallback) {
  if (map[key]) return map[key];
  if (map[key + "Style"]) return map[key + "Style"];
  return fallback;
}

function escapeXml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeAttr(s) {
  return escapeXml(s);
}

// crude XML pull-parser for extracting <mxCell .../> and <mxCell ...>...</mxCell>
function extractCells(rootStart, rootEnd, xml) {
  const cells = [];
  // match self-closed first (more common in .drawio)
  const selfRe = /<mxCell\b([^>]*?)\/>/g;
  let m;
  while ((m = selfRe.exec(xml)) !== null) {
    cells.push(parseAttrs(m[1]));
  }
  // match non-self-closed (with inner mxGeometry, etc.)
  const openRe = /<mxCell\b([^>]*?)>(?!\/)/g;
  while ((m = openRe.exec(xml)) !== null) {
    const attrsText = m[1];
    const start = m.index + m[0].length;
    // find the matching </mxCell>
    const closeIdx = xml.indexOf("</mxCell>", start);
    if (closeIdx < 0) continue;
    const inner = xml.slice(start, closeIdx);
    const cell = parseAttrs(attrsText);
    if (inner.trim().length > 0) cell._innerXml = inner;
    cells.push(cell);
  }
  return cells;
}

function parseAttrs(s) {
  const cell = {};
  const attrRe = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
  let a;
  while ((a = attrRe.exec(s)) !== null) {
    cell[a[1]] = a[2];
  }
  return cell;
}

function extractGeometry(cell) {
  // <mxGeometry x=".." y=".." width=".." height=".." as="geometry" />
  const inner = cell._innerXml || "";
  const geoRe = /<mxGeometry\b([^>]*?)\/?>/;
  const m = geoRe.exec(inner);
  if (!m) return null;
  const out = {};
  const attrRe = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
  let a;
  while ((a = attrRe.exec(m[1])) !== null) {
    out[a[1]] = a[2];
  }
  out.x = parseFloat(out.x || 0);
  out.y = parseFloat(out.y || 0);
  out.width = parseFloat(out.width || 0);
  out.height = parseFloat(out.height || 0);
  return out;
}

// ---------- shape renderers ----------
function renderRect(cell, geo, style, attrs) {
  const fill = getColor(style, "fillColor", "#ffffff");
  const stroke = getColor(style, "strokeColor", "#0F2C4D");
  const sw = style.strokeWidth || 1;
  const rx = style.rounded === "1" ? 8 : 0;
  return `<rect x="${geo.x}" y="${geo.y}" width="${geo.width}" height="${geo.height}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${extraAttrs(attrs)} />`;
}

function renderEllipse(cell, geo, style, attrs) {
  const fill = getColor(style, "fillColor", "#ffffff");
  const stroke = getColor(style, "strokeColor", "#0F2C4D");
  const sw = style.strokeWidth || 1;
  const cx = geo.x + geo.width / 2;
  const cy = geo.y + geo.height / 2;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${geo.width / 2}" ry="${geo.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${extraAttrs(attrs)} />`;
}

function renderCylinder(cell, geo, style, attrs) {
  // Draw a simple 3D-looking cylinder: two ellipses + rect.
  const fill = getColor(style, "fillColor", "#ffffff");
  const stroke = getColor(style, "strokeColor", "#0F2C4D");
  const sw = style.strokeWidth || 1;
  const x = geo.x;
  const y = geo.y;
  const w = geo.width;
  const h = geo.height;
  const ry = Math.min(15, h / 6);
  return (
    `<path d="M ${x} ${y + ry} ` +
    `A ${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry} ` +
    `L ${x + w} ${y + h - ry} ` +
    `A ${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry} Z" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${extraAttrs(attrs)} />` +
    `<ellipse cx="${x + w / 2}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${extraAttrs(attrs)} />`
  );
}

function renderLine(cell, geo, style, attrs) {
  // ortho edge: simple straight line
  const stroke = getColor(style, "strokeColor", "#0F2C4D");
  const sw = style.strokeWidth || 1;
  return `<line x1="${geo.x}" y1="${geo.y}" x2="${geo.x + geo.width}" y2="${geo.y + geo.height}" stroke="${stroke}" stroke-width="${sw}"${extraAttrs(attrs)} />`;
}

function extraAttrs(attrs) {
  // attrs already include "id" — also pass data-* via style attr; keep minimal
  return ` id="${attrs.id}" data-mx-id="${attrs.id}"`;
}

function renderText(cell, geo, style, attrs) {
  // multi-line via tspan
  const raw = cell.value || "";
  const lines = raw.split(/&#10;|\n/);
  const fontSize = parseInt(style.fontSize || 12, 10);
  const fontColor = style.fontColor || "#0F2C4D";
  const fontStyle = (style.fontStyle || "").includes("1") ? "italic" : "normal";
  const fontWeight = (style.fontStyle || "").includes("1") ? "normal" : (style.fontStyle || "").includes("bold") || /fontStyle=1/.test(cell._innerXml || "") ? "600" : "400";
  // detect fontStyle attribute (1 = bold, 2 = italic, 3 = both)
  let weight = "400", italic = "";
  if (style.fontStyle === "1") weight = "600";
  if (style.fontStyle === "2") italic = " font-style=\"italic\"";
  if (style.fontStyle === "3") { weight = "600"; italic = " font-style=\"italic\""; }
  const textAnchor = style.align === "center" ? "middle" : (style.align === "right" ? "end" : "start");
  const tx = textAnchor === "middle" ? geo.x + geo.width / 2 : (textAnchor === "end" ? geo.x + geo.width : geo.x);
  const ty = geo.y + geo.height / 2;
  const tspans = lines
    .map(
      (ln, i) =>
        `<tspan x="${tx}" dy="${i === 0 ? 0 : fontSize * 1.2}">${escapeXml(ln)}</tspan>`
    )
    .join("");
  return `<text x="${tx}" y="${ty}" text-anchor="${textAnchor}" dominant-baseline="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}"${italic} fill="${fontColor}"${extraAttrs(
    attrs
  )}>${tspans}</text>`;
}

function renderEdge(cell, geo, style, attrs) {
  // For edges the geometry is the bounding box of the edge; we don't have endpoint coordinates
  // in the lightweight mxGeometry form. We render a faint trace so the cell is preserved.
  const stroke = getColor(style, "strokeColor", "#0F2C4D");
  const sw = style.strokeWidth || 1.5;
  return `<path d="M ${geo.x} ${geo.y} L ${geo.x + geo.width} ${geo.y + geo.height}" stroke="${stroke}" stroke-width="${sw}" fill="none" marker-end="url(#mx-arrow)" stroke-linecap="round" data-mx-edge="1"${extraAttrs(attrs)} />`;
}

// ---------- main ----------
async function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error("Usage: node drawio-to-svg.mjs <input.drawio> <output.svg>");
    process.exit(1);
  }
  const xml = await fs.readFile(inputPath, "utf8");

  // page size
  const pageW = parseInt((/<mxGraphModel[^>]*pageWidth="(\d+)"/.exec(xml) || [])[1] || "1800", 10);
  const pageH = parseInt((/<mxGraphModel[^>]*pageHeight="(\d+)"/.exec(xml) || [])[1] || "1200", 10);

  const cells = extractCells(0, xml.length, xml);

  // group: vertex vs edge
  const vertices = [];
  const edges = [];
  for (const c of cells) {
    if (c.id === "0" || c.id === "1") continue;
    if (!c.style) continue;
    const g = extractGeometry(c);
    if (!g) continue;
    const cell = { ...c, geometry: g };
    if (c.edge === "1") edges.push(cell);
    else vertices.push(cell);
  }

  // Collect unique value/edge label, but only render the label cell for the edge if the label
  // is its own mxCell. For our generated file, edge labels are inline (style on edge), so
  // edges render without separate text.

  const renderedVertices = vertices
    .map((c) => {
      const style = parseStyle(c.style);
      const attrs = { id: c.id };
      let body = "";
      if (style.shape === "cylinder3") body = renderCylinder(c, c.geometry, style, attrs);
      else if (style.shape === "ellipse") body = renderEllipse(c, c.geometry, style, attrs);
      else if (c.value && c.value.length > 0) {
        // text-only cell
        body = renderText(c, c.geometry, style, attrs);
      } else {
        body = renderRect(c, c.geometry, style, attrs);
      }
      return `  <g class="mx-cell">${body}</g>`;
    })
    .join("\n");

  const renderedEdges = edges
    .map((c) => {
      const style = parseStyle(c.style);
      const attrs = { id: c.id };
      const path = renderEdge(c, c.geometry, style, attrs);
      let label = "";
      if (c.value) {
        // place edge label near the midpoint of its bounding box
        const tx = c.geometry.x + c.geometry.width / 2;
        const ty = c.geometry.y + c.geometry.height / 2;
        const fontColor = style.fontColor || "#0F2C4D";
        const fontSize = parseInt(style.fontSize || 12, 10);
        label = `<text x="${tx}" y="${ty - 4}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="600" fill="${fontColor}" data-mx-id="${c.id}-label">${escapeXml(c.value)}</text>`;
      }
      return `  <g class="mx-edge">${path}${label}</g>`;
    })
    .join("\n");

  // Optional: also include the raw <mxCell> xml as a hidden block so draw.io can re-import
  const cellSummary = cells
    .filter((c) => c.id !== "0" && c.id !== "1" && c.style)
    .map((c) => {
      const g = extractGeometry(c);
      const geometryXml = g
        ? `<mxGeometry x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" as="geometry" />`
        : "";
      return `        <mxCell id="${c.id}" value="${escapeAttr(c.value || "")}" style="${escapeAttr(
        c.style || ""
      )}" vertex="${c.edge === "1" ? "0" : "1"}" parent="1"${
        c.edge === "1" ? ` source="${c.source || ""}" target="${c.target || ""}" edge="1"` : ""
      }>${geometryXml}</mxCell>`;
    })
    .join("\n");

  const embeddedDiagram = `<mxfile host="drawio-scientific-illustrator" version="24.7.17"><diagram id="embedded" name="embedded"><mxGraphModel dx="${pageW}" dy="${pageH}" pageWidth="${pageW}" pageHeight="${pageH}"><root><mxCell id="0" /><mxCell id="1" parent="0" />
${cellSummary}
      </root></mxGraphModel></diagram></mxfile>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">
  <defs>
    <marker id="mx-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 Z" fill="#0F2C4D" />
    </marker>
    <metadata>
      <mxfile host="drawio-scientific-illustrator" version="24.7.17">
        <diagram id="umami-ml-workflow" name="Umami Peptide ML Screening"><mxGraphModel><root><mxCell id="0" /><mxCell id="1" parent="0" /></root></mxGraphModel></diagram>
      </mxfile>
      <mxGraphModel embed="true" pageWidth="${pageW}" pageHeight="${pageH}">
        <root>
          <mxCell id="0" />
          <mxCell id="1" parent="0" />
${cellSummary}
        </root>
      </mxGraphModel>
    </metadata>
  </defs>
  <rect x="0" y="0" width="${pageW}" height="${pageH}" fill="#ffffff" />
${renderedVertices}
${renderedEdges}
</svg>
`;

  await fs.writeFile(outputPath, svg, "utf8");
  console.log(`Wrote ${outputPath} (${svg.length} bytes, ${vertices.length} vertices, ${edges.length} edges)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
