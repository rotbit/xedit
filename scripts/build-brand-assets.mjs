/** Generate web and desktop assets from the source SVG, keeping the icon's and wordmark's own outlines and colors. */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paper = "#f5faff";

async function readOutline(file) {
  const svg = await readFile(path.join(root, file), "utf8");
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
  const paths = [...svg.matchAll(/<path id="([^"]+)" d="([^"]+)" fill="([^"]+)"/g)]
    .map(([, id, outline, fill]) => ({ id, outline, fill }));
  return { svg, viewBox, paths };
}

function squareIcon(mark, desktop = false) {
  const size = desktop ? 1024 : 128;
  const inset = desktop ? 100 : 0;
  const radius = desktop ? 185 : 26;
  // The canvas is near-square; leave an icon safe area instead of filling the rounded backplate.
  const width = desktop ? 568 : 88;
  // Keep each page's source fill so the site and exported icons share the same two-tone colors.
  const pages = mark.paths.map(({ outline, fill }) =>
    `<path d="${outline}" fill="${fill}" fill-rule="evenodd"/>`).join("\n    ");
  const [, , sourceWidth, sourceHeight] = mark.viewBox.split(" ").map(Number);
  const height = width * sourceHeight / sourceWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect x="${inset}" y="${inset}" width="${size - inset * 2}" height="${size - inset * 2}"
    rx="${radius}" fill="${paper}"/>
  <svg x="${(size - width) / 2}" y="${(size - height) / 2}" width="${width}" height="${height}"
    viewBox="${mark.viewBox}">${pages}</svg>
</svg>\n`;
}

function renderPng(svg, width) {
  return sharp(Buffer.from(svg), { density: 192 }).resize({ width }).png().toBuffer();
}

/** Each ICO directory entry points to a PNG, covering standard and high-DPI tab sizes. */
async function createFavicon(svg) {
  const sizes = [16, 32, 48, 64];
  const images = await Promise.all(sizes.map((size) => renderPng(svg, size)));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    header[entry] = sizes[index];
    header[entry + 1] = sizes[index];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  return Buffer.concat([header, ...images]);
}

async function buildWeb(wordmark, icon) {
  // Export the icon and wordmark separately so components can recolor each for dark themes.
  const outlines = wordmark.paths.flatMap(({ id, outline }) => {
    const chunks = outline.match(/.{1,110}(?:\s|$)/g).map((chunk) => chunk.trim());
    return [
      `export const LOGO_${id.toUpperCase()}_PATH = [`,
      ...chunks.map((chunk) => `  ${JSON.stringify(chunk)},`),
      '].join(" ");',
    ];
  });
  const moduleSource = [
    "// 由 scripts/build-brand-assets.mjs 生成；源文件为 public/logo.svg。",
    `export const LOGO_VIEW_BOX = ${JSON.stringify(wordmark.viewBox)};`,
    ...outlines,
    "",
  ].join("\n");
  await writeFile(path.join(root, "src/lib/brand.ts"), moduleSource);
  await writeFile(path.join(root, "src/app/icon.svg"), icon);
  await writeFile(path.join(root, "src/app/favicon.ico"), await createFavicon(icon));
  // The OS rounds Apple home-screen icon corners, so keep an opaque square background.
  const appleIcon = icon.replace('rx="26"', 'rx="0"');
  await writeFile(path.join(root, "src/app/apple-icon.png"), await renderPng(appleIcon, 180));
}

async function buildDesktop(directory, wordmark, mark) {
  const build = path.join(directory, "build");
  await mkdir(build, { recursive: true });
  const icon = squareIcon(mark, true);
  await writeFile(path.join(directory, "splash-logo.svg"), wordmark.svg);
  await writeFile(path.join(directory, "splash-logo.png"), await renderPng(wordmark.svg, 882));
  await writeFile(path.join(build, "icon.svg"), icon);
  await writeFile(path.join(build, "dock.png"), await renderPng(icon, 1024));

  // iconutil uses the system tool to build a full ICNS; the intermediate iconset is not kept in the repo.
  const temporary = await mkdtemp(path.join(tmpdir(), "xedit-icon-"));
  const iconset = path.join(temporary, "icon.iconset");
  await mkdir(iconset);
  try {
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        const suffix = scale === 2 ? "@2x" : "";
        await writeFile(path.join(iconset, `icon_${size}x${size}${suffix}.png`), await renderPng(icon, size * scale));
      }
    }
    execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.join(build, "icon.icns")]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const wordmark = await readOutline("public/logo.svg");
const mark = await readOutline("public/logo-mark.svg");
await buildWeb(wordmark, squareIcon(mark));
if (process.argv[2]) await buildDesktop(path.resolve(process.argv[2]), wordmark, mark);
console.log("品牌资源已生成" + (process.argv[2] ? `，桌面输出：${path.resolve(process.argv[2])}` : ""));
