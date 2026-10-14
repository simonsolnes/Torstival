const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

// Egen vektortegning: femkantede felt på en klassisk fotball.
const point = (radius, angle) => [radius * Math.cos(angle), radius * Math.sin(angle)];
const polygon = (x, y, radius, angle) => Array.from({ length: 5 }, (_, i) => {
  const [dx, dy] = point(radius, angle + i * Math.PI * 2 / 5);
  return `${(x + dx).toFixed(2)},${(y + dy).toFixed(2)}`;
}).join(' ');
const angles = Array.from({ length: 5 }, (_, i) => -Math.PI / 2 + i * Math.PI * 2 / 5);
const panels = `<polygon points="${polygon(0, 0, 35, -Math.PI / 2)}"/>` + angles.map(angle => {
  const [x, y] = point(82, angle);
  return `<polygon points="${polygon(x, y, 28, angle + Math.PI)}"/>`;
}).join('');
const seams = angles.map(angle => {
  const [x1, y1] = point(35, angle);
  const [x2, y2] = point(54, angle);
  const [x3, y3] = point(85, angle + Math.PI / 5);
  const [x4, y4] = point(85, angle - Math.PI / 5);
  const [cx, cy] = point(82, angle);
  return `<path fill="none" d="M${x1},${y1} L${x2},${y2} M${x3},${y3} L${cx},${cy} L${x4},${y4}"/>`;
}).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="-160 -160 320 320">
<defs><clipPath id="ball"><circle r="90"/></clipPath></defs>
<circle r="90" fill="#fffdf7"/>
<g clip-path="url(#ball)" fill="#171b24" stroke="#171b24" stroke-width="2.5" stroke-linejoin="round">${seams}${panels}</g>
<circle r="90" fill="none" stroke="#171b24" stroke-width="3"/>
</svg>\n`;

async function main() {
  const assets = path.join(__dirname, '../assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(path.join(assets, 'football.svg'), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(assets, 'adaptive-icon.png'));
  // Større ball i det vanlige ikonet; adaptivt ikon holder seg innenfor sikker sone.
  const icon = svg.replace('-160 -160 320 320', '-122 -122 244 244');
  await sharp(Buffer.from(icon)).flatten({ background: '#c4b5fd' }).png().toFile(path.join(assets, 'icon.png'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
