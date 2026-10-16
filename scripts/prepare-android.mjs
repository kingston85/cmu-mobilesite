// Creates / updates the native Android project for the CMU Database app.
// Run after "npm run build":   node scripts/prepare-android.mjs   (the GitHub workflow does this for you)
//  1. adds the android folder with "npx cap add android" if it is not there yet
//  2. copies the CMU icons, splash screens and notification icon from android-res/
//  3. adds the permissions the app needs (camera, GPS, notifications)
//  4. sets the version (from VERSION_CODE / VERSION_NAME) and the signing keys
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const A = p => path.join(root, 'android', p);
const log = m => console.log('[prepare-android] ' + m);

if (!fs.existsSync(A('app/build.gradle'))) {
  log('android/ not found – running "npx cap add android"');
  execSync('npx cap add android', { cwd: root, stdio: 'inherit' });
}

// ---- 2  resources
const res = A('app/src/main/res');
const copyDir = (src, dst) => {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyDir(s, d); } else fs.copyFileSync(s, d);
  }
};
copyDir(path.join(root, 'android-res'), res);
// the default vector foreground would win over our PNG one
for (const f of ['drawable-v24/ic_launcher_foreground.xml']) { try { fs.unlinkSync(path.join(res, f)); } catch {} }
fs.writeFileSync(path.join(res, 'values/colors.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="colorPrimary">#1F4E78</color>\n    <color name="colorPrimaryDark">#163A5C</color>\n    <color name="colorAccent">#D97757</color>\n</resources>\n');
log('icons, splash screens and colours copied');

// ---- 3  permissions
const manPath = A('app/src/main/AndroidManifest.xml');
let man = fs.readFileSync(manPath, 'utf8');
const perms = [
  'android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE', 'android.permission.CAMERA',
  'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.POST_NOTIFICATIONS', 'android.permission.VIBRATE', 'android.permission.RECEIVE_BOOT_COMPLETED',
];
for (const p of perms) if (!man.includes(`"${p}"`)) man = man.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
for (const f of ['android.hardware.camera', 'android.hardware.location.gps'])
  if (!man.includes(`"${f}"`)) man = man.replace('</manifest>', `    <uses-feature android:name="${f}" android:required="false" />\n</manifest>`);
if (!man.includes('android:usesCleartextTraffic')) man = man.replace('<application', '<application\n        android:usesCleartextTraffic="false"');
fs.writeFileSync(manPath, man);
log('permissions set');

// ---- 4  version + signing
const gPath = A('app/build.gradle');
let g = fs.readFileSync(gPath, 'utf8');
g = g.replace(/versionCode\s+\d+/, 'versionCode((System.getenv("VERSION_CODE") ?: "1") as Integer)')
     .replace(/versionName\s+"[^"]*"/, 'versionName System.getenv("VERSION_NAME") ?: "2.0.0"');
if (!g.includes('signingConfigs')) {
  g = g.replace(/buildTypes\s*\{/, `signingConfigs {
        // fixed test key kept in the repository, so every test APK installs over the previous one
        debug {
            storeFile file("../../keys/cmu-test.keystore")
            storePassword "cmutest"
            keyAlias "cmu"
            keyPassword "cmutest"
        }
        release {
            def ks = System.getenv("CMU_KEYSTORE_PATH")
            if (ks) {
                storeFile file(ks)
                storePassword System.getenv("CMU_KEYSTORE_PASSWORD")
                keyAlias System.getenv("CMU_KEY_ALIAS")
                keyPassword System.getenv("CMU_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }`);
  g = g.replace(/release\s*\{\s*minifyEnabled false/, `release {
            signingConfig System.getenv("CMU_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug
            minifyEnabled false`);
}
fs.writeFileSync(gPath, g);
log('version and signing set');

// Android 8.0+ (the QR scanner library needs API 26)
const vPath = A('variables.gradle');
fs.writeFileSync(vPath, fs.readFileSync(vPath, 'utf8').replace(/minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 26'));
log('minimum Android version: 8.0 (API 26)');

// a little more memory for Gradle on the build machine
const gp = A('gradle.properties');
let props = fs.readFileSync(gp, 'utf8');
props = props.replace(/org\.gradle\.jvmargs=.*/, 'org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8');
fs.writeFileSync(gp, props);
log('done');
