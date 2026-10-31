/**
 * 本地预览服务器（零依赖）
 * 用法：node scripts/serve.mjs [--port 5173]
 *
 * 特点：每次页面请求前都会比对 article/、assets/、site.config.mjs 的修改时间，
 * 一旦发现变更就先重新构建再返回内容 —— 所以改完 Markdown 只要刷新浏览器即可看到最新效果，
 * 不需要手动构建，也不依赖文件监听是否生效。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';
import { main as build } from './build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index > -1 ? process.argv[index + 1] : undefined;
}

/** 对外提供的站点目录（与构建输出目录一致）：--out > BLOG_OUTPUT > 配置 > '.' */
const OUTPUT_DIR = argValue('--out') || process.env.BLOG_OUTPUT || config.outputDir || '.';
const SITE = path.resolve(ROOT, OUTPUT_DIR);
const PORT = Number(process.env.PORT || argValue('--port') || 5173);
const HOST = process.env.HOST || '127.0.0.1';
/** 站点目录就是项目根目录时，这些源码目录不对外提供 */
const BLOCKED = ['article', 'scripts', 'node_modules', '.git', '.github'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.zip': 'application/zip',
};

/* ------------------------------------------------------------------ 变更检测 */

/** 收集所有会影响产物的源文件 */
function collectSources() {
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(path.join(ROOT, 'article'));
  walk(path.join(ROOT, 'assets'));
  files.push(path.join(ROOT, 'site.config.mjs'));
  return files;
}

function sourceStamp() {
  let newest = 0;
  let total = 0;
  let count = 0;
  for (const file of collectSources()) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch (error) {
      continue;
    }
    newest = Math.max(newest, stat.mtimeMs);
    total += stat.size;
    count += 1;
  }
  return `${count}:${Math.round(newest)}:${total}`;
}

let lastStamp = null;
let lastCheckAt = 0;
let rebuilding = null;

/** 请求前确保产物是最新的（节流 200ms，避免一次页面加载触发多次重建） */
async function ensureFresh() {
  const now = Date.now();
  if (rebuilding) return rebuilding;
  if (now - lastCheckAt < 200) return undefined;
  lastCheckAt = now;

  const next = sourceStamp();
  if (lastStamp === null) {
    lastStamp = next;
    return undefined;
  }
  if (next === lastStamp) return undefined;

  lastStamp = next;
  rebuilding = (async () => {
    try {
      await build();
      console.log(`  ↻ 检测到 article/ 或 assets/ 有改动，已重建（${new Date().toLocaleTimeString('zh-CN')}）`);
    } catch (error) {
      console.error('  × 重建失败：', error.message);
    } finally {
      rebuilding = null;
    }
  })();
  return rebuilding;
}

/* ------------------------------------------------------------------ 静态文件服务 */

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const target = path.join(SITE, decoded);
  if (!target.startsWith(SITE)) return null;
  const firstSegment = path.relative(SITE, target).split(path.sep)[0];
  if (SITE === ROOT && BLOCKED.includes(firstSegment)) return null;

  let stat = await fsp.stat(target).catch(() => null);
  let file = target;
  if (stat?.isDirectory()) {
    file = path.join(target, 'index.html');
    stat = await fsp.stat(file).catch(() => null);
  }
  if (!stat?.isFile()) {
    const htmlCandidate = `${target}.html`;
    const htmlStat = await fsp.stat(htmlCandidate).catch(() => null);
    if (htmlStat?.isFile()) return htmlCandidate;
    return null;
  }
  return file;
}

function notFoundPage() {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>404</title>
<style>body{font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;background:#faf9f7;color:#1d2126;display:grid;place-items:center;height:100vh;margin:0}
main{text-align:center}h1{font-size:56px;margin:0 0 8px;color:#b4453a}p{color:#5b6270}a{color:#b4453a}</style></head>
<body><main><h1>404</h1><p>这个页面不存在。</p><p><a href="/index.html">回到首页</a></p></main></body></html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    await ensureFresh();
    const urlPath = req.url === '/' ? '/index.html' : req.url;
    const file = await resolveFile(urlPath);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(notFoundPage());
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const data = await fsp.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`500 Internal Error\n${error.message}`);
  }
});

async function start() {
  await build();
  lastStamp = sourceStamp();
  server.listen(PORT, HOST, () => {
    console.log(`\n  本地预览：http://${HOST}:${PORT}/`);
    console.log('  改完 article/ 里的 Markdown，直接刷新浏览器即可看到最新内容（无需手动构建）');
    console.log(`  站点目录：${path.relative(ROOT, SITE) || '项目根目录'}　按 Ctrl+C 退出\n`);
  });
}

start().catch((error) => {
  console.error('× 预览服务器启动失败：', error);
  process.exitCode = 1;
});
