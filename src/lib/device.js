// Phone features: camera, GPS, CSV export/share, session storage.
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Preferences } from '@capacitor/preferences';

export const isNative = () => Capacitor.isNativePlatform();

// ---------- session ----------
export async function loadSession() {
  const { value } = await Preferences.get({ key: 'session' });
  return value ? JSON.parse(value) : null;
}
export const saveSession = s => Preferences.set({ key: 'session', value: JSON.stringify(s) });
export const clearSession = () => Preferences.remove({ key: 'session' });

// ---------- camera ----------
function resizeDataUrl(dataUrl, maxW = 1280, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function pickFileAsDataUrl() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return reject(new Error('cancelled'));
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(f);
    };
    input.click();
  });
}

/** Returns base64 JPEG (no data: prefix), ~150–300 KB */
export async function takePhoto() {
  if (isNative()) {
    const p = await Camera.getPhoto({
      quality: 60, width: 1280, correctOrientation: true,
      resultType: CameraResultType.Base64, source: CameraSource.Prompt,
      promptLabelHeader: 'Inspection photo', promptLabelPhoto: 'From gallery', promptLabelPicture: 'Take photo',
    });
    return p.base64String;
  }
  return resizeDataUrl(await pickFileAsDataUrl());
}

// ---------- GPS ----------
export async function getGps() {
  if (isNative()) {
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted') await Geolocation.requestPermissions();
  }
  const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  return {
    lat: Number(pos.coords.latitude.toFixed(6)),
    lng: Number(pos.coords.longitude.toFixed(6)),
    gps_accuracy_m: Math.round(pos.coords.accuracy),
  };
}

// ---------- CSV export ----------
const esc = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(rows, columns) {
  return [columns.map(c => esc(c.label)).join(','), ...rows.map(r => columns.map(c => esc(c.value(r))).join(','))].join('\n');
}

export async function shareCsv(filename, csv) {
  if (isNative()) {
    const res = await Filesystem.writeFile({ path: filename, data: csv, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: filename, files: [res.uri], dialogTitle: 'Share CMU export' });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
}

// ---------- QR scan (printed licences, clearances and bills carry a CMU QR code) ----------
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';
export async function scanQR() {
  const r = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.QR_CODE, scanInstructions: 'Point at the QR code on the document' });
  return (r && r.ScanResult) || '';
}

// ---------- documents (PDF / photo) for Claude to read ----------
/** pick a PDF or photo: {name, mime, data(base64, no prefix), size}; photos are shrunk to ~1600 px */
export function pickDocument(accept = 'application/pdf,image/*', capture = false) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    if (capture) input.capture = 'environment';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return reject(new Error('cancelled'));
      if (f.size > 10 * 1048576) return reject(new Error('The file is larger than 10 MB.'));
      const r = new FileReader();
      r.onload = async () => {
        try {
          let data = String(r.result).split(',')[1], mime = f.type || 'application/octet-stream';
          if (/^image\//.test(mime) && !/gif/.test(mime)) { data = await resizeDataUrl(String(r.result), 1600, 0.75); mime = 'image/jpeg'; }
          resolve({ name: f.name, mime, data, size: f.size });
        } catch (e) { reject(e); }
      };
      r.onerror = reject;
      r.readAsDataURL(f);
    };
    input.click();
  });
}
/** a document photo from the camera (native), as {name, mime, data} */
export async function scanDocumentPhoto() {
  if (!isNative()) return pickDocument('image/*', true);
  const p = await Camera.getPhoto({ quality: 75, width: 1600, correctOrientation: true, resultType: CameraResultType.Base64, source: CameraSource.Prompt,
    promptLabelHeader: 'Document', promptLabelPhoto: 'From gallery', promptLabelPicture: 'Take photo' });
  return { name: 'Photo ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + '.jpg', mime: 'image/jpeg', data: p.base64String };
}

// ---------- PDF out ----------
const b64ToBlob = (b64, mime) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime }); };
/** share / save a PDF (base64): Android share sheet (print, WhatsApp, e-mail, Drive…), or a download in a browser */
export async function sharePdf(filename, base64) {
  if (isNative()) {
    const res = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    await Share.share({ title: filename, files: [res.uri], dialogTitle: 'Print or share ' + filename });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b64ToBlob(base64, 'application/pdf'));
  a.download = filename;
  a.click();
}
/** keep a copy in the phone's Documents folder */
export async function keepPdf(filename, base64) {
  if (!isNative()) return sharePdf(filename, base64);
  try {
    const res = await Filesystem.writeFile({ path: 'CMU/' + filename, data: base64, directory: Directory.Documents, recursive: true });
    return res.uri;
  } catch { await sharePdf(filename, base64); return ''; }     // some Android versions refuse the Documents folder – share instead
}

// ---------- contact a company ----------
export const openLink = url => { if (/^(tel|mailto|sms):/i.test(url)) window.location.href = url; else window.open(url, '_blank'); };
export const telLink = p => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
export const waLink = (p, text) => 'https://wa.me/' + String(p || '').replace(/[^\d]/g, '') + (text ? '?text=' + encodeURIComponent(text) : '');
export const mailLink = (to, subject, body) => 'mailto:' + String(to || '').split(/[;,\s]+/).filter(Boolean).join(',') + '?subject=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || '');
