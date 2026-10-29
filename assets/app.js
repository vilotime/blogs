/* ============================================================
   个人博客 · 前端交互（零依赖）
   - 主题切换（记忆到 localStorage）
   - 移动端侧栏抽屉（点击展开 / 点击遮罩关闭）
   - 首页 / 归档搜索过滤
   - 代码块一键复制
   - 文章目录滚动高亮 + 阅读进度条
   ============================================================ */
(function () {
  'use strict';

  var THEME_KEY = 'blog-theme';
  var MOBILE_BREAKPOINT = 1080;

  /* ---------------- 主题 ---------------- */
  function currentTheme() {
    var saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {}
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
      btn.setAttribute('title', theme === 'dark' ? '浅色模式' : '深色模式');
    });
  }

  function syncThemeLabel() {
    var theme = document.documentElement.getAttribute('data-theme') || currentTheme();
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
      btn.setAttribute('title', theme === 'dark' ? '浅色模式' : '深色模式');
    });
  }

  document.addEventListener('click', function (event) {
    var toggle = event.target.closest('[data-theme-toggle]');
    if (toggle) {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return;
    }
    var searchToggle = event.target.closest('[data-search-toggle]');
    if (searchToggle) {
      var quickSearch = document.querySelector('[data-filter]');
      if (quickSearch) {
        quickSearch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function () {
          quickSearch.focus();
          quickSearch.select();
        }, 220);
      }
      return;
    }
    var copyBtn = event.target.closest('[data-copy]');
    if (copyBtn) {
      var pre = copyBtn.closest('.code-block');
      var code = pre ? pre.querySelector('code') : null;
      if (!code) return;
      var text = code.innerText;
      var done = function () {
        copyBtn.textContent = '已复制';
        copyBtn.classList.add('is-done');
        setTimeout(function () {
          copyBtn.textContent = '复制';
          copyBtn.classList.remove('is-done');
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          done();
        } catch (e) {}
        document.body.removeChild(ta);
      }
    }
  });

  /* ---------------- 移动端折叠式侧栏（抽屉） ---------------- */
  function setupDrawer() {
    var sidebar = document.getElementById('sidebar');
    var toggle = document.getElementById('navToggle');
    var backdrop = document.getElementById('navBackdrop');
    var panel = document.getElementById('sidebarPanel');
    if (!sidebar || !toggle) return;

    function setOpen(open) {
      sidebar.classList.toggle('open', open);
      if (backdrop) backdrop.classList.toggle('show', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? '收起菜单' : '展开菜单');
    }

    toggle.addEventListener('click', function () {
      setOpen(!sidebar.classList.contains('open'));
    });

    if (backdrop) {
      backdrop.addEventListener('click', function () {
        setOpen(false);
      });
    }

    if (panel) {
      /* 选中入口后收起抽屉 */
      panel.addEventListener('click', function (event) {
        if (event.target.closest('a')) setOpen(false);
      });
    }

    window.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' || event.key === 'Esc') setOpen(false);
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > MOBILE_BREAKPOINT) setOpen(false);
    });

    /* 前进/后退回来时保持收起状态 */
    window.addEventListener('pageshow', function () {
      setOpen(false);
    });
  }

  /* ---------------- 搜索过滤 ---------------- */
  function setupFilter() {
    var inputs = document.querySelectorAll('[data-filter]');
    inputs.forEach(function (input) {
      var scope = input.getAttribute('data-filter-scope');
      var root = scope ? document.querySelector(scope) : document;
      var targets = root.querySelectorAll('[data-search]');
      var emptyHint = document.querySelector('[data-filter-empty]');

      input.addEventListener('input', function () {
        var keyword = input.value.trim().toLowerCase();
        var visible = 0;
        targets.forEach(function (target) {
          var hit = !keyword || target.getAttribute('data-search').indexOf(keyword) > -1;
          target.classList.toggle('is-hidden', !hit);
          if (hit) visible += 1;
        });
        if (emptyHint) emptyHint.hidden = visible !== 0;
        // 归档页：隐藏空年份分组
        root.querySelectorAll('.archive-year').forEach(function (section) {
          var rows = section.querySelectorAll('[data-search]');
          var anyVisible = false;
          rows.forEach(function (row) {
            if (!row.classList.contains('is-hidden')) anyVisible = true;
          });
          section.classList.toggle('is-hidden', !anyVisible);
        });
      });

      // 快捷键：按 / 聚焦搜索
      document.addEventListener('keydown', function (event) {
        if (event.key === '/' && document.activeElement !== input) {
          var tag = (document.activeElement.tagName || '').toLowerCase();
          if (tag === 'input' || tag === 'textarea') return;
          event.preventDefault();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
          input.focus();
        }
      });
    });
  }

  /* ---------------- 目录高亮 ---------------- */
  function setupToc() {
    var toc = document.querySelector('.toc-card');
    if (!toc) return;
    var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
    if (!links.length) return;
    var map = {};
    links.forEach(function (link) {
      map[link.getAttribute('href').slice(1)] = link;
    });
    var headings = Array.prototype.slice.call(document.querySelectorAll('.post-content h2[id], .post-content h3[id]'));
    if (!headings.length) return;

    var setActive = function (id) {
      links.forEach(function (link) {
        var isActive = link.getAttribute('href') === '#' + id;
        link.parentElement.classList.toggle('is-active', isActive);
      });
    };

    var observer = new IntersectionObserver(
      function (entries) {
        var visible = entries
          .filter(function (entry) {
            return entry.isIntersecting;
          })
          .sort(function (a, b) {
            return a.boundingClientRect.top - b.boundingClientRect.top;
          });
        if (visible.length) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: '-16px 0px -70% 0px', threshold: [0, 1] },
    );

    headings.forEach(function (heading) {
      if (map[heading.id]) observer.observe(heading);
    });

    links.forEach(function (link) {
      link.addEventListener('click', function () {
        setActive(link.getAttribute('href').slice(1));
      });
    });
  }

  /* ---------------- 进度条 / 回顶部 ---------------- */
  function setupScroll() {
    var bar = document.querySelector('[data-progress]');
    var toTop = document.querySelector('[data-to-top]');
    var update = function () {
      var doc = document.documentElement;
      var scrollTop = window.scrollY || doc.scrollTop;
      var height = doc.scrollHeight - window.innerHeight;
      if (bar) bar.style.width = (height > 0 ? (scrollTop / height) * 100 : 0) + '%';
      if (toTop) toTop.classList.toggle('is-visible', scrollTop > 520);
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();

    if (toTop) {
      toTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  /* ---------------- 外部链接 / 图片增强 ---------------- */
  function enhance() {
    document.querySelectorAll('.post-content a[href^="http"]').forEach(function (link) {
      if (link.hostname !== window.location.hostname) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });
    // 图片点击放大
    document.querySelectorAll('.post-content img').forEach(function (img) {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', function () {
        window.open(img.currentSrc || img.src, '_blank', 'noopener');
      });
    });
  }

  function boot() {
    syncThemeLabel();
    setupDrawer();
    setupFilter();
    setupToc();
    setupScroll();
    enhance();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
