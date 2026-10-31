/**
 * 图标工具：
 *   1. 校验 assets/img/ 下的图标文件（是否真的存在、PNG 实际尺寸和声明是否一致）
 *   2. 用 icon-16/32/48.png 组装出项目根目录的 favicon.ico（内含多个尺寸）
 *
 * 用法：node scripts/make-icons.mjs [--check]
 *   --check  只校验，不写文件
 *
 * 说明：PNG 图标本身是用 assets/img/favicon.svg 渲染出来的（矢量源在 SVG 里，
 * 想换图标改 SVG 后重新导出这些 PNG 即可）；脚本本身不依赖任何第三方库。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IMG = path.join(ROOT, 'assets', 'img');
const ICO_OUT = path.join(ROOT, 'favicon.ico');
const CHECK_ONLY = process.argv.includes('--check');

const PNG_SIZES = [
  { file: 'icon-16.png', size: 16 },
  { file: 'icon-32.png', size: 32 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];
const ICO_SIZES = [
  { file: 'icon-16.png', size: 16 },
  { file: 'icon-32.png', size: 32 },
  { file: 'icon-48.png', size: 48 },
  // 大尺寸也塞进 ICO：有些浏览器/系统只认 /favicon.ico、不读 <link> 和 manifest，
  // 里面没有大图它们就会把 48 放大成桌面图标 / 主屏图标 —— 那就是「糊」的来源
  { file: 'icon-192.png', size: 192 },
];

/** 读 PNG 头，返回真实宽高 */
function pngSize(file) {
  const buf = fs.readFileSync(file);
  const isPng = buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47;
  if (!isPng) throw new Error(`${path.basename(file)} 不是 PNG 文件`);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bytes: buf.length,
    // IHDR 第 9 个字节：0 灰度 / 2 真彩 / 3 索引 / 4 灰度+alpha / 6 真彩+alpha
    colorType: buf[25],
  };
}

/** 拼一个多尺寸 ICO（每个尺寸用 PNG 数据，浏览器/爬虫都认） */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(entries.length, 4);

  const dirSize = 16 * entries.length;
  let offset = 6 + dirSize;
  const dir = Buffer.alloc(dirSize);
  const blobs = [];

  entries.forEach((entry, i) => {
    const base = i * 16;
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 0);
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1);
    dir.writeUInt8(0, base + 2); // 调色板数
    dir.writeUInt8(0, base + 3); // 保留
    dir.writeUInt16LE(1, base + 4); // 色彩平面
    dir.writeUInt16LE(32, base + 6); // 位深
    dir.writeUInt32LE(entry.data.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += entry.data.length;
    blobs.push(entry.data);
  });

  return Buffer.concat([header, dir, ...blobs]);
}

function main() {
  const problems = [];
  const rows = [];

  for (const { file, size } of PNG_SIZES) {
    const full = path.join(IMG, file);
    if (!fs.existsSync(full)) {
      problems.push(`缺少 ${path.relative(ROOT, full)}`);
      continue;
    }
    const info = pngSize(full);
    const ok = info.width === size && info.height === size;
    if (!ok) problems.push(`${file} 实际是 ${info.width}×${info.height}，应该是 ${size}×${size}`);
    // maskable 图标必须"满版"：带 alpha 通道就说明四角/边缘是透明的，套遮罩后会露底
    if (/maskable/.test(file) && (info.colorType === 4 || info.colorType === 6)) {
      problems.push(`${file} 带 alpha 通道，maskable 图标应该是不透明的满版图（导出时别留透明）`);
    }
    rows.push(`  ${file.padEnd(22)} ${info.width}×${info.height}  ${(info.bytes / 1024).toFixed(1)} KB`);
  }

  const svgPath = path.join(IMG, 'favicon.svg');
  if (fs.existsSync(svgPath)) {
    rows.push(`  favicon.svg            ${fs.statSync(svgPath).size} B  (矢量源)`);
  } else {
    problems.push('缺少 assets/img/favicon.svg');
  }

  if (!CHECK_ONLY) {
    const entries = ICO_SIZES.map(({ file, size }) => {
      const full = path.join(IMG, file);
      if (!fs.existsSync(full)) throw new Error(`组装 ICO 失败：缺少 ${file}`);
      return { size, data: fs.readFileSync(full) };
    });
    const ico = buildIco(entries);
    fs.writeFileSync(ICO_OUT, ico);
    rows.push(
      `  favicon.ico            ${ICO_SIZES.map((e) => e.size).join('/')} 多尺寸  ${(ico.length / 1024).toFixed(1)} KB`,
    );
  } else if (fs.existsSync(ICO_OUT)) {
    const buf = fs.readFileSync(ICO_OUT);
    const realIco = buf.readUInt16LE(2) === 1 && buf.readUInt16LE(0) === 0;
    if (!realIco) problems.push('favicon.ico 不是合法的 ICO（可能是改了扩展名的 PNG）');
    rows.push(`  favicon.ico            ${buf.readUInt16LE(4)} 个尺寸  ${(buf.length / 1024).toFixed(1)} KB`);
  }

  console.log('图标清单：');
  rows.forEach((row) => console.log(row));

  if (problems.length) {
    console.error('\n× 有问题：');
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exitCode = 1;
  } else {
    console.log('\n✓ 图标文件齐全、尺寸正确');
  }
}

main();
