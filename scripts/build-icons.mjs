// Renders the app icons in public/ from scripts/icons/icon.svg. Run with `npm run icons`.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const source = readFileSync(here('./icons/icon.svg'), 'utf8');

const rounded = source.replace(
  '<!--BG-->',
  '<rect width="512" height="512" rx="112" fill="url(#bg)"/>',
);
// Full-bleed: the OS applies its own mask (maskable / iOS), so no corners of our own.
const square = source.replace('<!--BG-->', '<rect width="512" height="512" fill="url(#bg)"/>');

const render = (svg, size, file) => {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(here(`../public/${file}`), png);
  process.stdout.write(`${file} (${size}px, ${png.length} bytes)` + '\n');
};

writeFileSync(here('../public/favicon.svg'), rounded);
render(rounded, 512, 'icon-512.png');
render(rounded, 192, 'icon-192.png');
render(square, 512, 'icon-maskable-512.png');
render(square, 180, 'apple-touch-icon.png');
