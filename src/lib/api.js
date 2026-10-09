// Talks to MobileAPI.gs (the CMU Database web app). Requests go through CapacitorHttp on Android (no CORS problems).
import { Network } from '@capacitor/network';

export class ApiError extends Error { constructor(m, code) { super(m); this.code = code; this.server = true; } }

export async function call(apiUrl, body, timeoutMs = 120000) {
  if (!apiUrl) throw new ApiError('No server link. Open More ▸ Connection and paste the /exec link.', 'nolink');
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  let res, text;
  try {
    res = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', signal: ctl?.signal });
    text = await res.text();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The database took too long to answer. Try again.' : 'Could not reach the database: ' + (e.message || e));
  } finally { if (t) clearTimeout(t); }
  let data;
  try { data = JSON.parse(text); } catch {
    if (/<html/i.test(text) && /sign in|accounts\.google/i.test(text)) throw new ApiError('Google asked for a sign-in: deploy the web app with "Who has access: Anyone".', 'deploy');
    throw new ApiError('The server did not answer correctly. Check the link ends in /exec, the web app is deployed for "Anyone", and MobileAPI.gs is installed.', 'bad');
  }
  if (!data.ok) throw new ApiError(data.error || 'Server error', data.code);
  return data;
}
export async function isOnline() { try { return (await Network.getStatus()).connected; } catch { return navigator.onLine; } }
const B = (s, o) => ({ ...o, token: s.token || '', who: s.user?.name || '' });
export const api = {
  login: (apiUrl, o) => call(apiUrl, { action: 'login', ...o }),
  ping: s => call(s.apiUrl, B(s, { action: 'ping' }), 30000),
  pull: s => call(s.apiUrl, B(s, { action: 'pull' }), 180000),
  push: (s, items) => call(s.apiUrl, B(s, { action: 'push', items }), 240000),
  check: (s, item) => call(s.apiUrl, B(s, { action: 'check', item }), 60000),
  photo: (s, photo) => call(s.apiUrl, B(s, { action: 'photo', photo }), 120000),
  verify: (s, code) => call(s.apiUrl, B(s, { action: 'verify', code }), 60000),
  pdf: (s, o) => call(s.apiUrl, B(s, { action: 'pdf', ...o }), 300000),
  ai: (s, o) => call(s.apiUrl, B(s, { action: 'ai', ...o }), 300000),
  aiDoc: (s, o) => call(s.apiUrl, B(s, { action: 'aiDoc', ...o }), 300000),
  inbox: (s, o) => call(s.apiUrl, B(s, { action: 'inbox', ...o }), 300000),
  admin: (s, o) => call(s.apiUrl, B(s, { action: 'admin', ...o }), 300000),
  log: (s, n) => call(s.apiUrl, B(s, { action: 'log', n })),
};
