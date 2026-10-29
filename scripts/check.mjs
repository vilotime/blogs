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
