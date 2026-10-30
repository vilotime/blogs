/**
 * 静态站点生成器：把 article/ 下的 Markdown 文章编译成静态站点
 * 输出目录优先级：命令行 --out <dir> > 环境变量 BLOG_OUTPUT > site.config.mjs 的 outputDir > '.'
 *   - 本地：node scripts/build.mjs                  → 生成到项目根目录（index.html 在根目录）
 *   - CI  ：node scripts/build.mjs --out dist       → 生成到 dist/，供 GitHub Pages 上传
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';
import { loadContent } from './lib/content.mjs';
import { escapeHtml as esc, renderMarkdown } from './lib/markdown.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** 样式/脚本的版本号（内容哈希），用来给 <link>/<script> 加 ?v=，避免浏览器缓存旧的 CSS */
let assetVersion = { css: '', js: '' };
/** 分享封面的真实尺寸（构建时从图片头里读出来，换图不用改数字） */
let coverMeta = null;

/** 读 PNG / JPEG 的文件头拿尺寸（不依赖任何图像库） */
async function readImageMeta(relPath) {
  if (!relPath) return null;
  try {
    const buf = await fs.readFile(path.join(ROOT, relPath));
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { type: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      return { type: 'image/jpeg', width: 0, height: 0 };
    }
    return null;
  } catch {
    return null;
  }
}

async function computeAssetMeta() {
  const digest = async (relPath) => {
    try {
      const buf = await fs.readFile(path.join(ROOT, relPath));
      return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
    } catch {
      return '';
    }
  };
  assetVersion = { css: await digest('assets/style.css'), js: await digest('assets/app.js') };
  coverMeta = await readImageMeta(config.cover);
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index > -1 ? process.argv[index + 1] : undefined;
}

/** 输出目录（相对项目根目录）：--out > BLOG_OUTPUT > 配置 > '.' */
const OUTPUT_DIR = argValue('--out') || process.env.BLOG_OUTPUT || config.outputDir || '.';
const OUT = path.resolve(ROOT, OUTPUT_DIR);
const OUT_IS_ROOT = OUT === ROOT;
const MEDIA_DIR = 'media';
/** 根目录输出时只清理这些生成物，避免误删源码 */
const GENERATED = [
  'index.html',
  'pages',
  '.nojekyll',
  'category',
  'column',
  'tag',
  'post',
  'media',
  'favicon.ico',
  // 兼容旧版本生成在根目录的单文件
  'categories.html',
  'archive.html',
  'tags.html',
  'feed.xml',
];

const relFrom = (depth) => '../'.repeat(depth);
const fileSafe = (segments) => segments.filter(Boolean).join('/');

/* ------------------------------------------------------------------ 片段 */

const slugCache = new Map();
function tagSlug(tag) {
  if (!slugCache.has(tag)) {
    slugCache.set(
      tag,
      String(tag)
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'tag',
    );
  }
  return slugCache.get(tag);
}

function tagChips(tags, rel) {
  if (!tags || !tags.length) return '';
  return `<div class="chips">${tags
    .map((tag) => `<a class="chip" href="${rel}tag/${tagSlug(tag)}.html">#${esc(tag)}</a>`)
    .join('')}</div>`;
}

function postCard(article, rel, { index } = {}) {
  const number = index ? `<span class="card-index">${String(index).padStart(2, '0')}</span>` : '';
  const tags = article.tags
    .slice(0, 3)
    .map((tag) => `<span class="chip chip-static">#${esc(tag)}</span>`)
    .join('');
  const sectionLabel = article.kind === 'column' ? `专栏 · ${article.sectionName}` : article.sectionName;
  return `
        <article class="card" data-search="${esc(
          `${article.title} ${article.description} ${article.tags.join(' ')} ${article.sectionName}`.toLowerCase(),
        )}">
          ${number}
          <div class="card-body">
            <div class="card-meta">
              <a class="card-cat" href="${rel}${article.sectionUrl}">${esc(sectionLabel)}</a>
              <span class="dot"></span>
              <time datetime="${article.dateText}">${article.dateText}</time>
              <span class="dot"></span>
              <span>约 ${article.readingTime} 分钟</span>
            </div>
            <h3 class="card-title"><a href="${rel}${article.url}">${esc(article.title)}</a></h3>
            <p class="card-desc">${esc(article.description)}</p>
            ${tags ? `<div class="card-tags">${tags}</div>` : ''}
          </div>
        </article>`;
}

function compactItem(article, rel) {
  return `
          <li class="compact-item">
            <a href="${rel}${article.url}">
              <time datetime="${article.dateText}">${article.dateText.slice(5)}</time>
              <span class="compact-title">${esc(article.title)}</span>
            </a>
          </li>`;
}

/* ------------------------------------------------------------------ 边栏 */

let siteColumns = [];
function brandHtml(rel) {
  // 边栏品牌用短名字（config.brand），网页标题 / 微信标题用 config.title
  const brand = config.brand || config.title;
  return `<a class="brand" href="${rel}index.html">
          <span class="brand-mark" aria-hidden="true"></span>
          <span class="brand-text">
            <strong>${esc(brand)}</strong>
            <small>${esc(config.subtitle)}</small>
          </span>
        </a>`;
}

function renderSidebar({ rel, categories, columns = siteColumns, tags = [], articles, active, activeCategory, activeColumn }) {
  const hasTags = Array.isArray(tags) && tags.length > 0;
  const nav = config.nav
    .filter((item) => item.key !== 'tags' || hasTags)
    .map(
      (item) =>
        `<a class="side-nav-link${item.key === active ? ' is-active' : ''}" href="${rel}${item.href}">${esc(item.label)}</a>`,
    )
    .join('');

  const categoryItems = categories
    .map(
      (category) => `
          <li${category.slug === activeCategory ? ' class="is-active"' : ''}>
            <a href="${rel}category/${category.slug}.html">
              <span class="side-name">${esc(category.name)}</span>
              <span class="side-count">${category.articles.length}</span>
            </a>
          </li>`,
    )
    .join('');

  const recentItems = articles.slice(0, 5).map((article) => compactItem(article, rel)).join('');
  const tagItems = tags
    .slice(0, 12)
    .map((tag) => `<a class="chip" href="${rel}tag/${tag.slug}.html">#${esc(tag.name)}</a>`)
    .join('');
  const columnItems = columns
    .map(
      (column) => `
          <li${column.slug === activeColumn ? ' class="is-active"' : ''}>
            <a href="${rel}${column.url}">
              <span class="side-name">${esc(column.name)}</span>
              <span class="side-count">${column.articles.length}</span>
            </a>
          </li>`,
    )
    .join('');

  const columnsBlock = columns.length
    ? `
        <section class="side-block">
          <h2 class="side-title">专栏</h2>
          <ul class="side-list">${columnItems}</ul>
        </section>`
    : '';

  const tagsBlock = hasTags
    ? `
        <section class="side-block side-extra">
          <h2 class="side-title">标签</h2>
          <div class="chips chips-wrap">${tagItems}</div>
        </section>`
    : '';

  return `
    <aside class="sidebar" id="sidebar" aria-label="站点边栏">
      <button type="button" class="nav-toggle" id="navToggle" aria-label="展开菜单" aria-expanded="false" aria-controls="sidebarPanel">
        <span class="bars" aria-hidden="true"></span>
      </button>
      <div class="sidebar-bar">
        ${brandHtml(rel)}
        <button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-label="切换主题" title="切换主题">
          <svg class="icon-sun" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <svg class="icon-moon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="sidebar-panel" id="sidebarPanel">
        <nav class="side-nav" aria-label="主导航">${nav}</nav>
        <section class="side-block">
          <h2 class="side-title">分类</h2>
          <ul class="side-list">${categoryItems}</ul>
        </section>
        ${columnsBlock}
        <section class="side-block side-extra">
          <h2 class="side-title">最近更新</h2>
          <ul class="compact-list">${recentItems}</ul>
        </section>
        ${tagsBlock}
        <div class="side-foot">
          <a href="${rel}pages/feed.xml">RSS 订阅</a>
        </div>
      </div>
    </aside>`;
}

/* ------------------------------------------------------------------ 页面骨架 */

function siteTagline() {
  return [config.title, config.subtitle].filter(Boolean).join(' · ');
}

/** 站点地址是否配置成了完整 URL（微信/社交卡片的 og:image 必须是绝对地址） */
function hasFullSiteUrl() {
  return /^https?:\/\/\S+/i.test(String(config.siteUrl || '').trim()) && !/example\.com/i.test(String(config.siteUrl));
}

/** 站点图标 <link> 链（.ico 放最前兜底，其后是 svg 和多尺寸 png） */
function iconTags(rel) {
  const icons = config.icons || {};
  const tags = [];
  if (icons.ico) tags.push(`<link rel="icon" href="${rel}favicon.ico" sizes="any">`);
  if (icons.svg) tags.push(`<link rel="icon" href="${rel}${icons.svg}" type="image/svg+xml">`);
  for (const png of icons.png || []) {
    tags.push(`<link rel="icon" href="${rel}${png.src}" type="image/png" sizes="${png.sizes}">`);
  }
  if (icons.appleTouch) {
    tags.push(
      `<link rel="apple-touch-icon" href="${rel}${icons.appleTouch.src}" sizes="${icons.appleTouch.sizes}">`,
    );
  }
  return tags.join('\n');
}

/** 分享 / 微信收藏卡片：只输出绝对地址；没有配置完整 siteUrl 就干脆不输出，免得塞个抓不到的地址 */
function ogImageTags() {
  if (!hasFullSiteUrl() || !config.cover || !coverMeta) return '';
  const url = `${String(config.siteUrl).trim().replace(/\/+$/, '')}/${config.cover}`;
  const square = coverMeta.width > 0 && coverMeta.width === coverMeta.height;
  const lines = [
    `<meta property="og:image" content="${esc(url)}">`,
    `<meta property="og:image:type" content="${coverMeta.type}">`,
  ];
  if (coverMeta.width > 0) {
    lines.push(`<meta property="og:image:width" content="${coverMeta.width}">`);
    lines.push(`<meta property="og:image:height" content="${coverMeta.height}">`);
  }
  lines.push(`<meta property="og:image:alt" content="${esc(config.title)}">`);
  lines.push(`<meta name="twitter:card" content="${square ? 'summary' : 'summary_large_image'}">`);
  lines.push(`<meta name="twitter:image" content="${esc(url)}">`);
  return lines.join('\n');
}

function layout({ depth, title, description, active, activeCategory, bodyClass = '', content, sidebar }) {
  const rel = relFrom(depth);
  // 站点没有配置简介时，用「标题 · 小字」兜底
  const metaDescription = description || siteTagline();
  const cssUrl = `${rel}assets/style.css${assetVersion.css ? `?v=${assetVersion.css}` : ''}`;
  const jsUrl = `${rel}assets/app.js${assetVersion.js ? `?v=${assetVersion.js}` : ''}`;
  const ogTags = ogImageTags();
  const twitterCardFallback = ogTags ? '' : `<meta name="twitter:card" content="summary">\n`;
  return `<!DOCTYPE html>
<html lang="${config.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDescription)}">
<meta name="author" content="${esc(config.author)}">
<meta name="generator" content="mini-blog (零依赖静态生成器)">
<!-- 分享 / 微信收藏卡片用的信息 -->
<meta property="og:site_name" content="${esc(config.title)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(metaDescription)}">
<meta property="og:type" content="${active === 'post' ? 'article' : 'website'}">
${ogTags}
${twitterCardFallback}<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(metaDescription)}">
${iconTags(rel)}
<link rel="alternate" type="application/rss+xml" title="${esc(config.title)}" href="${rel}pages/feed.xml">
<link rel="stylesheet" href="${cssUrl}">
<script>
  (function () {
    try {
      var saved = localStorage.getItem('blog-theme');
      if (saved) document.documentElement.setAttribute('data-theme', saved);
    } catch (e) {}
  })();
</script>
</head>
<body class="${bodyClass}">
<div class="reading-progress" data-progress></div>
<div class="nav-backdrop" id="navBackdrop"></div>
<div class="shell">
  ${sidebar}
  <div class="main-col">
    <main class="main">${content}</main>
  </div>
</div>
<button class="to-top" type="button" data-to-top aria-label="回到顶部">↑</button>
<script src="${jsUrl}" defer></script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ 页面：首页 */

function renderIndex({ articles, categories, columns, tags }) {
  const latest = articles.slice(0, config.latestCount);
  const cards =
    latest.map((article, i) => postCard(article, '', { index: i + 1 })).join('') ||
    '<p class="empty">还没有文章。把 Markdown 文件放进 <code>article/</code> 下（第一行写 <code># 标题</code>、文件名带日期），push 后会自动发布。</p>';

  const content = `
  <section class="hero">
    <p class="hero-kicker">${esc(config.subtitle)}</p>
    <h1 class="hero-title">最新 ${latest.length} 篇文章</h1>
    <div class="hero-stats">
      <span><strong>${articles.length}</strong> 篇文章</span>
      <span><strong>${categories.length}</strong> 个分类</span>
      ${columns.length ? `<span><strong>${columns.length}</strong> 个专栏</span>` : ''}
      ${tags.length ? `<span><strong>${tags.length}</strong> 个标签</span>` : ''}
    </div>
    <div class="search-box">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" data-filter placeholder="搜索标题或分类…" aria-label="搜索文章">
    </div>
  </section>
  <section class="cards">${cards}</section>
  <p class="empty" data-filter-empty hidden>没有匹配的文章。</p>
  <div class="more-link"><a href="pages/archive.html">查看全部 ${articles.length} 篇文章 →</a></div>`;

  return layout({
    depth: 0,
    title: config.title,
    description: '',
    active: 'home',
    bodyClass: 'page-home',
    content,
    sidebar: renderSidebar({ rel: '', categories, tags, articles, active: 'home', activeCategory: null }),
  });
}

/* ------------------------------------------------------------------ 页面：分类总览 */

function renderCategories({ articles, categories, columns, tags }) {
  const cards = categories
    .map((category) => {
      const latest = category.articles.slice(0, 4).map((article) => compactItem(article, '../')).join('');
      return `
      <article class="category-card">
        <header>
          <h2><a href="../category/${category.slug}.html">${esc(category.name)}</a></h2>
          <span class="category-count">${category.articles.length} 篇</span>
        </header>
        <p class="category-desc">${esc(category.description || '暂无描述')}</p>
        <ul class="compact-list">${latest}</ul>
        <a class="category-more" href="../category/${category.slug}.html">查看全部 →</a>
      </article>`;
    })
    .join('');

  const content = `
  <header class="page-head">
    <h1>分类</h1>
    <p>共 ${categories.length} 个分类，按最近更新排序。</p>
  </header>
  <section class="category-grid">${cards || '<p class="empty">暂无分类。</p>'}</section>`;

  return layout({
    depth: 1,
    title: `分类 · ${config.title}`,
    description: `全部文章分类，共 ${categories.length} 个。`,
    active: 'categories',
    content,
    sidebar: renderSidebar({ rel: '../', categories, columns, tags, articles, active: 'categories', activeCategory: null }),
  });
}

/* ------------------------------------------------------------------ 页面：单个分类 */

function renderCategory(category, { articles, categories, columns, tags }) {
  const list = category.articles.map((article) => postCard(article, '../')).join('');

  const content = `
  <header class="page-head">
    <nav class="breadcrumb"><a href="../index.html">首页</a><span>/</span><a href="../pages/categories.html">分类</a><span>/</span><b>${esc(category.name)}</b></nav>
    <h1>${esc(category.name)}</h1>
    <p>${esc(category.description || `该分类下共 ${category.articles.length} 篇文章`)}</p>
    <div class="page-head-meta"><span>${category.articles.length} 篇文章</span><span class="dot"></span><span>最近更新 ${category.latestText || ''}</span></div>
  </header>
  <section class="cards">${list || '<p class="empty">该分类下还没有文章。</p>'}</section>`;

  return layout({
    depth: 1,
    title: `${category.name} · ${config.title}`,
    description: category.description || `${category.name}分类下的全部文章`,
    active: 'categories',
    activeCategory: category.slug,
    content,
    sidebar: renderSidebar({ rel: '../', categories, columns, tags, articles, active: 'categories', activeCategory: category.slug }),
  });
}

/* ------------------------------------------------------------------ 页面：专栏总览 */

function renderColumns({ articles, categories, columns, tags }) {
  const cards = columns
    .map((column) => {
      const latest = column.articles.slice(0, 4).map((article) => compactItem(article, '../')).join('');
      return `
      <article class="category-card">
        <header>
          <h2><a href="../${column.url}">${esc(column.name)}</a></h2>
          <span class="category-count">${column.articles.length} 篇</span>
        </header>
        <p class="category-desc">${esc(column.description || '暂无描述')}</p>
        <ul class="compact-list">${latest}</ul>
        <a class="category-more" href="../${column.url}">查看专栏 →</a>
      </article>`;
    })
    .join('');

  const content = `
  <header class="page-head">
    <h1>专栏</h1>
    <p>共 ${columns.length} 个专栏。专栏可以跨分类，把同一主题的文章串成一条线。</p>
  </header>
  <section class="category-grid">${
    cards ||
    '<p class="empty">还没有专栏。在 <code>article/_columns/</code> 下新建一个 Markdown 文件即可定义专栏。</p>'
  }</section>`;

  return layout({
    depth: 1,
    title: `专栏 · ${config.title}`,
    description: `全部专栏，共 ${columns.length} 个。`,
    active: 'columns',
    content,
    sidebar: renderSidebar({ rel: '../', categories, columns, tags, articles, active: 'columns' }),
  });
}

/* ------------------------------------------------------------------ 页面：单个专栏 */

function renderColumn(column, { articles, categories, columns, tags }) {
  const list = column.articles.map((article) => postCard(article, '../')).join('');

  const content = `
  <header class="page-head">
    <nav class="breadcrumb"><a href="../index.html">首页</a><span>/</span><a href="../pages/columns.html">专栏</a><span>/</span><b>${esc(column.name)}</b></nav>
    <h1>${esc(column.name)} <span class="badge">专栏</span></h1>
    <p>${esc(column.description || `该专栏共 ${column.articles.length} 篇文章`)}</p>
    <div class="page-head-meta"><span>${column.articles.length} 篇文章</span><span class="dot"></span><span>最近更新 ${column.latestText || ''}</span></div>
  </header>
  <section class="cards">${list || '<p class="empty">该专栏下还没有文章。</p>'}</section>`;

  return layout({
    depth: 1,
    title: `${column.name} · ${config.title}`,
    description: column.description || `${column.name}专栏下的全部文章`,
    active: 'columns',
    activeColumn: column.slug,
    content,
    sidebar: renderSidebar({ rel: '../', categories, columns, tags, articles, active: 'columns', activeColumn: column.slug }),
  });
}

/* ------------------------------------------------------------------ 页面：归档 */

function renderArchive({ articles, categories, tags }) {
  const groups = [];
  for (const article of articles) {
    const last = groups[groups.length - 1];
    if (!last || last.year !== article.year) groups.push({ year: article.year, articles: [article] });
    else last.articles.push(article);
  }
  const yearNav = groups
    .map((group) => `<a class="chip" href="#y${group.year}">${group.year}<span class="chip-count">${group.articles.length}</span></a>`)
    .join('');
  const sections = groups
    .map(
      (group) => `
      <section class="archive-year" id="y${group.year}">
        <h2>${group.year}</h2>
        <ul class="archive-list">
          ${group.articles
            .map(
              (article) => `
          <li data-search="${esc(`${article.title} ${article.tags.join(' ')} ${article.sectionName}`.toLowerCase())}">
            <time datetime="${article.dateText}">${article.dateText.slice(5)}</time>
            <a href="../${article.url}">${esc(article.title)}</a>
            <span class="archive-cat">${esc(article.sectionName)}</span>
          </li>`,
            )
            .join('')}
        </ul>
      </section>`,
    )
    .join('');

  const content = `
  <header class="page-head">
    <h1>归档</h1>
    <p>全部 ${articles.length} 篇文章，按时间倒序排列。</p>
    <div class="chips chips-wrap">${yearNav}</div>
    <div class="search-box">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" data-filter placeholder="筛选归档…" aria-label="筛选归档">
    </div>
  </header>
  ${sections || '<p class="empty">还没有文章。</p>'}`;

  return layout({
    depth: 1,
    title: `归档 · ${config.title}`,
    description: `全部 ${articles.length} 篇文章归档`,
    active: 'archive',
    content,
    sidebar: renderSidebar({ rel: '../', categories, tags, articles, active: 'archive', activeCategory: null }),
  });
}

/* ------------------------------------------------------------------ 页面：标签 */

function renderTags({ tags, articles, categories, columns }) {
  const cloud = tags
    .map(
      (tag) =>
        `<a class="chip chip-lg" href="../tag/${tag.slug}.html">#${esc(tag.name)}<span class="chip-count">${tag.articles.length}</span></a>`,
    )
    .join('');
  const content = `
  <header class="page-head">
    <h1>标签</h1>
    <p>共 ${tags.length} 个标签，${articles.length} 篇文章。</p>
  </header>
  <section class="tag-cloud">${cloud}</section>`;

  return layout({
    depth: 1,
    title: `标签 · ${config.title}`,
    description: `全部 ${tags.length} 个标签`,
    active: 'tags',
    content,
    sidebar: renderSidebar({ rel: '../', categories, columns, tags, articles, active: 'tags', activeCategory: null }),
  });
}

function renderTag(tag, { articles, categories, columns, tags }) {
  const list = tag.articles.map((article) => postCard(article, '../')).join('');
  const content = `
  <header class="page-head">
    <nav class="breadcrumb"><a href="../index.html">首页</a><span>/</span><a href="../pages/tags.html">标签</a><span>/</span><b>#${esc(tag.name)}</b></nav>
    <h1>#${esc(tag.name)}</h1>
    <p>带这个标签的文章共 ${tag.articles.length} 篇。</p>
  </header>
  <section class="cards">${list}</section>`;

  return layout({
    depth: 1,
    title: `#${tag.name} · ${config.title}`,
    description: `标签 ${tag.name} 下的全部文章`,
    active: 'tags',
    content,
    sidebar: renderSidebar({ rel: '../', categories, columns, tags, articles, active: 'tags', activeCategory: null }),
  });
}

/* ------------------------------------------------------------------ 页面：文章 */

function rewriteMedia(html, article, rel) {
  const segments = article.dirSegments || [];
  const base = segments.length ? `${MEDIA_DIR}/${fileSafe(segments)}/` : `${MEDIA_DIR}/`;
  return html.replace(/\b(src|href)="([^"]+)"/g, (match, attr, url) => {
    if (/^(?:[a-z]+:|\/|#|data:)/i.test(url)) return match;
    const cleaned = url.replace(/^\.\//, '');
    const resolved = path.posix.normalize(base + cleaned).replace(/^\.\.\//, '');
    return `${attr}="${rel}${resolved}"`;
  });
}

function renderPost(article, { articles, categories, tags }) {
  const { html, headings } = renderMarkdown(article.content);
  const content = rewriteMedia(html, article, '../../');
  const toc = headings.filter((heading) => heading.level >= 2 && heading.level <= 3);

  const tocCard =
    toc.length >= 2
      ? `
    <details class="toc-card" open>
      <summary>本文目录 <span class="toc-count">${toc.length}</span></summary>
      <ul>${toc
        .map((heading) => `<li class="toc-l${heading.level}"><a href="#${heading.id}">${esc(heading.text)}</a></li>`)
        .join('')}</ul>
    </details>`
      : '';

  // 专栏目录：默认折叠，点标题才展开（避免长专栏把正文挤下去）
  const seriesCard = article.column
    ? `
    <details class="toc-card column-card">
      <summary>专栏：${esc(article.column.name)} <span class="toc-count">${article.column.articles.length}</span></summary>
      <ol class="column-list">${article.column.articles
        .map(
          (item) =>
            `<li${item === article ? ' class="is-active"' : ''}><a href="../../${item.url}">${esc(item.title)}</a></li>`,
        )
        .join('')}</ol>
    </details>`
    : '';

  const prev = article.prevInSection;
  const next = article.nextInSection;
  const sectionWord = article.kind === 'column' ? '专栏' : '分类';
  const navHtml = `
  <nav class="post-nav">
    ${prev ? `<a class="post-nav-item prev" href="../../${prev.url}"><span>上一篇</span><strong>${esc(prev.title)}</strong></a>` : '<span class="post-nav-item is-empty"></span>'}
    ${next ? `<a class="post-nav-item next" href="../../${next.url}"><span>下一篇</span><strong>${esc(next.title)}</strong></a>` : '<span class="post-nav-item is-empty"></span>'}
  </nav>`;

  const related = articles
    .filter((item) => item !== article && item.tags.some((tag) => article.tags.includes(tag)))
    .slice(0, 3);

  const content_ = `
  <article class="post">
    <nav class="breadcrumb"><a href="../../index.html">首页</a><span>/</span><a href="../../${article.sectionUrl}">${esc(article.sectionName)}</a></nav>
    <header class="post-head">
      <div class="post-meta">
        <time datetime="${article.dateText}">${article.dateText}</time>
        <span class="dot"></span>
        <span>约 ${article.readingTime} 分钟</span>
        <span class="dot"></span>
        <span>${article.words} 字</span>
        <span class="dot"></span>
        <a class="post-column" href="../../${article.sectionUrl}">${sectionWord} · ${esc(article.sectionName)}</a>
      </div>
      <h1>${esc(article.title)}</h1>
      ${article.description ? `<p class="post-desc">${esc(article.description)}</p>` : ''}
      ${tagChips(article.tags, '../../')}
    </header>
    ${tocCard}
    ${seriesCard}
    ${article.cover ? `<img class="post-cover" src="${esc(article.cover)}" alt="${esc(article.title)}">` : ''}
    <div class="post-content">${content}</div>
    <footer class="post-foot">
      <p class="post-sign">—— 完 ——</p>
      <p class="post-source">源文件：<code>${esc(article.file)}</code></p>
    </footer>
  </article>
  ${navHtml}
  ${
    related.length
      ? `<section class="related"><h2 class="block-title">相关文章</h2><ul class="compact-list">${related
          .map((item) => compactItem(item, '../../'))
          .join('')}</ul></section>`
      : ''
  }`;

  return layout({
    depth: 2,
    title: `${article.title} · ${config.title}`,
    description: article.description,
    active: 'post',
    activeCategory: article.category ? article.category.slug : null,
    activeColumn: article.column ? article.column.slug : undefined,
    bodyClass: 'page-post',
    content: content_,
    sidebar: renderSidebar({
      rel: '../../',
      categories,
      tags,
      articles,
      active: 'post',
      activeCategory: article.category ? article.category.slug : null,
      activeColumn: article.column ? article.column.slug : undefined,
    }),
  });
}

/* ------------------------------------------------------------------ RSS */

function renderFeed(articles) {
  const items = articles
    .slice(0, 20)
    .map(
      (article) => `    <item>
      <title>${esc(article.title)}</title>
      <link>${config.siteUrl.replace(/\/$/, '')}/${article.url}</link>
      <guid isPermaLink="false">${article.id}</guid>
      <pubDate>${article.date.toUTCString()}</pubDate>
      <category>${esc(article.sectionName)}</category>
      <description>${esc(article.description)}</description>
    </item>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(config.title)}</title>
    <link>${config.siteUrl}</link>
    <description>${esc(siteTagline())}</description>
    <language>${config.lang}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

/* ------------------------------------------------------------------ 主流程 */

async function copyDir(from, to, filter = () => true) {
  if (path.resolve(from) === path.resolve(to)) return;
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDir(src, dest, filter);
    } else if (filter(src)) {
      await fs.copyFile(src, dest);
    }
  }
}

async function copyMedia(projectRoot) {
  const articleRoot = path.join(projectRoot, 'article');
  if (!(await fs.stat(articleRoot).catch(() => null))) return 0;
  let count = 0;
  const mediaRoot = path.join(OUT, MEDIA_DIR);
  const walk = async (dir, base) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const relPath = path.join(base, entry.name);
      if (entry.isDirectory()) {
        await walk(full, relPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.md', '.markdown', '.txt'].includes(ext)) continue;
        const dest = path.join(mediaRoot, relPath);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(full, dest);
        count += 1;
      }
    }
  };
  await walk(articleRoot, '');
  return count;
}

async function cleanOutput() {
  if (!OUT_IS_ROOT) {
    await fs.rm(OUT, { recursive: true, force: true });
    await fs.mkdir(OUT, { recursive: true });
    return;
  }
  // 输出到根目录：只删除生成物，保留 article/、assets/、scripts/ 等源码
  for (const name of GENERATED) {
    await fs.rm(path.join(OUT, name), { recursive: true, force: true });
  }
}

export async function main() {
  const started = Date.now();
  await cleanOutput();
  await fs.mkdir(OUT, { recursive: true });
  await computeAssetMeta();

  const { articles, categories, columns, tags } = loadContent(ROOT, { columnRoot: config.columnRoot });
  siteColumns = columns;

  // 分类 / 专栏的最近更新时间文案
  for (const category of categories) {
    const newest = category.articles[0];
    category.latestText = newest ? newest.dateText : '';
  }
  for (const column of columns) {
    const newest = column.articles[0];
    column.latestText = newest ? newest.dateText : '';
  }

  const write = async (relPath, payload) => {
    const file = path.join(OUT, relPath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, payload, 'utf8');
  };

  await write('index.html', renderIndex({ articles, categories, columns, tags }));
  await write('pages/categories.html', renderCategories({ articles, categories, columns, tags }));
  await write('pages/columns.html', renderColumns({ articles, categories, columns, tags }));
  await write('pages/archive.html', renderArchive({ articles, categories, columns, tags }));
  // 标签是可选的：没有标签时就不生成标签页（边栏里的入口也会自动隐藏）
  if (tags.length) await write('pages/tags.html', renderTags({ tags, articles, categories, columns }));

  for (const category of categories) {
    await write(`category/${category.slug}.html`, renderCategory(category, { articles, categories, columns, tags }));
  }
  for (const column of columns) {
    await write(column.url, renderColumn(column, { articles, categories, columns, tags }));
  }
  for (const tag of tags) {
    await write(`tag/${tag.slug}.html`, renderTag(tag, { articles, categories, columns, tags }));
  }
  for (const article of articles) {
    await write(article.url, renderPost(article, { articles, categories, columns, tags }));
  }
  await write('pages/feed.xml', renderFeed(articles));

  // 静态资源（输出到子目录时才需要复制；输出到根目录时 assets/ 原地使用）
  if (!OUT_IS_ROOT) await copyDir(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));
  const mediaCount = await copyMedia(ROOT);

  // 图标：favicon.ico 必须落在站点根目录（爬虫只请求 /favicon.ico）
  let iconNote = '';
  const icoSource = config.icons && config.icons.ico ? path.join(ROOT, config.icons.ico) : null;
  if (icoSource) {
    const icoStat = await fs.stat(icoSource).catch(() => null);
    if (icoStat) {
      await fs.copyFile(icoSource, path.join(OUT, 'favicon.ico'));
      iconNote = 'favicon.ico 已放到站点根目录';
    } else {
      iconNote = `× 找不到 ${config.icons.ico}（先跑 node scripts/make-icons.mjs）`;
    }
  }

  // 关闭 Jekyll 处理（若部署到 GitHub Pages）
  await fs.writeFile(path.join(OUT, '.nojekyll'), '', 'utf8');

  const ms = Date.now() - started;
  const outLabel = OUT_IS_ROOT ? '项目根目录' : path.relative(ROOT, OUT);
  console.log(`\n✓ 构建完成，用时 ${ms}ms`);
  console.log(
    `  文章 ${articles.length} 篇 · 分类 ${categories.length} 个 · 专栏 ${columns.length} 个 · 标签 ${tags.length} 个`,
  );
  console.log(`  附件 ${mediaCount} 个 · 输出目录 ${outLabel}`);
  console.log(`  首页（最新 ${Math.min(config.latestCount, articles.length)} 篇）：${path.relative(ROOT, path.join(OUT, 'index.html')) || 'index.html'}`);
  if (iconNote) console.log(`  图标：${iconNote}`);
  if (!articles.length) console.log('  提示：article/ 下还没有文章。');
  if (!hasFullSiteUrl()) {
    console.log(
      '  提示：site.config.mjs 的 siteUrl 还是示例地址 —— 分享封面（og:image）会被跳过，RSS 里的文章链接也不会是绝对地址。\n' +
        '        填成你的站点地址（如 https://<用户名>.github.io/<仓库名>）即可。',
    );
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  main().catch((error) => {
    console.error('× 构建失败：', error);
    process.exitCode = 1;
  });
}
