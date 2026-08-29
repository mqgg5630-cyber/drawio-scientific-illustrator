import { promises as fs } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const [, , inputPath, outputPath, width, fontPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Usage: node svg-to-png.mjs <input.svg> <output.png> [width] [fontDir]");
  process.exit(1);
}
const w = parseInt(width || "1800", 10);
const svg = await fs.readFile(inputPath, "utf8");
const options = { fitTo: { mode: "width", value: w } };
if (fontPath) {
  // resvg-js takes an array of font files
  options.font = { fontFiles: [fontPath], defaultFontFamily: "WenQuanYi" };
}
const png = new Resvg(svg, options).render().asPng();
await fs.writeFile(outputPath, png);
console.log(`Wrote ${outputPath} (${(png.length / 1024).toFixed(1)} KB @ ${w}px)`);
