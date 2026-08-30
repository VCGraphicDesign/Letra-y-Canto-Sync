import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Dark background, yellow studio microphone, and crisp white acoustic sound wave lines
const fullIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#141c2e" />
      <stop offset="100%" stop-color="#060911" />
    </radialGradient>
    <linearGradient id="micGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="45%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
    <linearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.03" />
    </linearGradient>
  </defs>

  <!-- Dark Background -->
  <rect width="1024" height="1024" fill="url(#bgGrad)" />

  <!-- Subtle Gold Card Frame -->
  <rect x="96" y="96" width="832" height="832" rx="192" ry="192" fill="url(#glowGrad)" stroke="#f59e0b" stroke-opacity="0.35" stroke-width="14" />

  <!-- White Sound Wave Acoustic Lines (Left side) -->
  <path d="M 330 380 A 180 180 0 0 0 330 540" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-opacity="0.9" />
  <path d="M 270 320 A 260 260 0 0 0 270 600" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" stroke-opacity="0.65" />
  <path d="M 210 260 A 340 340 0 0 0 210 660" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-opacity="0.4" />

  <!-- White Sound Wave Acoustic Lines (Right side) -->
  <path d="M 694 380 A 180 180 0 0 1 694 540" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-opacity="0.9" />
  <path d="M 754 320 A 260 260 0 0 1 754 600" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" stroke-opacity="0.65" />
  <path d="M 814 260 A 340 340 0 0 1 814 660" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-opacity="0.4" />

  <!-- Yellow Studio Microphone Capsule -->
  <!-- Upper Grille Dome & Body -->
  <rect x="424" y="240" width="176" height="290" rx="88" ry="88" fill="url(#micGrad)" stroke="#fef08a" stroke-width="8" />

  <!-- Microphone Grille Mesh Pattern / Lines (White & Dark Highlights) -->
  <line x1="432" y1="330" x2="592" y2="330" stroke="#78350f" stroke-width="8" stroke-opacity="0.5" />
  <line x1="432" y1="375" x2="592" y2="375" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-opacity="0.9" />
  <line x1="432" y1="420" x2="592" y2="420" stroke="#78350f" stroke-width="8" stroke-opacity="0.5" />

  <!-- Vertical Capsule Light Reflection (White Line) -->
  <path d="M 456 280 Q 456 380 456 460" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-opacity="0.8" />

  <!-- Lower U-Shaped Cradle Mount (White & Yellow) -->
  <path d="M 374 410 C 374 590, 650 590, 650 410" fill="none" stroke="#f59e0b" stroke-width="24" stroke-linecap="round" />
  <path d="M 374 410 C 374 590, 650 590, 650 410" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-opacity="0.6" />

  <!-- Stand Rod -->
  <line x1="512" y1="550" x2="512" y2="690" stroke="#f59e0b" stroke-width="24" stroke-linecap="round" />
  <line x1="512" y1="550" x2="512" y2="690" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-opacity="0.7" />

  <!-- Base Stand Plate -->
  <line x1="400" y1="690" x2="624" y2="690" stroke="#f59e0b" stroke-width="26" stroke-linecap="round" />
  <line x1="416" y1="690" x2="608" y2="690" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-opacity="0.85" />
</svg>
`;

const roundIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bgGradR" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#141c2e" />
      <stop offset="100%" stop-color="#060911" />
    </radialGradient>
    <linearGradient id="micGradR" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="45%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
  </defs>

  <!-- Dark Circular Background -->
  <circle cx="512" cy="512" r="512" fill="url(#bgGradR)" />
  <circle cx="512" cy="512" r="440" fill="#f59e0b" fill-opacity="0.08" stroke="#f59e0b" stroke-opacity="0.35" stroke-width="14" />

  <!-- White Sound Wave Acoustic Lines (Left side) -->
  <path d="M 330 380 A 180 180 0 0 0 330 540" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-opacity="0.9" />
  <path d="M 270 320 A 260 260 0 0 0 270 600" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" stroke-opacity="0.65" />
  <path d="M 210 260 A 340 340 0 0 0 210 660" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-opacity="0.4" />

  <!-- White Sound Wave Acoustic Lines (Right side) -->
  <path d="M 694 380 A 180 180 0 0 1 694 540" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-opacity="0.9" />
  <path d="M 754 320 A 260 260 0 0 1 754 600" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" stroke-opacity="0.65" />
  <path d="M 814 260 A 340 340 0 0 1 814 660" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-opacity="0.4" />

  <!-- Yellow Studio Microphone Capsule -->
  <rect x="424" y="240" width="176" height="290" rx="88" ry="88" fill="url(#micGradR)" stroke="#fef08a" stroke-width="8" />

  <!-- Microphone Grille Mesh Pattern / Lines (White & Dark Highlights) -->
  <line x1="432" y1="330" x2="592" y2="330" stroke="#78350f" stroke-width="8" stroke-opacity="0.5" />
  <line x1="432" y1="375" x2="592" y2="375" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-opacity="0.9" />
  <line x1="432" y1="420" x2="592" y2="420" stroke="#78350f" stroke-width="8" stroke-opacity="0.5" />

  <!-- Vertical Capsule Light Reflection (White Line) -->
  <path d="M 456 280 Q 456 380 456 460" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-opacity="0.8" />

  <!-- Lower U-Shaped Cradle Mount (White & Yellow) -->
  <path d="M 374 410 C 374 590, 650 590, 650 410" fill="none" stroke="#f59e0b" stroke-width="24" stroke-linecap="round" />
  <path d="M 374 410 C 374 590, 650 590, 650 410" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-opacity="0.6" />

  <!-- Stand Rod -->
  <line x1="512" y1="550" x2="512" y2="690" stroke="#f59e0b" stroke-width="24" stroke-linecap="round" />
  <line x1="512" y1="550" x2="512" y2="690" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-opacity="0.7" />

  <!-- Base Stand Plate -->
  <line x1="400" y1="690" x2="624" y2="690" stroke="#f59e0b" stroke-width="26" stroke-linecap="round" />
  <line x1="416" y1="690" x2="608" y2="690" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-opacity="0.85" />
</svg>
`;

// Adaptive Foreground (108dp canvas with safe zone inside central 66dp / 624x624)
const adaptiveForegroundSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="micGradA" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="45%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
  </defs>

  <g transform="translate(512, 512) scale(0.72) translate(-512, -512)">
    <!-- White Sound Wave Acoustic Lines (Left side) -->
    <path d="M 330 380 A 180 180 0 0 0 330 540" fill="none" stroke="#ffffff" stroke-width="18" stroke-linecap="round" stroke-opacity="0.95" />
    <path d="M 270 320 A 260 260 0 0 0 270 600" fill="none" stroke="#ffffff" stroke-width="15" stroke-linecap="round" stroke-opacity="0.75" />
    <path d="M 210 260 A 340 340 0 0 0 210 660" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-opacity="0.5" />

    <!-- White Sound Wave Acoustic Lines (Right side) -->
    <path d="M 694 380 A 180 180 0 0 1 694 540" fill="none" stroke="#ffffff" stroke-width="18" stroke-linecap="round" stroke-opacity="0.95" />
    <path d="M 754 320 A 260 260 0 0 1 754 600" fill="none" stroke="#ffffff" stroke-width="15" stroke-linecap="round" stroke-opacity="0.75" />
    <path d="M 814 260 A 340 340 0 0 1 814 660" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-opacity="0.5" />

    <!-- Yellow Studio Microphone Capsule -->
    <rect x="424" y="240" width="176" height="290" rx="88" ry="88" fill="url(#micGradA)" stroke="#fef08a" stroke-width="8" />

    <!-- Microphone Grille Mesh Pattern / Lines (White & Dark Highlights) -->
    <line x1="432" y1="330" x2="592" y2="330" stroke="#78350f" stroke-width="8" stroke-opacity="0.5" />
    <line x1="432" y1="375" x2="592" y2="375" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-opacity="0.95" />
    <line x1="432" y1="420" x2="592" y2="420" stroke="#78350f" stroke-width="8" stroke-opacity="0.5" />

    <!-- Vertical Capsule Light Reflection (White Line) -->
    <path d="M 456 280 Q 456 380 456 460" stroke="#ffffff" stroke-width="11" stroke-linecap="round" stroke-opacity="0.85" />

    <!-- Lower U-Shaped Cradle Mount (White & Yellow) -->
    <path d="M 374 410 C 374 590, 650 590, 650 410" fill="none" stroke="#f59e0b" stroke-width="24" stroke-linecap="round" />
    <path d="M 374 410 C 374 590, 650 590, 650 410" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-opacity="0.6" />

    <!-- Stand Rod -->
    <line x1="512" y1="550" x2="512" y2="690" stroke="#f59e0b" stroke-width="24" stroke-linecap="round" />
    <line x1="512" y1="550" x2="512" y2="690" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-opacity="0.7" />

    <!-- Base Stand Plate -->
    <line x1="400" y1="690" x2="624" y2="690" stroke="#f59e0b" stroke-width="26" stroke-linecap="round" />
    <line x1="416" y1="690" x2="608" y2="690" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-opacity="0.85" />
  </g>
</svg>
`;

// Monochrome SVG for Android 13+ Themed Icons
const monochromeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <g transform="translate(512, 512) scale(0.72) translate(-512, -512)" fill="none" stroke="#ffffff" stroke-linecap="round">
    <!-- Sound Waves -->
    <path d="M 330 380 A 180 180 0 0 0 330 540" stroke-width="18" stroke-opacity="0.95" />
    <path d="M 270 320 A 260 260 0 0 0 270 600" stroke-width="15" stroke-opacity="0.75" />
    <path d="M 210 260 A 340 340 0 0 0 210 660" stroke-width="12" stroke-opacity="0.5" />
    <path d="M 694 380 A 180 180 0 0 1 694 540" stroke-width="18" stroke-opacity="0.95" />
    <path d="M 754 320 A 260 260 0 0 1 754 600" stroke-width="15" stroke-opacity="0.75" />
    <path d="M 814 260 A 340 340 0 0 1 814 660" stroke-width="12" stroke-opacity="0.5" />

    <!-- Capsule -->
    <rect x="424" y="240" width="176" height="290" rx="88" ry="88" fill="#ffffff" stroke="#ffffff" stroke-width="8" />
    <line x1="432" y1="375" x2="592" y2="375" stroke="#000000" stroke-width="10" stroke-opacity="0.7" />

    <!-- Cradle & Stand -->
    <path d="M 374 410 C 374 590, 650 590, 650 410" stroke-width="24" />
    <line x1="512" y1="550" x2="512" y2="690" stroke-width="24" />
    <line x1="400" y1="690" x2="624" y2="690" stroke-width="26" />
  </g>
</svg>
`;

// Adaptive Background
const adaptiveBackgroundSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#090d16" />
</svg>
`;

async function generateAssets() {
  const assetsDir = path.resolve('assets');
  const resDir = path.resolve('resources');
  const publicDir = path.resolve('public');
  
  [assetsDir, resDir, publicDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // 1. Generate master assets for Capacitor
  await sharp(Buffer.from(fullIconSvg)).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-only.png'));
  await sharp(Buffer.from(adaptiveForegroundSvg)).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-foreground.png'));
  await sharp(Buffer.from(adaptiveBackgroundSvg)).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-background.png'));
  
  await sharp(Buffer.from(fullIconSvg)).resize(512, 512).png().toFile(path.join(assetsDir, 'icon.png'));
  await sharp(Buffer.from(fullIconSvg)).resize(512, 512).png().toFile(path.join(resDir, 'icon.png'));
  await sharp(Buffer.from(fullIconSvg)).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));
  await sharp(Buffer.from(fullIconSvg)).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  await sharp(Buffer.from(fullIconSvg)).resize(64, 64).png().toFile(path.join(publicDir, 'favicon.png'));

  // Also update icon-master.svg
  fs.writeFileSync(path.resolve('icon-master.svg'), fullIconSvg.trim());

  // 2. Generate standard Android resource density buckets in android-res/ AND android/app/src/main/res/ if present
  const targetResDirs = [path.resolve('android-res')];
  const nativeAndroidRes = path.resolve('android/app/src/main/res');
  if (fs.existsSync(nativeAndroidRes)) {
    targetResDirs.push(nativeAndroidRes);
  }

  const densities = [
    { name: 'mipmap-mdpi', size: 48, adaptiveSize: 108 },
    { name: 'mipmap-hdpi', size: 72, adaptiveSize: 162 },
    { name: 'mipmap-xhdpi', size: 96, adaptiveSize: 216 },
    { name: 'mipmap-xxhdpi', size: 144, adaptiveSize: 324 },
    { name: 'mipmap-xxxhdpi', size: 192, adaptiveSize: 432 },
  ];

  for (const baseResDir of targetResDirs) {
    for (const density of densities) {
      const dir = path.join(baseResDir, density.name);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // ic_launcher.png
      await sharp(Buffer.from(fullIconSvg))
        .resize(density.size, density.size)
        .png()
        .toFile(path.join(dir, 'ic_launcher.png'));

      // ic_launcher_round.png
      await sharp(Buffer.from(roundIconSvg))
        .resize(density.size, density.size)
        .png()
        .toFile(path.join(dir, 'ic_launcher_round.png'));

      // ic_launcher_foreground.png
      await sharp(Buffer.from(adaptiveForegroundSvg))
        .resize(density.adaptiveSize, density.adaptiveSize)
        .png()
        .toFile(path.join(dir, 'ic_launcher_foreground.png'));

      // ic_launcher_monochrome.png
      await sharp(Buffer.from(monochromeSvg))
        .resize(density.adaptiveSize, density.adaptiveSize)
        .png()
        .toFile(path.join(dir, 'ic_launcher_monochrome.png'));
    }

    // Generate mipmap-anydpi-v26 adaptive XML definitions
    const anyDpiDir = path.join(baseResDir, 'mipmap-anydpi-v26');
    if (!fs.existsSync(anyDpiDir)) fs.mkdirSync(anyDpiDir, { recursive: true });

    const valuesDir = path.join(baseResDir, 'values');
    if (!fs.existsSync(valuesDir)) fs.mkdirSync(valuesDir, { recursive: true });

    fs.writeFileSync(
      path.join(valuesDir, 'ic_launcher_background.xml'),
      `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#090D16</color>
</resources>`
    );

    fs.writeFileSync(
      path.join(anyDpiDir, 'ic_launcher.xml'),
      `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>`
    );

    fs.writeFileSync(
      path.join(anyDpiDir, 'ic_launcher_round.xml'),
      `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>`
    );
  }

  console.log('✅ Generated all Android launcher icons (dark background, yellow microphone, white lines) successfully.');
}

generateAssets().catch(err => {
  console.error(err);
  process.exit(1);
});

