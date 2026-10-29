/**
 * 零依赖 Markdown 渲染器
 * 支持：标题、段落、粗体/斜体/删除线/高亮、行内代码、围栏代码块、缩进代码块、
 *       有序/无序列表（可嵌套、任务列表）、引用、水平线、表格、图片、链接、裸链接、块级 HTML 直通。
 * 设计目标：离线可用、无第三方依赖、输出可信 HTML。
 */

const PH_OPEN = '\uE000';
const PH_CLOSE = '\uE001';

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function slugify(text = '') {
  const slug = String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'section';
}

function createStore() {
  const items = [];
  return {
    add(html) {
      items.push(html);
      return `${PH_OPEN}${items.length - 1}${PH_CLOSE}`;
    },
    restore(text) {
      return text.replace(
        new RegExp(`${PH_OPEN}(\\d+)${PH_CLOSE}`, 'g'),
        (_m, idx) => items[Number(idx)] ?? '',
      );
    },
    get size() {
      return items.length;
    },
  };
}

const BLOCK_TAGS = [
  'div', 'p', 'figure', 'figcaption', 'img', 'video', 'iframe', 'picture', 'table', 'thead',
  'tbody', 'tr', 'td', 'th', 'section', 'article', 'aside', 'details', 'summary', 'center',
  'hr', 'br', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'svg', 'canvas', 'style', 'script', 'audio', 'source', 'form', 'input', 'label',
];

const HTML_BLOCK_RE = new RegExp(`^\\s*<(?:${BLOCK_TAGS.join('|')})\\b`, 'i');

/* ------------------------------------------------------------------ 行内渲染 */

function renderEmphasis(text, store) {
  let out = text;
  // 行内代码优先于强调
  out = out.replace(/`([^`\n]+)`/g, (_m, code) => store.add(`<code>${code}</code>`));
  // 图片
  out = out.replace(
    /!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+&quot;([^&]*)&quot;|\s+"([^"]*)")?\s*\)/g,
    (_m, alt, src, t1, t2) => {
      const title = t1 || t2;
      return store.add(
        `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy" decoding="async">`,
      );
    },
  );
  // 链接
  out = out.replace(
    /\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+&quot;([^&]*)&quot;|\s+"([^"]*)")?\s*\)/g,
    (_m, label, href, t1, t2) => {
      const title = t1 || t2;
      const external = /^https?:\/\//i.test(href);
      const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
      return store.add(
        `<a href="${href}"${title ? ` title="${title}"` : ''}${attrs}>${label || href}</a>`,
      );
    },
  );
  // 裸链接
  out = out.replace(
    /(^|[\s(（「])((?:https?:\/\/|mailto:)[^\s<>"']+[^\s<>"'.,;:!?)\]）」。，；：！？])/g,
    (_m, head, url) => {
      const ext = /^mailto:/i.test(url) ? '' : ' target="_blank" rel="noopener noreferrer"';
      return `${head}${store.add(`<a href="${url}"${ext}>${url}</a>`)}`;
    },
  );
  // 强调
  out = out
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
  return out;
}

function renderInline(raw) {
  const store = createStore();
  let out = escapeHtml(raw);
  // 反斜杠转义
  out = out.replace(/\\([\\`*_{}[\]()#+\-.!~=|>&])/g, (_m, ch) => store.add(ch));
  out = renderEmphasis(out, store);
  return store.restore(out);
}

/* ------------------------------------------------------------------ 表格 */

function splitRow(line) {
  let str = line.trim();
  if (str.startsWith('|')) str = str.slice(1);
  if (str.endsWith('|')) str = str.slice(0, -1);
  return str.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitRow(line);
  if (!cells.length) return false;
  return cells.every((cell) => /^:?-{1,}:?$/.test(cell.replace(/\s/g, '')));
}

function renderTable(headerLine, separatorLine, rows) {
  const align = splitRow(separatorLine).map((cell) => {
    const t = cell.replace(/\s/g, '');
    if (t.startsWith(':') && t.endsWith(':')) return 'center';
    if (t.endsWith(':')) return 'right';
    if (t.startsWith(':')) return 'left';
    return '';
  });
  const th = splitRow(headerLine)
    .map((cell, i) => {
      const a = align[i] ? ` style="text-align:${align[i]}"` : '';
      return `<th${a}>${renderInline(cell)}</th>`;
    })
    .join('');
  const body = rows
    .map((row) => {
      const cells = splitRow(row);
      while (cells.length < align.length) cells.push('');
      const tds = cells
        .slice(0, Math.max(align.length, cells.length))
        .map((cell, i) => {
          const a = align[i] ? ` style="text-align:${align[i]}"` : '';
          return `<td${a}>${renderInline(cell)}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* ------------------------------------------------------------------ 列表 */

const LIST_ITEM_RE = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)([\s\S]*)$/;

function indentWidth(text) {
  const m = /^[ \t]*/.exec(text)[0];
  return m.replace(/\t/g, '    ').length;
}

function renderListItemBody(bodyLines, ctx) {
  const text = bodyLines.join('\n');
  const html = renderBlocks(text, ctx, { inListItem: true });
  // 紧凑列表：单个段落时去掉 <p> 包裹
  if (!/\n\s*\n/.test(text.trim()) && /^<p>[\s\S]*<\/p>$/.test(html.trim())) {
    return html.trim().replace(/^<p>/, '').replace(/<\/p>$/, '');
  }
  return html;
}

function renderList(lines, start, ctx) {
  const first = LIST_ITEM_RE.exec(lines[start]);
  const baseIndent = indentWidth(first[1]);
  const ordered = /^\d/.test(first[2]);
  const items = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // 空行后若仍是本层列表项，则继续（松散列表）
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const next = j < lines.length ? LIST_ITEM_RE.exec(lines[j]) : null;
      const nextIndent = next ? indentWidth(next[1]) : -1;
      if (next && nextIndent >= baseIndent) {
        items[items.length - 1].blankInside = true;
        items[items.length - 1].body.push('');
        i = j;
        continue;
      }
      break;
    }
    const m = LIST_ITEM_RE.exec(line);
    const indent = indentWidth(line);
    if (m && indent === baseIndent) {
      const markerOrdered = /^\d/.test(m[2]);
      if (markerOrdered !== ordered) break;
      const content = m[4];
      const task = /^\[([ xX])\]\s+/.exec(content);
      items.push({
        content: task ? content.slice(task[0].length) : content,
        task: task ? task[1].toLowerCase() === 'x' : null,
        body: [],
        blankInside: false,
      });
      i += 1;
      continue;
    }
    if (m && indent < baseIndent) break;
    if (!items.length) break;
    if (m && indent > baseIndent) {
      // 更深缩进的列表项：属于上一项的子列表，去掉 baseIndent + 2 的公共缩进
      const strip = Math.min(indentWidth(line), baseIndent + 2);
      items[items.length - 1].body.push(line.slice(Math.min(strip, line.length)));
      i += 1;
      continue;
    }
    // 惰性续行：属于上一个列表项的段落
    if (/^\s*$/.test(line)) break;
    if (HTML_BLOCK_RE.test(line) || /^\s{0,3}(#{1,6}\s|```|~~~|>)/.test(line)) {
      items[items.length - 1].body.push(line);
      i += 1;
      continue;
    }
    const strip = Math.min(indentWidth(line), baseIndent + 2);
    items[items.length - 1].body.push(line.slice(Math.min(strip, line.length)));
    i += 1;
  }

  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered ? Number(/^\d+/.exec(first[2])[0]) : 1;
  const startNum = startAttr !== 1 ? ` start="${startAttr}"` : '';
  const isTaskList = items.some((item) => item.task !== null);
  const cls = ['list'];
  if (isTaskList) cls.push('task-list');
  if (items.some((item) => item.blankInside)) cls.push('loose');

  const html = items
    .map((item) => {
      const bodyLines = [item.content, ...item.body];
      let inner = renderListItemBody(bodyLines, ctx);
      if (item.task !== null) {
        const checked = item.task ? ' checked' : '';
        inner = `<label class="task"><input type="checkbox" disabled${checked}> <span>${inner}</span></label>`;
      }
      return `<li>${inner}</li>`;
    })
    .join('');

  return { html: `<${tag}${startNum} class="${cls.join(' ')}">${html}</${tag}>`, next: i };
}

/* ------------------------------------------------------------------ 块级渲染 */

function renderHeading(level, text, ctx) {
  const plain = text.replace(/[*_`~]/g, '').trim();
  const base = slugify(plain);
  const count = ctx.slugCounts.get(base) ?? 0;
  ctx.slugCounts.set(base, count + 1);
  const id = count === 0 ? base : `${base}-${count + 1}`;
  ctx.headings.push({ level, text: plain, id });
  return `<h${level} id="${id}">${renderInline(text)}<a class="anchor" href="#${id}" aria-hidden="true">#</a></h${level}>`;
}

function renderBlocks(text, ctx, options = {}) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // 围栏代码块
    const fence = /^\s{0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)[ \t]*$/.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const lang = fence[2] || '';
      const buffer = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^\\s{0,3}${marker}{3,}\\s*$`).test(lines[i])) {
        buffer.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过结束围栏
      const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
      blocks.push(
        `<div class="code-block">${label}<button class="copy-btn" type="button" data-copy>复制</button><pre><code${langClass}>${escapeHtml(buffer.join('\n'))}</code></pre></div>`,
      );
      continue;
    }

    // 标题
    const heading = /^\s{0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*\s*$/.exec(line);
    if (heading) {
      blocks.push(renderHeading(heading[1].length, heading[2], ctx));
      i += 1;
      continue;
    }

    // 水平线
    if (/^\s{0,3}((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/.test(line)) {
      blocks.push('<hr>');
      i += 1;
      continue;
    }

    // 引用
    if (/^\s{0,3}>/.test(line)) {
      const buffer = [];
      while (i < lines.length && (/^\s{0,3}>/.test(lines[i]) || (buffer.length && lines[i].trim()))) {
        buffer.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i += 1;
      }
      const inner = renderBlocks(buffer.join('\n'), ctx);
      blocks.push(`<blockquote>${inner}</blockquote>`);
      continue;
    }

    // 表格
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(lines[i]);
        i += 1;
      }
      blocks.push(renderTable(lines[i - rows.length - 2], lines[i - rows.length - 1], rows));
      continue;
    }

    // 列表
    if (LIST_ITEM_RE.test(line)) {
      const { html, next } = renderList(lines, i, ctx);
      blocks.push(html);
      i = next;
      continue;
    }

    // 块级 HTML 直通
    if (HTML_BLOCK_RE.test(line)) {
      const buffer = [];
      while (i < lines.length && lines[i].trim()) {
        buffer.push(lines[i]);
        i += 1;
      }
      blocks.push(buffer.join('\n'));
      continue;
    }

    // 缩进代码块
    if (/^\s{4,}\S/.test(line) && !options.inListItem) {
      const buffer = [];
      while (i < lines.length && (/^\s{4,}/.test(lines[i]) || !lines[i].trim())) {
        buffer.push(lines[i].replace(/^ {4}/, ''));
        i += 1;
      }
      while (buffer.length && !buffer[buffer.length - 1].trim()) buffer.pop();
      blocks.push(
        `<div class="code-block"><button class="copy-btn" type="button" data-copy>复制</button><pre><code>${escapeHtml(buffer.join('\n'))}</code></pre></div>`,
      );
      continue;
    }

    // 段落
    const buffer = [line];
    i += 1;
    while (i < lines.length && lines[i].trim()) {
      const next = lines[i];
      if (
        /^\s{0,3}(#{1,6})\s/.test(next) ||
        /^\s{0,3}(`{3,}|~{3,})/.test(next) ||
        /^\s{0,3}>/.test(next) ||
        LIST_ITEM_RE.test(next) ||
        HTML_BLOCK_RE.test(next) ||
        /^\s{0,3}((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/.test(next)
      ) {
        break;
      }
      buffer.push(next);
      i += 1;
    }
    blocks.push(`<p>${renderInline(buffer.join('\n').trim())}</p>`);
  }

  return blocks.join('\n');
}

/* ------------------------------------------------------------------ 导出 */

export function renderMarkdown(source, options = {}) {
  const ctx = { headings: [], slugCounts: new Map() };
  const html = renderBlocks(String(source ?? ''), ctx);
  return { html, headings: ctx.headings };
}

/** 提取纯文本摘要（用于列表、SEO 描述） */
export function toPlainText(markdown, limit = 160) {
  const text = String(markdown ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_`~=|]/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}…`;
}

/** 统计阅读时长（中文按 350 字/分钟，英文按 200 词/分钟） */
export function estimateReadingTime(markdown) {
  const text = toPlainText(markdown, Number.MAX_SAFE_INTEGER);
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
  const minutes = cjk / 350 + words / 200;
  return Math.max(1, Math.ceil(minutes));
}

/** 统计正文字数（不含代码块） */
export function countWords(markdown) {
  const text = String(markdown ?? '').replace(/```[\s\S]*?```/g, ' ');
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + words;
}
