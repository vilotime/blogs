/**
 * 站点配置：改这里就能定制整站
 */
const config = {
  /** 站点标题（边栏顶部品牌名） */
  title: '博客',
  /** 品牌名下面的小字 */
  subtitle: '@vilotime',
  /** 作者名 */
  author: 'Vilot',
  /** HTML lang */
  lang: 'zh-CN',
  /** 部署后的站点地址（用于 RSS，可填本地地址） */
  siteUrl: 'https://example.com',
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
