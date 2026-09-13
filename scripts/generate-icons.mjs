import fs from "fs";
import path from "path";
import { PNG } from "pngjs";

function resizeBilinear(src, targetWidth, targetHeight) {
  const dst = new PNG({ width: targetWidth, height: targetHeight });
  const xRatio = src.width / targetWidth;
  const yRatio = src.height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const px = x * xRatio;
      const py = y * yRatio;
      const xFloor = Math.floor(px);
      const yFloor = Math.floor(py);
      const xCeil = Math.min(src.width - 1, Math.ceil(px));
      const yCeil = Math.min(src.height - 1, Math.ceil(py));
      const xWeight = px - xFloor;
      const yWeight = py - yFloor;

      const idxDst = (y * targetWidth + x) << 2;
      const idxTL = (yFloor * src.width + xFloor) << 2;
      const idxTR = (yFloor * src.width + xCeil) << 2;
      const idxBL = (yCeil * src.width + xFloor) << 2;
      const idxBR = (yCeil * src.width + xCeil) << 2;

      for (let c = 0; c < 4; c++) {
        const top = src.data[idxTL + c] * (1 - xWeight) + src.data[idxTR + c] * xWeight;
        const bottom = src.data[idxBL + c] * (1 - xWeight) + src.data[idxBR + c] * xWeight;
        dst.data[idxDst + c] = Math.round(top * (1 - yWeight) + bottom * yWeight);
      }
    }
  }
  return dst;
}

const masterPath = path.resolve(process.cwd(), "apps/conductor/public/brand-logo-original.png");
const masterBuf = fs.readFileSync(masterPath);
const masterPng = PNG.sync.read(masterBuf);

console.log(`Loaded official master logo: ${masterPng.width}x${masterPng.height}`);

const png512 = resizeBilinear(masterPng, 512, 512);
const png192 = resizeBilinear(masterPng, 192, 192);

const out512Buf = PNG.sync.write(png512);
const out192Buf = PNG.sync.write(png192);
const b64512 = out512Buf.toString("base64");

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <image href="data:image/png;base64,${b64512}" width="512" height="512" />
</svg>
`;

const targets = [
  "apps/admin/public/icons",
  "apps/passenger/public/icons",
  "apps/conductor/public/icons",
];

targets.forEach((targetDir) => {
  const fullDir = path.resolve(process.cwd(), targetDir);
  if (!fs.existsSync(fullDir)) {
    fs.mkdirSync(fullDir, { recursive: true });
  }
  fs.writeFileSync(path.join(fullDir, "icon-192.png"), out192Buf);
  fs.writeFileSync(path.join(fullDir, "icon-512.png"), out512Buf);
  fs.writeFileSync(path.join(fullDir, "icon.svg"), svgContent);
  console.log(`Generated official master icons in ${targetDir}`);
});
