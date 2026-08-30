import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// 1. Exact SVG representation matching Lucide Mic2 with application branding (#020617 background, amber Mic2)
const fullIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#020617" />
  <rect x="112" y="112" width="800" height="800" rx="192" ry="192" fill="#f59e0b" fill-opacity="0.15" stroke="#f59e0b" stroke-opacity="0.30" stroke-width="16" />
  <g transform="translate(272, 272) scale(20)" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12" />
    <path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5" />
    <circle cx="16" cy="7" r="5" fill="#f59e0b" fill-opacity="0.2" />
  </g>
</svg>
`;

const roundIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <circle cx="512" cy="512" r="512" fill="#020617" />
  <circle cx="512" cy="512" r="416" fill="#f59e0b" fill-opacity="0.15" stroke="#f59e0b" stroke-opacity="0.30" stroke-width="16" />
  <g transform="translate(272, 272) scale(20)" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12" />
    <path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5" />
    <circle cx="16" cy="7" r="5" fill="#f59e0b" fill-opacity="0.2" />
  </g>
</svg>
`;

// Adaptive Foreground (432x432 inside 108dp canvas - centered safe zone)
const adaptiveForegroundSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect x="232" y="232" width="560" height="560" rx="140" ry="140" fill="#f59e0b" fill-opacity="0.18" stroke="#f59e0b" stroke-opacity="0.35" stroke-width="14" />
  <g transform="translate(344, 344) scale(14)" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12" />
    <path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5" />
    <circle cx="16" cy="7" r="5" fill="#f59e0b" fill-opacity="0.2" />
  </g>
</svg>
`;

// Adaptive Background (1024x1024 solid dark slate)
const adaptiveBackgroundSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#020617" />
</svg>
`;

async function generateAssets() {
  const assetsDir = path.resolve('assets');
  const resDir = path.resolve('resources');
  const publicDir = path.resolve('public');
  
  [assetsDir, resDir, publicDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // 1. Generate master assets for Capacitor Asset Tooling
  await sharp(Buffer.from(fullIconSvg)).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-only.png'));
  await sharp(Buffer.from(adaptiveForegroundSvg)).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-foreground.png'));
  await sharp(Buffer.from(adaptiveBackgroundSvg)).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-background.png'));
  
  await sharp(Buffer.from(fullIconSvg)).resize(512, 512).png().toFile(path.join(assetsDir, 'icon.png'));
  await sharp(Buffer.from(fullIconSvg)).resize(512, 512).png().toFile(path.join(resDir, 'icon.png'));
  await sharp(Buffer.from(fullIconSvg)).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));
  await sharp(Buffer.from(fullIconSvg)).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  await sharp(Buffer.from(fullIconSvg)).resize(64, 64).png().toFile(path.join(publicDir, 'favicon.png'));

  // 2. Generate standard Android resource density buckets in android-res/
  const androidResDir = path.resolve('android-res');
  const densities = [
    { name: 'mipmap-mdpi', size: 48, adaptiveSize: 108 },
    { name: 'mipmap-hdpi', size: 72, adaptiveSize: 162 },
    { name: 'mipmap-xhdpi', size: 96, adaptiveSize: 216 },
    { name: 'mipmap-xxhdpi', size: 144, adaptiveSize: 324 },
    { name: 'mipmap-xxxhdpi', size: 192, adaptiveSize: 432 },
  ];

  for (const density of densities) {
    const dir = path.join(androidResDir, density.name);
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
  }

  // Generate mipmap-anydpi-v26 adaptive XML definitions
  const anyDpiDir = path.join(androidResDir, 'mipmap-anydpi-v26');
  if (!fs.existsSync(anyDpiDir)) fs.mkdirSync(anyDpiDir, { recursive: true });

  const valuesDir = path.join(androidResDir, 'values');
  if (!fs.existsSync(valuesDir)) fs.mkdirSync(valuesDir, { recursive: true });

  fs.writeFileSync(
    path.join(valuesDir, 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#020617</color>
</resources>`
  );

  fs.writeFileSync(
    path.join(anyDpiDir, 'ic_launcher.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`
  );

  fs.writeFileSync(
    path.join(anyDpiDir, 'ic_launcher_round.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`
  );

  console.log('✅ Generated all Android launcher icons and adaptive assets successfully.');
}

generateAssets().catch(err => {
  console.error(err);
  process.exit(1);
});
