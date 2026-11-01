/**
 * 文章扫描与解析
 *
 * 目录约定（article/ 是唯一的内容目录，文章就是普通 Markdown，不用写任何元信息）：
 *   article/<分类文件夹>/<文章>.md              → 普通文章，文件夹名 = 分类名（可嵌套）
 *   article/<专栏容器>/<专栏文件夹>/<文章>.md    → 专栏文章，文件夹名 = 专栏名
 *   专栏容器默认叫「专栏」，可在 site.config.mjs 的 columnRoot 里改
 *
 * 从文件本身就能推出来的信息：
 *   - 标题：正文第一行的 `# 标题`，没有就用文件名
 *   - 日期：文件名前缀 `2025-05-18-`，没有就用文件修改时间
 *   - 归属：文章在哪个文件夹（分类 / 专栏）
 *   - 摘要：正文开头若干字
 *
 * 其它可选约定（写了才生效，不写完全不影响）：
 *   - 简介：分类 / 专栏文件夹里放一个 Intro.txt（纯文本，不用写任何格式），
 *     article/<分类>/Intro.txt、article/<专栏容器>/<专栏>/Intro.txt
 *     内容原样显示在对应的分类页 / 专栏页和总览卡片里；
 *     没有这个文件就什么都不显示（不会自动填「共 N 篇」之类的占位文案）
 *   - 分类 / 专栏文件夹里放 _index.md，可写 title / order 调整显示名与边栏顺序
 *   - 文章若要额外信息（tags、cover、description、draft…），也可以在开头写 YAML front-matter
 */
import fs from 'node:fs';
import path from 'node:path';
import { slugify, toPlainText, estimateReadingTime, countWords } from './markdown.mjs';

const MD_EXT = new Set(['.md', '.markdown']);
const MAX = Number.MAX_SAFE_INTEGER;

export function parseFrontMatter(raw) {
  const source = String(raw ?? '').replace(/^\uFEFF/, '');
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) return { data: {}, body: source };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key || key.startsWith('#')) continue;
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (/^\[[\s\S]*\]$/.test(value)) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else if (/^(true|false)$/i.test(value)) {
      value = value.toLowerCase() === 'true';
    }
    data[key] = value;
  }
  return { data, body: source.slice(match[0].length) };
}

function walkMarkdown(dir) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkMarkdown(full));
    } else if (entry.isFile() && MD_EXT.has(path.extname(entry.name).toLowerCase())) {
      result.push(full);
    }
  }
  return result;
}

/**
 * 文本解码：优先按 UTF-8（顺手去掉 BOM）；不是合法 UTF-8 就按 GBK 读
 * —— Windows 记事本存成「ANSI」的中文文件就是 GBK，不然简介会变成乱码
 */
function decodeText(buffer) {
  const bytes =
    buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
      ? buffer.subarray(3)
      : buffer;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('gbk').decode(bytes);
    } catch {
      return bytes.toString('utf8');
    }
  }
}

/**
 * 读专栏文件夹里的简介文件 Intro.txt（文件名大小写不敏感）。
 * 没有这个文件就返回空字符串 —— 页面上也就什么都不显示。
 * @param {string} dir 专栏文件夹（article/<专栏容器>/<专栏名>/）
 */
function readIntro(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return '';
  }
  const hit = entries.find((entry) => entry.isFile() && /^intro\.txt$/i.test(entry.name));
  if (!hit) return '';
  try {
    return decodeText(fs.readFileSync(path.join(dir, hit.name))).replace(/^\uFEFF/, '').trim();
  } catch {
    return '';
  }
}

function normalizeDate(value, fallback) {
  if (!value) return fallback;
  const raw = Array.isArray(value) ? value[0] : String(value);
  const normalized = raw.includes('T') ? raw : raw.replace(/\//g, '-');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return fallback;
  return date;
}

function pad(num) {
  return String(num).padStart(2, '0');
}

export function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 扫描 article/ 目录，得到文章、分类、专栏、标签
 * @param {string} projectRoot 项目根目录
 * @param {{columnRoot?: string}} options columnRoot = 存放专栏的容器文件夹名（默认「专栏」）
 */
export function loadContent(projectRoot, options = {}) {
  const articleRoot = path.join(projectRoot, 'article');
  const columnRoot = String(options.columnRoot || '专栏').trim() || '专栏';
  const files = walkMarkdown(articleRoot);

  const categories = new Map();
  const columns = new Map();
  const articles = [];
  /** 已占用的文章网址，用来避免同名文章互相覆盖 */
  const usedUrls = new Set();

  const getCategory = (segments) => {
    const id = segments.length ? segments.map(slugify).join('-') : 'uncategorized';
    if (!categories.has(id)) {
      categories.set(id, {
        id,
        slug: id,
        segments,
        name: segments.length ? segments.join(' / ') : '未分类',
        /** 分类文件夹里的 Intro.txt 内容（没有这个文件就是空字符串） */
        intro: '',
        order: MAX,
        latest: new Date(0),
        articles: [],
        url: `category/${id}.html`,
      });
    }
    return categories.get(id);
  };

  /** 专栏：由 article/<columnRoot>/<专栏文件夹>/ 决定 */
  const getColumn = (folderSegments) => {
    const folder = folderSegments[0];
    const slug = slugify(folder);
    if (!columns.has(slug)) {
      columns.set(slug, {
        slug,
        folder,
        name: folder,
        segments: [columnRoot, folder],
        /** 专栏文件夹里的 Intro.txt 内容（没有这个文件就是空字符串） */
        intro: '',
        order: MAX,
        latest: new Date(0),
        articles: [],
        url: `column/${slug}.html`,
      });
    }
    return columns.get(slug);
  };

  const isColumnPath = (segments) => segments.length >= 2 && segments[0] === columnRoot;

  /* ---------- 1. 读取分类 / 专栏的 _index.md（简介与排序） ---------- */
  for (const file of files) {
    const segments = path.dirname(path.relative(articleRoot, file)).split(path.sep).filter(Boolean);
    const base = path.basename(file, path.extname(file));
    if (!/^_index$/i.test(base)) continue;

    const { data } = parseFrontMatter(fs.readFileSync(file, 'utf8'));
    const numberOr = (value, fallback) =>
      value !== undefined && !Number.isNaN(Number(value)) ? Number(value) : fallback;

    if (segments[0] === columnRoot) {
      if (segments.length < 2) continue; // 专栏容器自身的 _index 暂不支持
      const column = getColumn(segments.slice(1));
      if (data.title) column.name = String(data.title);
      // 专栏简介只认 Intro.txt（见下面第 3 步），_index.md 里的 description 不再生效
      column.order = numberOr(data.order, column.order);
      continue;
    }

    const category = getCategory(segments);
    if (data.title) category.name = String(data.title);
    // 分类简介只认 Intro.txt（见下面第 3 步），_index.md 里的 description 不再生效
    category.order = numberOr(data.order, category.order);
  }

  /* ---------- 2. 读取文章 ---------- */
  for (const file of files) {
    const rel = path.relative(articleRoot, file);
    const ext = path.extname(rel);
    const dirSegments = path.dirname(rel).split(path.sep).filter(Boolean);
    let base = path.basename(rel, ext);

    if (/^_index$/i.test(base) || base.startsWith('_') || base.startsWith('.')) continue;
    if (dirSegments.some((segment) => segment.startsWith('_') || segment.startsWith('.'))) continue;
    // 专栏容器根目录下直接放 md 时没有专栏归属，忽略
    if (dirSegments[0] === columnRoot && dirSegments.length < 2) continue;

    const stat = fs.statSync(file);
    const { data, body } = parseFrontMatter(fs.readFileSync(file, 'utf8'));
    if (data.draft === true || data.draft === 'true') continue;

    const dateFromName = /^(\d{4}-\d{2}-\d{2})[-_ ]?/.exec(base);
    const date = normalizeDate(data.date, dateFromName ? new Date(dateFromName[1]) : new Date(stat.mtime));
    if (dateFromName) base = base.slice(dateFromName[0].length);

    // 标题：正文第一个 # 标题 > 文件名里的标题部分 > 日期
    const h1 = /^#\s+(.+?)\s*$/m.exec(body);
    const title = String(data.title || (h1 ? h1[1] : '') || base || formatDate(date)).trim();
    const content = h1 && !data.title ? body.replace(/^#\s+(.+?)\s*$/m, '') : body;

    const isColumn = isColumnPath(dirSegments);
    const column = isColumn ? getColumn(dirSegments.slice(1)) : null;
    const category = isColumn ? null : getCategory(dirSegments);
    const section = column || category;

    // 网址用的 slug：优先用文件名里的标题部分；文件名只有日期时，用正文标题生成
    const baseSlug =
      (base.trim() ? slugify(base) : '') || slugify(title) || `post-${articles.length + 1}`;
    const urlOf = (value) =>
      isColumn ? `column/${column.slug}/${value}.html` : `post/${category.slug}/${value}.html`;
    let slug = baseSlug;
    let suffix = 1;
    while (usedUrls.has(urlOf(slug))) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }
    const url = urlOf(slug);
    usedUrls.add(url);
    if (slug !== baseSlug) {
      console.warn(
        `  提示：${path.relative(projectRoot, file)} 与已有文章重名，网址改用 ${slug}`,
      );
    }

    const tags = Array.isArray(data.tags)
      ? data.tags
      : String(data.tags || '')
          .split(/[,，\s]+/)
          .filter(Boolean);

    const article = {
      id: `${section ? section.slug : 'misc'}/${slug}`,
      slug,
      file: path.relative(projectRoot, file).split(path.sep).join('/'),
      title,
      date,
      dateText: formatDate(date),
      year: String(date.getFullYear()),
      tags,
      kind: isColumn ? 'column' : 'category',
      category,
      column,
      /** 面包屑 / 列表里显示的位置名称与链接 */
      sectionName: section ? section.name : '未分类',
      sectionUrl: section ? section.url : 'pages/archive.html',
      /** 文章自身所在目录（相对 article/），用于定位图片等附件 */
      dirSegments,
      description: String(data.description || data.summary || '').trim() || toPlainText(content, 120),
      cover: data.cover ? String(data.cover) : '',
      content,
      readingTime: estimateReadingTime(content),
      words: countWords(content),
      url,
    };

    if (column) column.articles.push(article);
    else category.articles.push(article);
    articles.push(article);
  }

  /* ---------- 3. 简介：<文件夹>/Intro.txt ---------- */
  // 有就当成简介，没有就留空 —— 页面上不显示任何默认文案（不会自动填「共 N 篇」）
  for (const column of columns.values()) {
    column.intro = readIntro(path.join(articleRoot, columnRoot, column.folder));
  }
  for (const category of categories.values()) {
    // 未分类（文章直接放在 article/ 下）没有自己的文件夹，也就没有简介
    if (!category.segments.length) continue;
    category.intro = readIntro(path.join(articleRoot, ...category.segments));
  }

  const byDate = (a, b) => b.date - a.date || a.title.localeCompare(b.title, 'zh');

  articles.sort(byDate);

  /* ---------- 4. 排序与上一篇 / 下一篇 ---------- */
  // 分类：新文章在前
  const categoryList = [...categories.values()].filter((category) => category.articles.length > 0);
  for (const category of categoryList) {
    category.articles.sort(byDate);
    category.latest = category.articles[0]?.date ?? new Date(0);
    category.articles.forEach((article, i) => {
      article.prevInSection = category.articles[i - 1] || null;
      article.nextInSection = category.articles[i + 1] || null;
    });
  }
  categoryList.sort((a, b) => a.order - b.order || b.latest - a.latest || a.name.localeCompare(b.name, 'zh'));

  // 专栏：按日期从旧到新排列（连载读起来更顺），上一篇 = 更早的一篇
  const byDateAsc = (a, b) => a.date - b.date || a.title.localeCompare(b.title, 'zh');
  const columnList = [...columns.values()].filter((column) => column.articles.length > 0);
  for (const column of columnList) {
    column.articles.sort(byDateAsc);
    column.latest = column.articles[column.articles.length - 1]?.date ?? new Date(0);
    column.articles.forEach((article, i) => {
      article.prevInSection = column.articles[i - 1] || null;
      article.nextInSection = column.articles[i + 1] || null;
    });
  }
  columnList.sort((a, b) => a.order - b.order || b.latest - a.latest || a.name.localeCompare(b.name, 'zh'));

  /* ---------- 5. 标签 ---------- */
  const tagMap = new Map();
  for (const article of articles) {
    for (const tag of article.tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, { name: tag, slug: slugify(tag), articles: [] });
      tagMap.get(tag).articles.push(article);
    }
  }
  const tags = [...tagMap.values()].sort(
    (a, b) => b.articles.length - a.articles.length || a.name.localeCompare(b.name, 'zh'),
  );

  return { articles, categories: categoryList, columns: columnList, tags, columnRoot };
}
