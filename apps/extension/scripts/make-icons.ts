// Dev-only: rasterises public/icon.svg into the PNG sizes the manifest declares.
// Run with `npm run icons -w apps/extension`; the PNGs are committed, so builds don't need this.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const pub = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const svg = readFileSync(resolve(pub, 'icon.svg'), 'utf8');

// At 16/32 px the 7-unit stroke turns to mush; thicken it so the brain still reads.
const STROKE: Record<number, number> = { 16: 9, 32: 9, 48: 7, 128: 7 };

for (const size of [16, 32, 48, 128]) {
  const src = svg.replace('stroke-width="7"', `stroke-width="${STROKE[size]}"`);
  const png = new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(resolve(pub, `icon-${size}.png`), png);
  console.log(`icon-${size}.png  ${png.length} B`);
}
