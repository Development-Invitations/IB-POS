// Разовый скрипт для перегенерации src-tauri/nsis/*.bmp из логотипа — держим в репозитории на
// случай смены лого, но НЕ как постоянную зависимость: перед запуском поставить sharp
// (`pnpm add -D sharp`) и удалить после (`pnpm remove sharp`), в package.json его нет.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "fs";

const LOGO = "src/assets/logo-mark.png";
const OUT_DIR = "src-tauri/nsis";
mkdirSync(OUT_DIR, { recursive: true });

// sharp не умеет писать BMP напрямую — берём готовые RGB-пиксели через .raw() и сами
// собираем минимальный 24-битный BMP (BITMAPFILEHEADER + BITMAPINFOHEADER, без сжатия,
// строки снизу вверх, паддинг каждой строки до кратности 4 байт — стандартный формат BMP).
function encodeBmp(rgbBuffer, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;
  const buf = Buffer.alloc(fileSize);

  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(54, 10);

  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(pixelArraySize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y;
    const destOffset = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const srcIdx = (srcRow * width + x) * 3;
      const destIdx = destOffset + x * 3;
      buf[destIdx] = rgbBuffer[srcIdx + 2];
      buf[destIdx + 1] = rgbBuffer[srcIdx + 1];
      buf[destIdx + 2] = rgbBuffer[srcIdx];
    }
  }
  return buf;
}

async function makeAsset(outFile, width, height, logoSize, logoTop) {
  const logo = await sharp(LOGO).resize(logoSize, logoSize, { fit: "inside" }).toBuffer();
  const raw = await sharp({
    create: { width, height, channels: 3, background: "#ffffff" },
  })
    .composite([{ input: logo, left: Math.round((width - logoSize) / 2), top: logoTop }])
    .flatten({ background: "#ffffff" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bmp = encodeBmp(raw.data, raw.info.width, raw.info.height);
  writeFileSync(outFile, bmp);
}

// NSIS modern-UI размеры (см. tauri.conf.json bundle.windows.nsis) — header показывается
// вверху каждой страницы мастера, sidebar — на приветственной/финальной странице.
await makeAsset(`${OUT_DIR}/header.bmp`, 150, 57, 40, 9);
await makeAsset(`${OUT_DIR}/sidebar.bmp`, 164, 314, 100, 40);
console.log("done");
