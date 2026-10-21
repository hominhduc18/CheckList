import QRCode from 'qrcode';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSetting } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontPath = path.join(__dirname, '..', 'assets', 'fonts', 'NotoSans-Regular.ttf');

function appBase() {
  return getSetting('app_base_url', 'http://localhost:5173').replace(/\/$/, '');
}

export function roomUrl(qrCode) {
  return `${appBase()}/r/${qrCode}`;
}

/** PNG buffer mã QR */
export async function makeQrPng(qrCode, size = 512) {
  return QRCode.toBuffer(roomUrl(qrCode), {
    type: 'png',
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}

/** PDF A5 đứng: QR + tên khoa/phòng bên dưới */
export async function makeQrPdfA5({ qrCode, departmentName, roomName }) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // A5: 148 x 210 mm → points (1mm ≈ 2.83465)
  const page = pdf.addPage([148 * 2.83465, 210 * 2.83465]);
  const { width, height } = page.getSize();

  let font;
  if (fs.existsSync(fontPath)) {
    font = await pdf.embedFont(fs.readFileSync(fontPath));
  } else {
    font = await pdf.embedFont(StandardFonts.Helvetica);
  }

  const png = await makeQrPng(qrCode, 600);
  const img = await pdf.embedPng(png);
  const qrSize = Math.min(width * 0.7, 280);
  const x = (width - qrSize) / 2;
  const y = height / 2 - qrSize / 2 + 20;
  page.drawImage(img, { x, y, width: qrSize, height: qrSize });

  const title = departmentName || '';
  const sub = roomName || '';
  const url = roomUrl(qrCode);

  const drawCentered = (text, yPos, size, color = rgb(0.04, 0.36, 0.67)) => {
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: Math.max(24, (width - tw) / 2),
      y: yPos,
      size,
      font,
      color,
    });
  };

  drawCentered(title, y - 28, 14);
  drawCentered(sub, y - 48, 12);
  drawCentered('Quét mã để điền checklist', y - 70, 10, rgb(0.3, 0.45, 0.65));

  // URL nhỏ
  const urlSize = 7;
  const uw = font.widthOfTextAtSize(url, urlSize);
  page.drawText(url, {
    x: Math.max(16, (width - uw) / 2),
    y: 36,
    size: urlSize,
    font,
    color: rgb(0.4, 0.5, 0.6),
  });

  return Buffer.from(await pdf.save());
}
