/**
 * 新建文章（生成一份「纯 Markdown」的空文件，不带任何元信息）
 *
 * 用法：
 *   node scripts/new-post.mjs "技术笔记" "文章标题"          → article/技术笔记/2025-01-01-文章标题.md
 *   node scripts/new-post.mjs "专栏/前端手记" "文章标题"     → article/专栏/前端手记/2025-01-01-文章标题.md
 *
 * 也可以直接 npm run new -- "专栏/前端手记" "文章标题"
 *
 * 说明：标题取正文第一行的 `# 标题`，日期取文件名前缀，分类/专栏看文件夹，
 *       所以生成的文件里不需要写任何 front-matter。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COLUMN_ROOT = config.columnRoot || '专栏';

const [target = '未分类', ...titleParts] = process.argv.slice(2);
const title = titleParts.join(' ').trim() || '新的文章';

const slug =
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'untitled';

const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// 允许写 "专栏/前端手记" 这种形式；只写 "前端手记" 且该专栏已存在时，自动补上专栏容器
const parts = String(target)
  .split(/[\\/]+/)
  .map((part) => part.trim())
  .filter(Boolean);
if (parts.length === 1 && fs.existsSync(path.join(ROOT, 'article', COLUMN_ROOT, parts[0]))) {
  parts.unshift(COLUMN_ROOT);
}

const dir = path.join(ROOT, 'article', ...parts);
fs.mkdirSync(dir, { recursive: true });

const file = path.join(dir, `${date}-${slug}.md`);
if (fs.existsSync(file)) {
  console.error(`× 文件已存在：${path.relative(ROOT, file)}`);
  process.exit(1);
}

const template = `# ${title}

正文从这里开始，正常写 Markdown 就行。

## 小节标题

- 标题取上面第一行的 \`# ${title}\`
- 日期取文件名前缀 \`${date}\`
`;

fs.writeFileSync(file, template, 'utf8');
const isColumn = parts[0] === COLUMN_ROOT && parts.length >= 2;
console.log(`✓ 已创建：${path.relative(ROOT, file)}`);
console.log(`  ${isColumn ? '专栏' : '分类'}：${(isColumn ? parts.slice(1) : parts).join(' / ')}`);
console.log(`  标题取正文第一行的 “# ${title}”，日期取文件名 ${date}`);
console.log('  接下来：npm run dev（改完刷新即生效）');
