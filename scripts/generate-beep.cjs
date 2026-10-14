// Original 880 Hz sine beep, 180 ms with short fades to avoid clicks.
const fs = require('node:fs');
const path = require('node:path');
const rate = 44100;
const count = Math.round(rate * 0.18);
const data = Buffer.alloc(44 + count * 2);
data.write('RIFF', 0);
data.writeUInt32LE(data.length - 8, 4);
data.write('WAVEfmt ', 8);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20);
data.writeUInt16LE(1, 22);
data.writeUInt32LE(rate, 24);
data.writeUInt32LE(rate * 2, 28);
data.writeUInt16LE(2, 32);
data.writeUInt16LE(16, 34);
data.write('data', 36);
data.writeUInt32LE(count * 2, 40);
for (let i = 0; i < count; i++) {
  const fade = Math.min(1, i / (rate * 0.01), (count - 1 - i) / (rate * 0.01));
  data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 880 * i / rate) * 0.65 * fade * 32767), 44 + i * 2);
}
fs.writeFileSync(path.join(__dirname, '../modules/pulse/ios/torstival-beep.wav'), data);
