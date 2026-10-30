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

const OUT = path.resolve(
  ROOT,
  argValue('--out') || process.env.BLOG_OUTPUT || config.outputDir || '.',
);
const GENERATED = ['index.html', 'pages', '.nojekyll', 'category', 'column', 'tag', 'post', 'media'];

if (OUT === ROOT) {
  for (const name of GENERATED) fs.rmSync(path.join(ROOT, name), { recursive: true, force: true });
  console.log('✓ 已清理根目录下的生成物（article/、assets/、scripts/ 等源码保留）');
} else {
  fs.rmSync(OUT, { recursive: true, force: true });
  console.log(`✓ 已清理 ${path.relative(ROOT, OUT)}/`);
}
