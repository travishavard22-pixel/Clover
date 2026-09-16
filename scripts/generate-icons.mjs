import sharp from "sharp";
import { writeFileSync } from "node:fs";
const mark = `<g transform="rotate(45 12 12)"><path d="M7 2.5h4a1.5 1.5 0 0 1 1.5 1.5v5.5H7A4.5 4.5 0 0 1 7 2.5z"/><path d="M17 2.5A4.5 4.5 0 0 1 17 9.5h-5.5V4A1.5 1.5 0 0 1 13 2.5h4z"/><path d="M2.5 13h9.5v5.5A1.5 1.5 0 0 1 10.5 20H7a4.5 4.5 0 0 1-4.5-4.5V13z"/><path d="M12.5 13H21.5v2.5A4.5 4.5 0 0 1 17 20h-3a1.5 1.5 0 0 1-1.5-1.5V13z"/></g>`;
const tile = (size, bg, fg, radius) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/><g transform="translate(${size*0.2} ${size*0.2}) scale(${size*0.6/24})" fill="${fg}">${mark}</g></svg>`;
for (const [name, size, radius] of [["icon-192.png",192,42],["icon-512.png",512,112],["apple-touch-icon.png",180,0],["icon-maskable-512.png",512,0]]) {
  const png = await sharp(Buffer.from(tile(size, "#1E7A4C", "#F8F7F3", radius))).png().toBuffer();
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), png);
}
writeFileSync(new URL("../public/icons/icon.svg", import.meta.url), tile(64, "#1E7A4C", "#F8F7F3", 14));
console.log("icons written");
