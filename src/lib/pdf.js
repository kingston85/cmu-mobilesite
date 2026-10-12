// Turns a document model (docs.js) into an A4 PDF on the phone – works offline.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import QRCode from 'qrcode';
import { ARMS, EPA } from './logos';

const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '−': '-', '≤': '<=', '≥': '>=', '✔': '', '✖': 'x', '⚠': '!', '▸': '>', '→': '->', '·': '·' };
const WINANSI = '‘’“”–—•…€‰™'; // characters the standard PDF fonts can print beyond Latin-1
export const clean = s => String(s ?? '').replace(/[^\x00-\xff]/g, c => (SUB[c] !== undefined ? SUB[c] : WINANSI.includes(c) ? c : '?'));
export const qrDataUrl = text => QRCode.toDataURL(text, { margin: 1, width: 360, errorCorrectionLevel: 'M' });

const NAVY = [31, 78, 120];
export async function renderPdf(model) {
  const land = !!model.landscape;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: land ? 'landscape' : 'portrait', compress: true });
  const PW = land ? 297 : 210, PH = land ? 210 : 297, ML = 18, MR = 18, MT = 14, MB = 16, W = PW - ML - MR, F = model.font || 'times';
  let y = MT;
  const lh = size => size * 0.3528 * 1.22;
  const ensure = h => { if (y + h > PH - MB) { doc.addPage(); y = MT; } };
  const font = (bold, italic, size) => { doc.setFont(F, bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal'); doc.setFontSize(size); };
  const para = (text, { size = 11, bold, italic, align = 'left', indent = 0, gap = 2, underline, color } = {}) => {
    font(bold, italic, size); doc.setTextColor(...(color || [20, 20, 20]));
    const width = W - indent, x = ML + indent;
    String(text ?? '').split('\n').forEach((piece, pi, all) => {
      const lines = doc.splitTextToSize(clean(piece), width);
      if (!lines.length) { y += lh(size); return; }
      lines.forEach((ln, i) => {
        ensure(lh(size));
        const last = i === lines.length - 1;
        if (align === 'center') doc.text(ln, x + width / 2, y + lh(size) * 0.8, { align: 'center' });
        else if (align === 'right') doc.text(ln, x + width, y + lh(size) * 0.8, { align: 'right' });
        else if (align === 'justify' && !last) doc.text(ln, x, y + lh(size) * 0.8, { align: 'justify', maxWidth: width });
        else doc.text(ln, x, y + lh(size) * 0.8);
        if (underline) { const tw = doc.getTextWidth(ln), sx = align === 'center' ? x + width / 2 - tw / 2 : x; doc.setLineWidth(0.25); doc.line(sx, y + lh(size) * 0.95, sx + tw, y + lh(size) * 0.95); }
        y += lh(size);
      });
      if (pi < all.length - 1) y += 0.5;
    });
    y += gap;
  };
  for (const b of model.blocks) {
    switch (b.t) {
      case 'letterhead': {
        ensure(34);
        doc.addImage(ARMS, 'PNG', ML, y, 19, 21);
        doc.addImage(EPA, 'JPEG', PW - MR - 15, y, 15, 21);
        const L = b.lines;
        font(true, false, 12.5); doc.setTextColor(20, 20, 20); doc.text(clean(L[0]), PW / 2, y + 4.5, { align: 'center' });
        font(true, false, 13.5); doc.setTextColor(0, 97, 47); doc.text(clean(L[1]), PW / 2, y + 10, { align: 'center' });
        font(false, false, 9.5); doc.setTextColor(20, 20, 20);
        L.slice(2).forEach((t, i) => doc.text(clean(t), PW / 2, y + 14.5 + i * 3.8, { align: 'center' }));
        y += 25; doc.setDrawColor(0, 97, 47); doc.setLineWidth(0.6); doc.line(ML, y, PW - MR, y); doc.setLineWidth(0.2); doc.line(ML, y + 0.9, PW - MR, y + 0.9); doc.setDrawColor(0);
        y += 4; break;
      }
      case 'office':
        if (b.office) para(b.office, { size: 9.5, bold: true, align: 'center', gap: 0.3 });
        if (b.contact) para(b.contact, { size: 8.5, align: 'center', gap: 0.5 });
        y += 3; break;
      case 'rhead':
        ensure(22);
        font(true, false, 9); doc.setTextColor(...NAVY); doc.text('ENVIRONMENTAL PROTECTION AGENCY OF LIBERIA', ML, y + 3);
        font(false, false, 8.5); doc.setTextColor(90, 90, 90); doc.text(clean(b.sub), ML, y + 7);
        font(true, false, 13.5); doc.setTextColor(...NAVY); doc.splitTextToSize(clean(b.title), W).forEach((t, i) => doc.text(t, ML, y + 13.5 + i * 5.5));
        y += 16 + (doc.splitTextToSize(clean(b.title), W).length - 1) * 5.5; doc.setDrawColor(217, 119, 87); doc.setLineWidth(0.8); doc.line(ML, y, PW - MR, y); doc.setDrawColor(0); doc.setLineWidth(0.2);
        y += 4; break;
      case 'section': ensure(26); y += 1.5; para(b.text, { size: 10.5, bold: true, color: NAVY, gap: 1.5 }); break;
      case 'text': para(b.text, b); break;
      case 'gap': y += b.h || 3; break;
      case 'list':
        for (const [n, text] of b.items) {
          const size = b.size || 10, ind = (b.indent || 0);
          font(false, false, size); doc.setTextColor(20, 20, 20);
          const lines = doc.splitTextToSize(clean(text), W - ind - 9);
          lines.forEach((ln, i) => {
            ensure(lh(size));
            if (i === 0) doc.text(clean(n), ML + ind, y + lh(size) * 0.8);
            if (i < lines.length - 1) doc.text(ln, ML + ind + 9, y + lh(size) * 0.8, { align: 'justify', maxWidth: W - ind - 9 }); else doc.text(ln, ML + ind + 9, y + lh(size) * 0.8);
            y += lh(size);
          });
          y += 1.2;
        }
        y += 1.5; break;
      case 'table': {
        const isDoc = F === 'times', ind = b.indent || 0, tw = W - ind;
        const body = b.rows.length ? b.rows.map(r => r.map(c => clean(c))) : [b.head.map(() => '')];
        const cs = {}; (b.widths || []).forEach((w, i) => { cs[i] = { cellWidth: (tw * w) / 100, halign: (b.align || [])[i] || 'left' }; });
        autoTable(doc, { startY: y, head: [b.head.map(clean)], body, foot: b.foot ? [b.foot.map(clean)] : undefined, margin: { left: ML + ind, right: MR, top: MT, bottom: MB }, tableWidth: tw,
          styles: { font: F, fontSize: b.size || 9, cellPadding: 1.3, lineColor: [140, 140, 140], lineWidth: 0.2, textColor: 20, overflow: 'linebreak', valign: 'middle' },
          headStyles: isDoc ? { fillColor: [235, 235, 235], textColor: 10, fontStyle: 'bold' } : { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
          footStyles: { fillColor: isDoc ? [245, 245, 245] : [221, 235, 247], textColor: 10, fontStyle: 'bold' },
          alternateRowStyles: isDoc ? {} : { fillColor: [244, 247, 251] }, columnStyles: cs, showFoot: 'lastPage', rowPageBreak: 'avoid' });
        y = doc.lastAutoTable.finalY + 3.5; break;
      }
      case 'kv':
        autoTable(doc, { startY: y, body: b.rows.map(r => [clean(r[0]), clean(r[1])]), theme: 'plain', margin: { left: ML, right: MR }, tableWidth: W,
          styles: { font: F, fontSize: 9, cellPadding: 0.9 }, columnStyles: { 0: { cellWidth: W * 0.36, textColor: 90 }, 1: { fontStyle: 'bold', textColor: 20 } } });
        y = doc.lastAutoTable.finalY + 3; break;
      case 'twocol': {
        const size = b.size || 10.5, l = clean(b.left).split('\n'), r = clean(b.right).split('\n'), n = Math.max(l.length, r.length);
        ensure(n * lh(size) + 2); font(b.bold, false, size); doc.setTextColor(20, 20, 20);
        for (let i = 0; i < n; i++) { if (l[i]) doc.text(l[i], ML, y + lh(size) * 0.8); if (r[i]) doc.text(r[i], ML + W / 2 + 4, y + lh(size) * 0.8); y += lh(size); }
        y += 2; break;
      }
      case 'sign': {
        ensure(36);
        const qs = 25, top = y + 6;
        if (b.qr) {
          const img = await qrDataUrl(b.qr.text);
          doc.addImage(img, 'PNG', PW - MR - qs, top - 4, qs, qs);
          if (b.qr.code) { font(false, false, 6.5); doc.setTextColor(80, 80, 80); doc.text('Scan to verify · ' + b.qr.code, PW - MR - qs / 2, top + qs - 1.5, { align: 'center' }); }
        }
        const cx = b.left ? ML : ML + (W - qs) / 2 - 30, al = b.left ? 'left' : 'center', tx = b.left ? cx : ML + (W - qs - 6) / 2;
        font(false, false, 11); doc.setTextColor(20, 20, 20);
        doc.text('_____________________________________', tx, top + 8, { align: al });
        font(true, false, 11); doc.text(clean(b.name || ''), tx, top + 13, { align: al });
        font(true, false, 9.5); doc.text(clean(b.title || ''), tx, top + 17.5, { align: al });
        y = top + Math.max(qs, 20) + 2; break;
      }
      case 'chart': {
        ensure(48);
        const vals = b.series[0], mx = Math.max(1, ...vals), h = 34, bw = W / vals.length;
        font(true, false, 9); doc.setTextColor(...NAVY); doc.text(clean(b.title), ML, y + 3); y += 6;
        doc.setDrawColor(200); doc.line(ML, y + h, ML + W, y + h);
        vals.forEach((v, i) => {
          const bh = (v / mx) * (h - 4); doc.setFillColor(...NAVY); doc.rect(ML + i * bw + bw * 0.18, y + h - bh, bw * 0.64, bh, 'F');
          font(false, false, 7); doc.setTextColor(90, 90, 90); doc.text(clean(b.labels[i]), ML + i * bw + bw / 2, y + h + 3.5, { align: 'center' });
          if (v) doc.text(String(Math.round(v)), ML + i * bw + bw / 2, y + h - bh - 1, { align: 'center' });
        });
        doc.setDrawColor(0); y += h + 8; break;
      }
      case 'page': doc.addPage(); y = MT; break;
      default: break;
    }
  }
  const n = doc.getNumberOfPages();
  if (n > 1 || F === 'helvetica') for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
    doc.text(`${clean(model.title)}  ·  page ${i} of ${n}`, PW / 2, PH - 8, { align: 'center' });
  }
  return doc.output('datauristring').split(',')[1];
}
