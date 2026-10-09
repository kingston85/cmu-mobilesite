// Open bottom sheets / dialogs register here, so the Android back button closes the top one first.
const stack = [];
export const pushOverlay = close => { stack.push(close); return () => { const i = stack.lastIndexOf(close); if (i >= 0) stack.splice(i, 1); }; };
export function overlayBack() { const f = stack.pop(); if (f) { f(); return true; } return false; }
