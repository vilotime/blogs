/**
 * 构建产物自检：检查生成页面里的相对链接与资源引用是否都存在
 * 用法：node scripts/check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index > -1 ? process.argv[index + 1] : undefined;
}

const SITE = path.resolve(
  ROOT,
  argValue('--out') || process.env.BLOG_OUTPUT || config.outputDir || '.',
);
const SITE_IS_ROOT = SITE === ROOT;
/** 根目录输出时，只检查构建生成的内容，不去扫描源码目录 / 工作区里的其它项目 */
const GENERATED = ['index.html', 'pages', 'category', 'column', 'tag', 'post'];

if (!fs.existsSync(path.join(SITE, 'index.html'))) {
  console.error('× 找不到 index.html，请先运行 npm run build');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = SITE_IS_ROOT
  ? GENERATED.flatMap((name) => {
      const target = path.join(SITE, name);
      if (!fs.existsSync(target)) return [];
      return fs.statSync(target).isDirectory() ? walk(target) : [target];
    })
  : walk(SITE);
const htmlFiles = files.filter((file) => file.endsWith('.html'));
const problems = [];
let checked = 0;

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const attrRe = /(?:href|src)="([^"]+)"/g;
  let match;
  while ((match = attrRe.exec(html))) {
    const url = match[1];
    if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(url)) continue;
    const [rawPath, hash] = url.split('#');
    // 去掉 ?v=xxx 这类查询串，只校验真实文件路径
    const pathname = rawPath.split('?')[0];
    if (!pathname) {
      // 纯锚点：检查本页是否有对应 id
      checked += 1;
      if (hash && !new RegExp(`id="${hash}"`).test(html)) {
        problems.push(`${path.relative(SITE, file)} → 页内锚点缺失：#${hash}`);
      }
      continue;
    }
    checked += 1;
    const target = path.resolve(path.dirname(file), pathname);
    if (!target.startsWith(SITE) || !fs.existsSync(target)) {
      problems.push(`${path.relative(SITE, file)} → 链接失效：${url}`);
      continue;
    }
    if (hash) {
      const content = fs.readFileSync(target, 'utf8');
      if (!new RegExp(`(?:id|name)="${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(content)) {
        problems.push(`${path.relative(SITE, file)} → 目标锚点缺失：${url}`);
      }
    }
  }
}

console.log(`\n检查 ${htmlFiles.length} 个页面、${checked} 个链接/资源引用`);

/* ---------- 图标 / 分享封面自检（规则见 docs/cover-and-icons.md） ---------- */
const iconProblems = [];
const icoPath = path.join(SITE, 'favicon.ico');
if (config.icons && config.icons.ico) {
  if (!fs.existsSync(icoPath)) {
    iconProblems.push('站点根目录缺少 favicon.ico（Google/Bing 会退回托管域名的图标）');
  } else {
    const buf = fs.readFileSync(icoPath);
    const magic = buf.length >= 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1;
    if (!magic) iconProblems.push('favicon.ico 不是合法 ICO（像是改了扩展名的 PNG）');
    else {
      // <link sizes> 必须和 ICO 内部真实尺寸一致：写大了浏览器会把位图放大 → 高分屏上糊
      const real = [];
      for (let i = 0; i < buf.readUInt16LE(4); i += 1) {
        const base = 6 + i * 16;
        if (base + 16 > buf.length) break;
        real.push(buf.readUInt8(base) || 256);
      }
      const declared = (
        /<link rel="icon" href="[^"]*favicon\.ico" sizes="([^"]*)">/.exec(
          fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'),
        ) || []
      )[1];
      const declaredList = (declared || '').split(/\s+/).filter(Boolean);
      if (!declared) {
        iconProblems.push('favicon.ico 的 <link> 缺少 sizes 声明');
      } else if (declaredList.includes('any')) {
        iconProblems.push('favicon.ico 不该用 sizes="any"（会让高分屏放大位图，图标变糊）');
      } else {
        const got = declaredList
          .map((s) => Number(String(s).replace(/x\d+$/i, '')))
          .sort((a, b) => a - b)
          .join(',');
        const want = real.slice().sort((a, b) => a - b).join(',');
        if (got !== want) {
          iconProblems.push(
            `favicon.ico 声明 sizes="${declared}"，但文件里实际是 ${real.map((s) => `${s}x${s}`).join(' ')}`,
          );
        }
      }
    }
  }
}
for (const png of (config.icons && config.icons.png) || []) {
  const full = path.join(SITE, png.src);
  if (!fs.existsSync(full)) {
    iconProblems.push(`缺少图标 ${png.src}`);
    continue;
  }
  const buf = fs.readFileSync(full);
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    const real = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
    if (real !== png.sizes) iconProblems.push(`${png.src} 实际 ${real}，声明 ${png.sizes}`);
  }
}
if (config.cover && fs.existsSync(path.join(SITE, config.cover))) {
  const buf = fs.readFileSync(path.join(SITE, config.cover));
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (w !== h) iconProblems.push(`分享封面 ${config.cover} 是 ${w}×${h}，不是方图（微信会裁掉两边）`);

    // 每个页面的 og:image 必须是绝对地址，且声明尺寸和封面真实尺寸一致
    for (const file of htmlFiles) {
      const html = fs.readFileSync(file, 'utf8');
      const page = path.relative(SITE, file);
      const ogImage = /<meta property="og:image" content="([^"]*)">/.exec(html)?.[1];
      const declaredW = /og:image:width" content="(\d+)"/.exec(html)?.[1];
      const declaredH = /og:image:height" content="(\d+)"/.exec(html)?.[1];
      if (ogImage && !/^https?:\/\//i.test(ogImage)) {
        iconProblems.push(`${page} → og:image 不是绝对地址（微信等不会抓相对路径）：${ogImage}`);
      }
      if ((declaredW && Number(declaredW) !== w) || (declaredH && Number(declaredH) !== h)) {
        iconProblems.push(
          `${page} → og:image 尺寸声明 ${declaredW}×${declaredH}，封面实际 ${w}×${h}`,
        );
      }
    }
  }
}
if (iconProblems.length) problems.push(...iconProblems);

// Web App Manifest：Android / 平板的「添加到主屏幕」会用这里的图标
const manifestPath = path.join(SITE, 'site.webmanifest');
if (fs.existsSync(manifestPath)) {
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    problems.push('site.webmanifest 不是合法 JSON');
  }
  if (manifest) {
    if (manifest.start_url && /^[a-z]+:\/\//i.test(manifest.start_url)) {
      problems.push(`site.webmanifest 的 start_url 用了绝对地址，子路径部署会跑偏：${manifest.start_url}`);
    }
    for (const icon of manifest.icons || []) {
      const full = path.join(SITE, icon.src || '');
      if (!icon.src || !fs.existsSync(full)) {
        problems.push(`site.webmanifest 引用的图标不存在：${icon.src}`);
        continue;
      }
      const buf = fs.readFileSync(full);
      if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
        const real = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
        if (real !== icon.sizes) {
          problems.push(`site.webmanifest 里 ${icon.src} 实际 ${real}，声明 ${icon.sizes}`);
        }
      }
    }
  }
}

// 统计信息
const relOf = (file) => path.relative(SITE, file).split(path.sep);
const postCount = htmlFiles.filter((file) => relOf(file)[0] === 'post').length;
const categoryCount = htmlFiles.filter((file) => relOf(file)[0] === 'category').length;
const tagCount = htmlFiles.filter((file) => relOf(file)[0] === 'tag').length;
const columnPages = htmlFiles.filter((file) => relOf(file)[0] === 'column');
const columnArticleCount = columnPages.filter((file) => relOf(file).length >= 3).length;
const columnIndexCount = columnPages.length - columnArticleCount;
const other = htmlFiles.length - postCount - categoryCount - tagCount - columnPages.length;
console.log(
  `  分类文章 ${postCount} · 分类页 ${categoryCount} · 专栏文章 ${columnArticleCount} · 专栏页 ${columnIndexCount} · 标签页 ${tagCount} · 其他 ${other}`,
);

if (problems.length) {
  console.error(`\n× 发现 ${problems.length} 个问题：`);
  for (const problem of problems.slice(0, 50)) console.error(`  - ${problem}`);
  if (problems.length > 50) console.error(`  - 其余 ${problems.length - 50} 个已省略`);
  process.exitCode = 1;
} else {
  console.log('\n✓ 所有链接与资源引用均可用');
}
