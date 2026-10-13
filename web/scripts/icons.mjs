// Renders the PNG icons the manifest and iOS need from public/icon.svg.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
// Maskable and iOS icons get cropped by the OS, so they need square corners.
const square = svg.replace('rx="112"', 'rx="0"');

const render = (source, size, name) =>
  sharp(Buffer.from(source), { density: 300 }).resize(size, size).png().toFile(path.join(dir, name));

await Promise.all([
  render(svg, 192, 'icon-192.png'),
  render(svg, 512, 'icon-512.png'),
  render(square, 512, 'icon-maskable-512.png'),
  render(square, 180, 'apple-touch-icon.png'),
]);
console.log('Icons written to', dir);
