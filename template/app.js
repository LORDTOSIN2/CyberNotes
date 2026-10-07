/* ==========================================================================
   CyberNotes — interface behaviour
   No framework, no dependencies. Loaded with `defer` on every page; each
   initialiser returns early when its markup is absent.
   ========================================================================== */

(function () {
  'use strict';

  var THEME_KEY = 'cybernotes-theme';
  var doc = document;
  var root = doc.documentElement;

  /* ------------------------------------------------------------- utilities */

  function $(selector, scope) {
    return (scope || doc).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || doc).querySelectorAll(selector));
  }

  function basePath() {
    var meta = doc.querySelector('meta[name="site-base"]');
    return meta && meta.content ? meta.content.replace(/\/+$/, '') : '';
  }

  function link(path) {
    if (!path) return basePath() + '/';
    if (/^(?:[a-z]+:)?\/\//i.test(path) || path.charAt(0) === '#') return path;
    return basePath() + (path.charAt(0) === '/' ? path : '/' + path);
  }

  /* ----------------------------------------------------------------- theme */

  function currentTheme() {
    var explicit = root.getAttribute('data-theme');
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function initTheme() {
    var button = $('#theme-toggle');
    if (!button) return;
    button.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (error) {
        /* storage unavailable — the choice simply will not persist */
      }
      button.setAttribute('title', next === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    });
    button.setAttribute('title', currentTheme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  /* ------------------------------------------------------------- navigation */

  function initNav() {
    var toggle = $('#menu-toggle');
    var nav = $('#site-nav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    doc.addEventListener('click', function (event) {
      if (!nav.classList.contains('is-open')) return;
      if (nav.contains(event.target) || toggle.contains(event.target)) return;
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  }

  function initYear() {
    $$('[data-current-year]').forEach(function (node) {
      node.textContent = String(new Date().getFullYear());
    });
  }

  /* --------------------------------------------------------- header search */

  function initHeaderSearch() {
    var toggle = $('#search-toggle');
    var panel = $('#header-search');
    var input = $('#header-search-input');
    if (!toggle || !panel || !input) return;

    function open() {
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      input.focus();
      input.select();
    }

    function close() {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', function () {
      if (panel.hidden) open();
      else close();
    });

    doc.addEventListener('keydown', function (event) {
      var target = event.target;
      var typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        open();
      }
      if (event.key === 'Escape' && !panel.hidden) {
        close();
        toggle.focus();
      }
    });
  }

  /* ------------------------------------------------------------ code blocks */

  function initCopyButtons() {
    $$('[data-copy]').forEach(function (button) {
      button.addEventListener('click', function () {
        var block = button.closest('.code-block');
        var code = block ? $('code', block) : null;
        if (!code) return;
        var text = code.innerText;

        function done(ok) {
          var original = button.textContent;
          button.textContent = ok ? 'Copied' : 'Press Ctrl+C';
          button.classList.add('is-copied');
          window.setTimeout(function () {
            button.textContent = original;
            button.classList.remove('is-copied');
          }, 1600);
        }

        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
          return;
        }
        var area = doc.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        doc.body.appendChild(area);
        area.select();
        var ok = false;
        try { ok = doc.execCommand('copy'); } catch (error) { ok = false; }
        doc.body.removeChild(area);
        done(ok);
      });
    });
  }

  function initCopyLink() {
    $$('[data-copy-link]').forEach(function (button) {
      button.addEventListener('click', function () {
        var value = button.getAttribute('data-link') || window.location.href;
        var original = button.textContent;
        function done(ok) {
          button.textContent = ok ? 'Link copied' : value;
        }
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(value).then(function () { done(true); }, function () { done(false); });
        } else {
          window.prompt('Copy this link:', value);
        }
        window.setTimeout(function () { button.textContent = original; }, 1600);
      });
    });
  }

  /* ---------------------------------------------------------------- lightbox */

  function initLightbox() {
    var dialog = $('#lightbox');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    var image = $('[data-lightbox-img]', dialog);
    var caption = $('[data-lightbox-caption]', dialog);

    doc.addEventListener('click', function (event) {
      var trigger = event.target.closest ? event.target.closest('[data-lightbox]') : null;
      if (!trigger) return;
      event.preventDefault();
      var img = $('img', trigger);
      if (!img) return;
      image.src = img.getAttribute('src');
      image.alt = img.getAttribute('alt') || '';
      var text = trigger.getAttribute('data-caption') || img.getAttribute('alt') || '';
      caption.textContent = text;
      caption.hidden = !text;
      dialog.showModal();
    });

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
    var close = $('[data-lightbox-close]', dialog);
    if (close) close.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('close', function () {
      image.removeAttribute('src');
    });
  }

  /* ------------------------------------------------------------ table of contents */

  function initToc() {
    var toc = $('.toc');
    if (!toc || !('IntersectionObserver' in window)) return;
    var links = $$('a[href^="#"]', toc);
    if (!links.length) return;
    var map = {};
    var targets = [];
    links.forEach(function (anchor) {
      var id = decodeURIComponent(anchor.getAttribute('href').slice(1));
      var heading = doc.getElementById(id);
      if (!heading) return;
      map[id] = anchor;
      targets.push(heading);
    });
    if (!targets.length) return;

    var visible = new Set();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      });
      var active = targets.filter(function (heading) { return visible.has(heading.id); })[0];
      if (!active) {
        var passed = targets.filter(function (heading) {
          return heading.getBoundingClientRect().top < 140;
        });
        active = passed[passed.length - 1];
      }
      links.forEach(function (anchor) { anchor.classList.remove('is-active'); });
      if (active && map[active.id]) map[active.id].classList.add('is-active');
    }, { rootMargin: '-84px 0px -70% 0px', threshold: [0, 1] });

    targets.forEach(function (heading) { observer.observe(heading); });
  }

  /* --------------------------------------------------------- listing filters */

  function initNoteFilters() {
    var grid = $('[data-note-grid]');
    if (!grid) return;

    var cards = $$('[data-note-card]', grid);
    var sortSelect = $('[data-sort]');
    var difficultySelect = $('[data-difficulty]');
    var keywordInput = $('[data-card-filter]');
    var countNode = $('[data-result-count]');
    var emptyNode = $('[data-empty]');
    var clearButtons = $$('[data-clear-filters]');
    var tagButtons = $$('[data-tag-toggle]');
    var activeTags = new Set();
    var isTagPage = grid.getAttribute('data-note-scope') === 'tag';

    var params = new URLSearchParams(window.location.search);
    if (params.get('q') && keywordInput) keywordInput.value = params.get('q');
    if (params.get('sort') && sortSelect) sortSelect.value = params.get('sort');
    if (params.get('difficulty') && difficultySelect) difficultySelect.value = params.get('difficulty');
    (params.get('tags') || '').split(',').filter(Boolean).forEach(function (slug) {
      activeTags.add(slug);
      var button = tagButtons.filter(function (candidate) {
        return candidate.getAttribute('data-tag-toggle') === slug;
      })[0];
      if (button) button.classList.add('is-active');
    });

    function matches(card) {
      var difficulty = card.getAttribute('data-difficulty');
      if (difficultySelect && difficultySelect.value !== 'all' && difficulty !== difficultySelect.value) return false;

      if (activeTags.size) {
        var mine = (card.getAttribute('data-tags') || '').split(',').filter(Boolean);
        var hasAll = Array.from(activeTags).every(function (slug) { return mine.indexOf(slug) !== -1; });
        if (!hasAll) return false;
      }

      var keyword = keywordInput ? keywordInput.value.trim().toLowerCase() : '';
      if (keyword) {
        var haystack = card.getAttribute('data-search') || '';
        var terms = keyword.split(/\s+/).filter(Boolean);
        var ok = terms.every(function (term) { return haystack.indexOf(term) !== -1; });
        if (!ok) return false;
      }
      return true;
    }

    function sortCards() {
      var mode = sortSelect ? sortSelect.value : 'newest';
      var ordered = cards.slice();
      ordered.sort(function (a, b) {
        if (mode === 'title') {
          return (a.getAttribute('data-title') || '').localeCompare(b.getAttribute('data-title') || '');
        }
        if (mode === 'reading') {
          return Number(b.getAttribute('data-reading') || 0) - Number(a.getAttribute('data-reading') || 0);
        }
        var ad = a.getAttribute('data-date') || '';
        var bd = b.getAttribute('data-date') || '';
        var cmp = ad < bd ? -1 : ad > bd ? 1 : 0;
        return mode === 'oldest' ? cmp : -cmp;
      });
      ordered.forEach(function (card) { grid.appendChild(card); });
    }

    function syncUrl() {
      if (isTagPage) return;
      var next = new URLSearchParams();
      var keyword = keywordInput ? keywordInput.value.trim() : '';
      if (keyword) next.set('q', keyword);
      if (sortSelect && sortSelect.value !== 'newest') next.set('sort', sortSelect.value);
      if (difficultySelect && difficultySelect.value !== 'all') next.set('difficulty', difficultySelect.value);
      if (activeTags.size) next.set('tags', Array.from(activeTags).join(','));
      var query = next.toString();
      var url = window.location.pathname + (query ? '?' + query : '');
      window.history.replaceState(null, '', url);
    }

    function apply() {
      var shown = 0;
      cards.forEach(function (card) {
        var visible = matches(card);
        card.hidden = !visible;
        if (visible) shown += 1;
      });
      sortCards();
      if (countNode) {
        countNode.textContent = shown + ' of ' + cards.length + ' note' + (cards.length === 1 ? '' : 's') + ' shown';
      }
      if (emptyNode) emptyNode.hidden = shown !== 0;
      var anyFilter = activeTags.size > 0
        || (keywordInput && keywordInput.value.trim() !== '')
        || (difficultySelect && difficultySelect.value !== 'all');
      clearButtons.forEach(function (button) { button.hidden = !anyFilter; });
      syncUrl();
    }

    if (sortSelect) sortSelect.addEventListener('change', apply);
    if (difficultySelect) difficultySelect.addEventListener('change', apply);
    if (keywordInput) {
      var timer = null;
      keywordInput.addEventListener('input', function () {
        window.clearTimeout(timer);
        timer = window.setTimeout(apply, 120);
      });
    }
    tagButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        var slug = button.getAttribute('data-tag-toggle');
        if (activeTags.has(slug)) {
          activeTags.delete(slug);
          button.classList.remove('is-active');
        } else {
          activeTags.add(slug);
          button.classList.add('is-active');
        }
        apply();
      });
    });
    clearButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        activeTags.clear();
        tagButtons.forEach(function (candidate) { candidate.classList.remove('is-active'); });
        if (keywordInput) keywordInput.value = '';
        if (difficultySelect) difficultySelect.value = 'all';
        if (sortSelect) sortSelect.value = 'newest';
        apply();
      });
    });

    apply();
  }

  /* ------------------------------------------------------------------- boot */

  function boot() {
    initTheme();
    initNav();
    initYear();
    initHeaderSearch();
    initCopyButtons();
    initCopyLink();
    initLightbox();
    initToc();
    initNoteFilters();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
