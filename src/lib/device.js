// Phone features: preferences, camera / documents, GPS, QR scanner, files & sharing, notifications, haptics, browser.
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Preferences } from '@capacitor/preferences';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Browser } from '@capacitor/browser';

export const isNative = () => Capacitor.isNativePlatform();

/* ---------- preferences (small settings, survive app updates) */
export async function prefGet(key, fallback = null) {
  try { const { value } = await Preferences.get({ key }); return value === null || value === undefined ? fallback : JSON.parse(value); } catch { return fallback; }
}
export const prefSet = (key, v) => Preferences.set({ key, value: JSON.stringify(v) });
export const prefDel = key => Preferences.remove({ key });

/* ---------- haptics */
export const tap = () => { if (isNative()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); };
export const buzz = (kind = 'success') => { if (isNative()) Haptics.notification({ type: kind === 'error' ? NotificationType.Error : kind === 'warning' ? NotificationType.Warning : NotificationType.Success }).catch(() => {}); };

/* ---------- camera + documents */
function resize(dataUrl, maxW = 1600, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxW / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = reject; img.src = dataUrl;
  });
}
function pickFile(accept, capture) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; if (capture) input.capture = 'environment';
    input.onchange = () => {
      const f = input.files?.[0]; if (!f) return reject(new Error('cancelled'));
      const r = new FileReader(); r.onload = () => resolve({ name: f.name, mime: f.type || 'application/octet-stream', dataUrl: r.result, size: f.size }); r.onerror = reject; r.readAsDataURL(f);
    };
    input.click();
  });
}
/** photo (camera or gallery) → base64 JPEG without prefix */
export async function takePhoto(header = 'Photo', maxW = 1600) {
  if (isNative()) {
    const p = await Camera.getPhoto({ quality: 70, width: maxW, correctOrientation: true, resultType: CameraResultType.Base64, source: CameraSource.Prompt,
      promptLabelHeader: header, promptLabelPhoto: 'From gallery', promptLabelPicture: 'Take photo' });
    return p.base64String;
  }
  const f = await pickFile('image/*', true);
  return resize(f.dataUrl, maxW);
}
/** a document to read: photo of a page (camera) or a PDF / image file → { name, mime, data(base64) } */
export async function pickDocument(source = 'camera') {
  if (source === 'camera') {
    const data = await takePhoto('Document', 2000);
    return { name: 'scan-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '') + '.jpg', mime: 'image/jpeg', data };
  }
  const f = await pickFile('application/pdf,image/jpeg,image/png,image/webp');
  if (f.size > 10 * 1048576) throw new Error('The file is larger than 10 MB.');
  if (/^image\//.test(f.mime) && f.size > 1500000) return { name: f.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', data: await resize(f.dataUrl, 2200, 0.75) };
  return { name: f.name, mime: f.mime, data: String(f.dataUrl).split(',')[1] };
}

/* ---------- GPS */
export async function getGps() {
  if (isNative()) { const perm = await Geolocation.checkPermissions(); if (perm.location !== 'granted') await Geolocation.requestPermissions(); }
  const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
  return { lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)), acc: Math.round(pos.coords.accuracy) };
}

/* ---------- QR scanner (printed licences, clearance letters and bills carry a CMU QR code) */
export async function scanQR() {
  const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import('@capacitor/barcode-scanner');
  const r = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.QR_CODE, scanInstructions: 'Point at the QR code on the document', scanButton: false });
  return (r && r.ScanResult) || '';
}

/* ---------- files: save + share / open */
function b64FromText(t) { return btoa(unescape(encodeURIComponent(t))); }
export async function saveAndShare(filename, data, mime, { base64 = false, text = '' } = {}) {
  const safe = filename.replace(/[\\/:*?"<>|]/g, '-');
  if (isNative()) {
    const res = await Filesystem.writeFile({ path: 'CMU/' + safe, data: base64 ? data : b64FromText(data), directory: Directory.Cache, recursive: true });
    await Share.share({ title: safe, text: text || safe, files: [res.uri], dialogTitle: 'Share or save' });
    return res.uri;
  }
  const blob = base64 ? new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: mime }) : new Blob([data], { type: mime });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = safe; document.body.appendChild(a); a.click(); a.remove();
  return a.href;
}
/** keep a copy in the phone's Documents folder (visible in the Files app) */
export async function saveToDocuments(filename, base64) {
  if (!isNative()) return saveAndShare(filename, base64, 'application/pdf', { base64: true });
  const res = await Filesystem.writeFile({ path: 'CMU Database/' + filename.replace(/[\\/:*?"<>|]/g, '-'), data: base64, directory: Directory.Documents, recursive: true });
  return res.uri;
}
export async function shareText(title, text) {
  if (isNative()) return Share.share({ title, text, dialogTitle: title });
  try { await navigator.share?.({ title, text }); } catch { await navigator.clipboard?.writeText(text); }
}
export const openUrl = url => (isNative() ? Browser.open({ url }) : window.open(url, '_blank'));
export function contactLink(kind, v) {
  if (!v) return;
  const n = String(v).replace(/[^\d+]/g, '');
  const url = kind === 'call' ? 'tel:' + n : kind === 'sms' ? 'sms:' + n : kind === 'whatsapp' ? 'https://wa.me/' + n.replace(/^\+/, '') : kind === 'mail' ? 'mailto:' + v : kind === 'map' ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(v) : v;
  window.open(url, '_system');
}

/* ---------- local notifications (licence expiries, unpaid bills) */
export async function notifyPermission() {
  if (!isNative()) return 'web';
  const p = await LocalNotifications.checkPermissions();
  if (p.display === 'granted') return 'granted';
  return (await LocalNotifications.requestPermissions()).display;
}
export async function scheduleReminders(list) {
  if (!isNative()) return 0;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    const now = Date.now();
    const ns = list.filter(n => n.at.getTime() > now + 60000).slice(0, 60).map((n, i) => ({ id: 1000 + i, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true }, smallIcon: 'ic_stat_cmu', extra: n.extra || {} }));
    if (ns.length) await LocalNotifications.schedule({ notifications: ns });
    return ns.length;
  } catch { return 0; }
}
export function onNotificationTap(cb) {
  if (!isNative()) return () => {};
  const h = LocalNotifications.addListener('localNotificationActionPerformed', e => cb(e.notification?.extra || {}));
  return () => { h.then(x => x.remove()).catch(() => {}); };
}
