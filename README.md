# 博客

一个**零依赖**的 Markdown 静态博客，为 **GitHub Pages** 设计：文章只写在 `article/` 里，push 之后 GitHub Actions 自动构建并发布；本地写完刷新浏览器就能看到效果。

- **只改 `article/`**：分类 = 文件夹名，专栏定义也在 `article/_columns/`，图片放文章同目录；不需要动任何其他文件
- **改完直接生效**：本地开着 `npm run dev`，改完 Markdown 刷新页面即可（服务器会先比对改动时间再重建）；线上 push 即自动发布
- 页面布局：**左侧边栏（站点导航 / 分类 / 专栏 / 标签）+ 右侧主栏（正文）**
- 移动端（≤1080px）：边栏收成顶部工具条，点 ☰ 弹出圆角抽屉；☰ 变 ✕、面板滑入 + 轻微放大、条目逐个入场，点遮罩 / ✕ / Esc / 任意链接都收起
- 字体：系统普通字体（无衬线，中文用系统黑体），不使用任何 Web 字体
- 首页默认展示**最新文章列表（最多 10 篇）**
- 分类 = 文件夹名，支持嵌套分类
- **专栏**：与分类平级的另一条主线，用 `article/专栏/<专栏名>/` 文件夹承载，边栏与导航都有入口
- 文章页：目录（TOC）、专栏卡片、上一篇 / 下一篇、相关文章、阅读时长、代码复制、深浅色主题
- 归档 / 分类 / 专栏 / 标签 / RSS 全部自动生成
- 生成页面**只引用本地文件**（`assets/style.css`、`assets/app.js`、`media/…`），没有任何 CDN / 外链资源
- 不需要 `npm install`，只要有 Node.js

---

## 写作流程（日常只需要这两步）

```bash
# 1. 本地预览：起一次服务，之后改完 Markdown 刷新浏览器即可
npm run dev            # → http://127.0.0.1:5173

# 2. 写完提交推送，线上自动更新
git add -A && git commit -m "写点什么" && git push
```

其它命令：

```bash
npm run new -- "技术笔记" "文章标题"          # 普通文章 → article/技术笔记/2025-01-01-文章标题.md
npm run new -- "专栏/前端手记" "文章标题"     # 专栏文章 → article/专栏/前端手记/…
npm run build                          # 手动构建到项目根目录
npm run build:dist                     # 构建到 dist/（CI 里用这个）
npm run check                          # 自检：检查生成页面里的链接与资源是否都存在
npm run clean                          # 清理生成物，回到「纯源码」状态
```

> **关于生成物**：`index.html`、`pages/`、`post/`、`tag/`、`category/`、`column/`、`media/` 都是 `npm run build` / `npm run dev` 生成出来的，正常情况下就放在项目根目录（可以直接双击 `index.html` 预览）。只有执行 `npm run clean` 才会把它们删掉，下次 `npm run dev` 或 `npm run build` 又会自动生成回来。

> **为什么改完刷新就生效？** `npm run dev` 的服务器在每次页面请求前比对 `article/`、`assets/`、`site.config.mjs` 的修改时间，发现变更就先重建再返回内容，所以不依赖文件监听是否可靠，也不用记着手动 build。
> 生成的页面在项目根目录（`index.html` + `pages/`、`post/` 等子目录），这些是**构建产物**，已在 `.gitignore` 里排除，仓库只保留源码。

---

## 目录结构

```text
blogs/
├── article/                    # ✍️ 唯一需要你编辑的目录
│   ├── 技术笔记/                # 分类文件夹 = 分类名（可嵌套：技术笔记/前端/CSS）
│   │   ├── _index.md           # 可选：这个分类的简介（title / description / order）
│   │   ├── 2025-05-18-css-design-tokens.md
│   │   └── images/pipeline.svg # 可选：文章配图，和文章放一起即可
│   ├── 生活随笔/
│   └── 专栏/                    # 📌 专栏容器（名字可用 columnRoot 配置）
│       ├── 前端手记/            #   一个文件夹 = 一个专栏
│       │   ├── _index.md       #   专栏简介（title / description / order）
│       │   ├── 01-工程化要解决什么.md
│       │   └── 04-CI与发布流程.md
│       └── 阅读与生活/
│           ├── _index.md
│           └── 2024-11-20-mythical-man-month.md
├── assets/                     # 站点样式与脚本（style.css / app.js，会被页面直接引用）
├── scripts/                    # 构建工具
│   ├── build.mjs               #   生成站点
│   ├── serve.mjs               #   本地预览（请求时自动重建）
│   ├── new-post.mjs            #   新建文章
│   ├── check.mjs               #   产物自检
│   ├── clean.mjs               #   清理生成物
│   └── lib/                    #   markdown.mjs（渲染器）、content.mjs（文章扫描）
├── .github/workflows/deploy.yml # 🚀 push 后自动构建并发布到 GitHub Pages
├── site.config.mjs             # ⚙️ 站点配置：标题、作者、导航、最新文章数量
├── package.json  README.md  .gitignore
│
│   ── 生成物（不提交，只有 index.html 在根目录，其余都在子目录里）──
├── index.html                  # 首页：最新文章列表（默认最多 10 篇）
├── pages/                      # 次级页面
│   ├── categories.html         #   分类总览
│   ├── columns.html            #   专栏总览
│   ├── archive.html            #   归档
│   └── feed.xml                #   RSS
├── category/<分类>.html         # 分类页
├── column/<专栏>.html           # 专栏页
├── post/<分类>/<文章>.html      # 文章页
├── column/<专栏>/<文章>.html    # 专栏文章页
├── media/                      # 从 article/ 复制过来的图片等附件
└── .nojekyll                   # 供 GitHub Pages 使用
```

> 标签页（`pages/tags.html`、`tag/`）**只在文章里出现标签时才生成**，平时不会多出这些页面和目录。

> 根目录下的 `games/` 是另一个独立项目（自带 `.git`），已加入 `.gitignore`，与本博客互不影响。


---

## 怎么写一篇文章

**就是普通 Markdown，不用写任何元信息。** 在 `article/` 里对应文件夹下新建一个 `.md` 文件，第一行写标题，正文随便写：

```markdown
# 用设计令牌把样式体系收敛下来

正文从这里开始，正常写 Markdown 就好。

## 二级标题

- 支持列表、表格、引用、任务列表
- 支持 `行内代码` 和代码块
```

站点从文件本身推断出需要的信息：

| 信息 | 从哪里来 | 没有时怎么办 |
| --- | --- | --- |
| 标题 | 正文第一行的 `# 标题` | 用文件名 |
| 日期 | 文件名前缀 `2025-05-18-` | 用文件修改时间 |
| 分类 / 专栏 | 文件所在的文件夹 | 归到「未分类」 |
| 摘要 | 正文开头约 120 字 | —— |
| 阅读时长 / 字数 | 正文统计 | —— |

所以**文件名建议写成 `2025-05-18-文章标题.md`**：日期前缀会自动识别，不出现在网址里，只用于排序。

#### 文件名规范（重要）

```text
article/<分类文件夹>/2025-05-18-文章标题.md
article/专栏/<专栏名>/2025-05-18-文章标题.md
```

| 规则 | 说明 |
| --- | --- |
| 格式 | `日期-标题.md`，例如 `2025-05-18-css-design-tokens.md` |
| 日期前缀 | 文件名开头的 `YYYY-MM-DD`（后面可跟 `-`、`_` 或空格）；**不写就用文件修改时间**，那时日期会随文件时间变化 |
| 扩展名 | `.md` 或 `.markdown` |
| 标题 | 取正文第一行 `# 标题`，**不是文件名**；文件名里的标题部分只决定网址 |
| 网址 | 由「去掉日期前缀的文件名」生成：保留中文、字母、数字、`-`、`_`；空格转 `-`；其它符号（`《》`、`·`、`:`、`?` 等）会被去掉。例：`2025-05-18-用设计令牌把样式收敛下来.md` → `post/技术笔记/用设计令牌把样式收敛下来.html` |
| 重名 | 同一分类（或同一专栏）里去掉日期后重名的，后一篇网址自动加 `-2`、`-3`…，并在构建日志里提示；建议直接用不同标题避开 |
| 名称开头 | 以 `_` 或 `.` 开头的文件/文件夹会被忽略：`_index.md` 是分类/专栏简介、`.gitkeep` 是占位文件 |
| 大小写 | 统一转小写，`CSS-Notes.md` 与 `css-notes.md` 是同一个网址 |

小建议：文件名里别带空格、斜杠、冒号、书名号这类符号，用 `-` 连接最稳；同一天写多篇就在标题上区分开。

> 唯一的例外是分类 / 专栏的**简介**：想给某个分类或专栏写一句介绍、或调整它在边栏的先后，可以在那个文件夹里放一个 `_index.md`（只写 `title` / `description` / `order`），不写也完全正常，就是简介留空。
> 另外，如果以后想要标签、封面图、草稿之类的东西，也可以照常在文章开头写 YAML front-matter（`tags:`、`cover:`、`draft:` 都支持），但那**不是必须的**。

### 分类（普通文章）

- **分类 = 文件夹名**。`article/技术笔记/x.md` → 分类「技术笔记」，网址 `post/技术笔记/x.html`。
- **嵌套分类**：`article/技术笔记/前端/CSS/xx.md` 会被视作「技术笔记 / 前端 / CSS」分类，逐级归入，页面显示完整路径。
- 分类内**新文章在前**。

### 专栏

专栏是**另一条组织文章的主线**，和分类平级，出现在边栏「专栏」区块与导航「专栏」页里。和分类的区别是它**用单独的子文件夹承载**，一眼就能看出哪些文章属于专栏：

```text
article/
├── 技术笔记/                  ← 普通分类
│   └── 2025-06-21-typescript-narrowing.md
├── 生活随笔/
└── 专栏/                      ← 专栏容器（文件夹名可用 columnRoot 改）
    ├── 前端手记/               ← 一个文件夹 = 一个专栏
    │   ├── _index.md          ← 可选：专栏简介（title / description / order）
    │   ├── 2025-02-10-工程化要解决什么.md
    │   └── 2025-04-22-CI与发布流程.md
    └── 阅读与生活/
        ├── _index.md
        └── 2024-11-20-mythical-man-month.md
```

- **新建专栏**：在 `article/专栏/` 下建一个文件夹即可，文件夹名就是专栏名。
- **加文章进专栏**：把 md 放进那个专栏文件夹（`npm run new -- "专栏/前端手记" "标题"` 会自动建好）。文章地址是 `column/<专栏名>/<文章名>.html`，专栏首页是 `column/<专栏名>.html`。
- **专栏内排序**：按日期**从旧到新**排列（连载读起来更顺），「上一篇」是更早那篇；所以文件名带上日期就能控制顺序。
- **嵌套**：`article/专栏/前端手记/进阶/xx.md` 仍属于「前端手记」专栏（专栏不再按层级细分）。
- 一篇文章只属于一个位置：要么在分类文件夹里，要么在专栏文件夹里。

### 配图与附件

把图片等非 Markdown 文件放在文章同目录（或子目录）中，用相对路径引用：

```markdown
![构建流程](./images/pipeline.svg)
```

构建时这些文件会被复制到 `media/<文章所在目录>/...`（专栏文章就是 `media/专栏/<专栏名>/...`），并自动改写成正确的相对路径，所以无论部署到哪一层目录都能正常显示。

---

## 自定义

改 `site.config.mjs` 即可：

```js
const config = {
  title: '时光不语的博客',    // 网页标题 / 微信收藏标题 / RSS 用（首页标题=这一行，内页=「页面名 · 这一行」）
  brand: '博客',             // 边栏顶部显示的品牌名（站内用的短名字）
  subtitle: '@vilotime',     // 品牌名旁边那行小字
  author: 'Vilot',
  siteUrl: 'https://example.com', // 部署地址；微信收藏封面（og:image）和 RSS 需要绝对地址，务必填真实域名
  latestCount: 10,          // 首页最多展示多少篇（默认 10）
  columnRoot: '专栏',        // 存放专栏的容器文件夹名（article/<columnRoot>/<专栏名>/）
  outputDir: '.',           // 输出目录：'.' = 根目录（默认）；CI 用 --out dist 覆盖
  nav: [...],               // 边栏导航
};
```

改样式改 `assets/style.css`（颜色变量集中在文件顶部 `:root` 与 `[data-theme="dark"]`，字体变量是 `--font-sans`），改交互改 `assets/app.js`。

小功能：

- 边栏底部可切换**深浅色主题**（记忆到浏览器），默认跟随系统；
- **移动端折叠侧栏**：宽度 ≤1080px 时侧栏本体变成 54px 顶部工具条，导航内容变成圆角抽屉——☰ 按钮（两条线动画成 ✕）展开、面板从左侧滑入并轻微放大、条目逐个淡入，点遮罩 / ✕ / Esc / 抽屉内任意链接收起，窗口变宽自动复位；
- 任意页面按 `/` 快速聚焦搜索框；首页搜索可按标题、标签、分类实时过滤；
- 代码块右上角「复制」按钮；文章顶部「本文目录」（可折叠）随滚动高亮。

---

## 部署到 GitHub Pages（自动）

站点是纯静态 HTML，仓库里已经带好 `.github/workflows/deploy.yml`：**你只要 push，Actions 会自动构建并发布**，仓库不需要提交任何生成文件。

一次性配置：

1. 在 GitHub 上新建仓库，把本目录推上去（默认分支 `main` 或 `master` 都可以，工作流两个都监听）：
   ```bash
   git init && git add -A && git commit -m "init blog"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
2. 打开仓库 → **Settings → Pages → Build and deployment → Source 选择 `GitHub Actions`**。
3. 之后每次推送（改文章、改样式）Actions 都会自动执行：

   ```bash
   node scripts/build.mjs --out dist   # 构建到 dist/
   node scripts/check.mjs --out dist   # 断链自检
   ```

   然后把 `dist/` 上传并发布到 `https://<你的用户名>.github.io/<仓库名>/`。

工作流只监听 `article/**`、`assets/**`、`scripts/**`、`site.config.mjs`、`package.json` 和自身的变化，纯文档改动（README 等）不会触发部署；也可以在 Actions 页面点 **Run workflow** 手动触发。

> 如果站点部署在子路径（如 `https://user.github.io/blog/`，默认如此），页面内所有链接都是相对路径，**无需额外配置**。
> 想换成自定义域名或别的静态托管（Vercel / Netlify / 对象存储）也可以：跑 `npm run build:dist` 后把 `dist/` 整个目录传上去即可。

RSS 地址：`https://<你的用户名>.github.io/<仓库名>/pages/feed.xml`。

---

## 实现说明

- `scripts/lib/markdown.mjs`：自写的 Markdown 渲染器，支持标题 / 段落 / 加粗斜体删除线高亮 / 行内代码 / 围栏与缩进代码块 / 嵌套列表 / 任务列表 / 引用 / 表格 / 图片 / 链接 / 裸链接 / 块级 HTML，先转义再替换，输出可信 HTML。
- `scripts/lib/content.mjs`：扫描 `article/`，按「文件夹 = 分类 / 专栏」解析归属（`article/专栏/<专栏名>/` 即专栏文章），标题取正文第一个 `# 标题`、日期取文件名前缀，并算出同一分类或同一专栏内的上一篇 / 下一篇。
- `scripts/build.mjs`：生成首页（最新 10 篇）、分类 / 专栏 / 标签 / 归档页、文章页与 RSS；支持 `--out <目录>` 指定输出位置。
- `scripts/serve.mjs`：本地预览服务器，每次请求前比对源文件修改时间，过期就先重建，所以改完 Markdown 刷新即生效。
- `scripts/check.mjs`：产物自检，确保没有断链。

没有任何第三方依赖，`node_modules` 也不需要。
