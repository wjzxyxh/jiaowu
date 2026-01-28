const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourceImage = path.join(__dirname, 'public', 'tubiao.png');
const publicDir = path.join(__dirname, 'public');

// 需要生成的图标尺寸
const iconSizes = [
  { size: 192, name: 'pwa-192x192.png' },
  { size: 512, name: 'pwa-512x512.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 16, name: 'favicon-16x16.png' },
];

async function generateIcons() {
  try {
    // 检查源图片是否存在
    if (!fs.existsSync(sourceImage)) {
      console.error(`源图片不存在: ${sourceImage}`);
      process.exit(1);
    }

    console.log('开始生成 PWA 图标...');

    // 生成各种尺寸的图标
    for (const { size, name } of iconSizes) {
      const outputPath = path.join(publicDir, name);
      await sharp(sourceImage)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toFile(outputPath);
      console.log(`✓ 生成 ${name} (${size}x${size})`);
    }

    // 生成 favicon.ico (使用 32x32)
    const faviconPath = path.join(publicDir, 'favicon.ico');
    await sharp(sourceImage)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .toFile(faviconPath);
    console.log('✓ 生成 favicon.ico');

    console.log('\n所有图标生成完成！');
  } catch (error) {
    console.error('生成图标时出错:', error);
    process.exit(1);
  }
}

generateIcons();
