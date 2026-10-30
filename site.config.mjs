/**
 * 站点配置：改这里就能定制整站
 */
const config = {
  /**
   * 站点标题：浏览器标签页、微信收藏 / 分享卡片（og:site_name、og:title）、RSS 都用它
   * 内页的分享标题会拼成「页面名 · 这一行」
   */
  title: '时光不语 · 博客',
  /** 边栏顶部显示的品牌名（网站内部用的短名字） */
  brand: '博客',
  /** 品牌名旁边的小字 */
  subtitle: '@vilotime',
  /** 作者名 */
  author: 'Vilot',
  /** HTML lang */
  lang: 'zh-CN',
  /** 部署后的站点地址（用于 RSS、分享封面；必须是完整地址，微信/社交卡片要绝对 URL） */
  siteUrl: 'https://vilotime.github.io/blogs',
  /**
   * 站点图标（规则见 docs/cover-and-icons.md）
   * .ico 会在构建时复制到「站点根目录」的 /favicon.ico —— 搜索引擎只认这个路径，
   * 只给 SVG 的话 Bing 等会退回托管域名（GitHub）的图标。
   */
  icons: {
    ico: 'assets/favicon.ico',
    svg: 'assets/img/favicon.svg',
    png: [
      { src: 'assets/img/icon-16.png', sizes: '16x16' },
      { src: 'assets/img/icon-32.png', sizes: '32x32' },
      { src: 'assets/img/icon-192.png', sizes: '192x192' },
      { src: 'assets/img/icon-512.png', sizes: '512x512' },
    ],
    appleTouch: { src: 'assets/img/apple-touch-icon.png', sizes: '180x180' },
  },
  /** 分享封面（微信收藏 / QQ / Twitter 的方图，宽高在构建时自动读取） */
  cover: 'assets/img/og-cover.png',
  /** 首页最多展示的文章数量 */
  latestCount: 10,
  /**
   * 专栏容器文件夹名：article/<columnRoot>/<专栏文件夹>/ 下的文章算这个专栏的文章
   * 想改成别的名字（比如 'columns' 或 '_专栏'）就改这里
   */
  columnRoot: '专栏',
  /**
   * 构建输出目录（相对项目根目录）
   * '.' = 生成到项目根目录，index.html 就在根目录（本地 npm run dev / npm run build 默认如此）；
   *       GitHub Actions 跑 `npm run build:dist`（等价 --out dist），把产物放进 dist/ 后再发布。
   * 也可用命令行 --out <目录> 或环境变量 BLOG_OUTPUT 临时覆盖。
   */
  outputDir: '.',
  /** 导航项（页面位于 pages/、category/、tag/ 等子目录） */
  nav: [
    { label: '首页', href: 'index.html', key: 'home' },
    { label: '分类', href: 'pages/categories.html', key: 'categories' },
    { label: '专栏', href: 'pages/columns.html', key: 'columns' },
    { label: '归档', href: 'pages/archive.html', key: 'archive' },
    { label: '标签', href: 'pages/tags.html', key: 'tags' },
  ],
};

export default config;
