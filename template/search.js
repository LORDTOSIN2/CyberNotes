/* ==========================================================================
   CyberNotes — client-side search
   Loads a static JSON index produced at build time and ranks matches in the
   browser. No backend, no third-party service; the index is fetched lazily the
   first time a reader actually searches.
   ========================================================================== */

(function () {
  'use strict';

  var doc = document;
  var INDEX_URL = 'assets/search-index.json';
  var MAX_HITS = 8;

  var state = {
    index: null,
    loading: null,
    ready: false,
    terms: [],
    results: [],
    active: -1
  };

  function basePath() {
    var meta = doc.querySelector('meta[name="site-base"]');
    return meta && meta.content ? meta.content.replace(/\/+$/, '') : '';
  }

  function link(path) {
    if (!path) return basePath() + '/';
    if (/^(?:[a-z]+:)?\/\//i.test(path) || path.charAt(0) === '#') return path;
    return basePath() + (path.charAt(0) === '/' ? path : '/' + path);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function loadIndex() {
    if (state.ready) return Promise.resolve(state.index);
    if (state.loading) return state.loading;
    state.loading = fetch(link('/' + INDEX_URL), { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        state.index = Array.isArray(data.notes) ? data.notes : [];
        state.ready = true;
        return state.index;
      })
      .catch(function (error) {
        state.loading = null;
        state.index = [];
        state.error = error;
        return state.index;
      });
    return state.loading;
  }

  /**
   * Parse a raw query into terms plus an optional exact tag filter.
   *   `#nmap wireshark`  ->  tag: nmap, terms: ['nmap', 'wireshark']
   */
  function parseQuery(raw) {
    var text = String(raw || '').trim().toLowerCase();
    var tag = '';
    var terms = text
      .replace(/(^|\s)#([\w\u3400-\u9fff.+-]+)/g, function (match, lead, value) {
        if (!tag) tag = value;
        return lead + ' ' + value;
      })
      .split(/\s+/)
      .map(function (term) { return term.replace(/[^\w\u3400-\u9fff.+-]/g, '').trim(); })
      .filter(Boolean);
    return { tag: tag, terms: terms };
  }

  function scoreNote(note, query) {
    if (!query.terms.length && !query.tag) return 0;
    var title = (note.title || '').toLowerCase();
    var summary = (note.summary || '').toLowerCase();
    var tags = (note.tags || []).map(function (tag) { return tag.name.toLowerCase(); });
    var headings = (note.headings || []).join(' ').toLowerCase();
    var text = (note.text || '').toLowerCase();

    if (query.tag && tags.indexOf(query.tag) === -1) return 0;

    var score = 0;
    for (var i = 0; i < query.terms.length; i += 1) {
      var term = query.terms[i];
      var hit = false;
      if (title.indexOf(term) !== -1) { score += title.indexOf(term) === 0 ? 12 : 8; hit = true; }
      for (var t = 0; t < tags.length; t += 1) {
        if (tags[t] === term) { score += 6; hit = true; }
        else if (tags[t].indexOf(term) === 0) { score += 4; hit = true; }
      }
      if (headings.indexOf(term) !== -1) { score += 4; hit = true; }
      if (summary.indexOf(term) !== -1) { score += 3; hit = true; }
      if (text.indexOf(term) !== -1) { score += 2; hit = true; }
      if (!hit) return 0; // every term must match somewhere (AND semantics)
    }
    if (note.difficulty === 'beginner') score += 0.4;
    return score;
  }

  function runQuery(raw) {
    var query = parseQuery(raw);
    state.terms = query.terms.concat(query.tag ? [query.tag] : []);
    if (!query.terms.length && !query.tag) {
      state.results = [];
      return state.results;
    }
    var hits = [];
    for (var i = 0; i < state.index.length; i += 1) {
      var score = scoreNote(state.index[i], query);
      if (score > 0) hits.push({ note: state.index[i], score: score });
    }
    hits.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (b.note.date || '').localeCompare(a.note.date || '');
    });
    state.results = hits;
    return hits;
  }

  /** Wrap matches of the query terms in <mark>, keeping the output escaped. */
  function highlight(text, terms) {
    var source = String(text == null ? '' : text);
    if (!terms.length) return escapeHtml(source);
    var escapedTerms = terms
      .filter(Boolean)
      .map(function (term) { return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    if (!escapedTerms.length) return escapeHtml(source);
    var pattern = new RegExp('(' + escapedTerms.join('|') + ')', 'gi');
    var parts = source.split(pattern);
    return parts.map(function (part, index) {
      if (index % 2 === 1) return '<mark>' + escapeHtml(part) + '</mark>';
      return escapeHtml(part);
    }).join('');
  }

  function snippet(text, terms, length) {
    var source = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!source) return '';
    var max = length || 165;
    var lower = source.toLowerCase();
    var at = -1;
    for (var i = 0; i < terms.length && at === -1; i += 1) {
      at = lower.indexOf(terms[i]);
    }
    if (at === -1) at = 0;
    var start = Math.max(0, at - 52);
    var slice = source.slice(start, start + max);
    return (start > 0 ? '…' : '') + slice + (start + max < source.length ? '…' : '');
  }

  function hitMeta(note) {
    var tags = (note.tags || []).slice(0, 4).map(function (tag) {
      return '<span class="search-hit__tag">#' + escapeHtml(tag.name) + '</span>';
    }).join(' ');
    return '<span class="search-hit__meta">' +
      '<span>' + escapeHtml(note.display || note.date || '') + '</span>' +
      (note.readingTime ? '<span>' + note.readingTime + ' min</span>' : '') +
      (note.difficulty ? '<span>' + escapeHtml(note.difficulty) + '</span>' : '') +
      (tags ? '<span>' + tags + '</span>' : '') +
      '</span>';
  }

  /* ----------------------------------------------------- header dropdown UI */

  function initDropdown(input, container) {
    function render() {
      var raw = input.value.trim();
      if (!raw) {
        container.hidden = true;
        container.innerHTML = '';
        return;
      }
      if (!state.ready) {
        container.hidden = false;
        container.innerHTML = '<p class="search-empty">Loading index…</p>';
        loadIndex().then(render);
        return;
      }
      var hits = runQuery(raw);
      container.hidden = false;
      if (!hits.length) {
        container.innerHTML = '<p class="search-empty">No notes match “' + escapeHtml(raw) + '”. ' +
          '<a href="' + link('/search/') + '?q=' + encodeURIComponent(raw) + '">Open the search page</a> for full-text queries.</p>';
        return;
      }
      var visible = hits.slice(0, MAX_HITS);
      var html = '<p class="search-results__group">' + hits.length + ' match' + (hits.length === 1 ? '' : 'es') + '</p>';
      html += visible.map(function (hit, index) {
        var note = hit.note;
        return '<a class="search-hit' + (index === state.active ? ' is-active' : '') + '" href="' + escapeHtml(note.url) + '" data-hit-index="' + index + '">' +
          '<span class="search-hit__title">' + highlight(note.title, state.terms) + '</span>' +
          '<span class="search-hit__snippet">' + highlight(snippet(note.summary, state.terms, 120), state.terms) + '</span>' +
          hitMeta(note) +
          '</a>';
      }).join('');
      html += '<a class="search-more" href="' + link('/search/') + '?q=' + encodeURIComponent(raw) + '">See all results on the search page →</a>';
      container.innerHTML = html;
    }

    var timer = null;
    input.addEventListener('input', function () {
      state.active = -1;
      window.clearTimeout(timer);
      timer = window.setTimeout(render, 90);
    });
    input.addEventListener('focus', function () {
      loadIndex().then(render);
    });
    input.addEventListener('keydown', function (event) {
      var hits = $$('.search-hit', container);
      if (event.key === 'ArrowDown' && hits.length) {
        event.preventDefault();
        state.active = Math.min(state.active + 1, hits.length - 1);
        updateActive(hits);
      } else if (event.key === 'ArrowUp' && hits.length) {
        event.preventDefault();
        state.active = Math.max(state.active - 1, -1);
        updateActive(hits);
      } else if (event.key === 'Enter') {
        if (state.active >= 0 && hits[state.active]) {
          event.preventDefault();
          window.location.href = hits[state.active].getAttribute('href');
        }
      } else if (event.key === 'Escape') {
        container.hidden = true;
      }
    });

    function updateActive(hits) {
      hits.forEach(function (hit, index) {
        hit.classList.toggle('is-active', index === state.active);
      });
      if (hits[state.active]) hitEnsureVisible(hits[state.active], container);
    }

    function hitEnsureVisible(node, scroller) {
      var top = node.offsetTop;
      var bottom = top + node.offsetHeight;
      if (top < scroller.scrollTop) scroller.scrollTop = top - 8;
      else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight + 8;
    }

    doc.addEventListener('click', function (event) {
      if (container.hidden) return;
      if (container.contains(event.target) || input.contains(event.target)) return;
      container.hidden = true;
    });
  }

  /* --------------------------------------------------------- search page UI */

  function initSearchPage(input, listNode, statusNode) {
    var current = new URLSearchParams(window.location.search).get('q') || '';

    function render(query) {
      var raw = String(query || '').trim();
      if (!raw) {
        statusNode.textContent = 'Type a query to search ' + (state.index ? state.index.length : '') + ' notes.';
        listNode.innerHTML = '';
        return;
      }
      var hits = runQuery(raw);
      var tag = parseQuery(raw).tag;
      statusNode.innerHTML = hits.length
        ? hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for <strong>' + escapeHtml(raw) + '</strong>' +
          (tag ? ' (tag filter: <span class="tag-inline">#' + escapeHtml(tag) + '</span>)' : '')
        : 'No notes match <strong>' + escapeHtml(raw) + '</strong>. Try fewer words, or search for a single <span class="tag-inline">#tag</span>.';

      listNode.innerHTML = hits.map(function (hit) {
        var note = hit.note;
        return '<a class="search-result" href="' + escapeHtml(note.url) + '">' +
          '<p class="search-result__title">' + highlight(note.title, state.terms) + '</p>' +
          '<p class="search-result__snippet">' + highlight(snippet(note.summary, state.terms, 200), state.terms) + '</p>' +
          '<span class="search-result__meta">' +
          '<time datetime="' + escapeHtml(note.date || '') + '">' + escapeHtml(note.display || note.date || '') + '</time>' +
          (note.difficulty ? '<span class="diff diff--' + escapeHtml(note.difficulty) + '">' + escapeHtml(note.difficulty) + '</span>' : '') +
          (note.readingTime ? '<span>' + note.readingTime + ' min read</span>' : '') +
          (note.tags || []).slice(0, 5).map(function (tagItem) {
            return '<span class="search-hit__tag">#' + escapeHtml(tagItem.name) + '</span>';
          }).join('') +
          '</span>' +
          '</a>';
      }).join('');
    }

    input.value = current;
    loadIndex().then(function () {
      render(current);
      if (current) input.focus();
    });

    var timer = null;
    input.addEventListener('input', function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        var query = input.value.trim();
        var next = query ? '?q=' + encodeURIComponent(query) : window.location.pathname;
        window.history.replaceState(null, '', next);
        render(query);
      }, 130);
    });
  }

  /* ------------------------------------------------------------------- boot */

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || doc).querySelectorAll(selector));
  }

  function boot() {
    // Inline search boxes: header dropdown and the homepage hero field.
    $$('[data-search-input]').forEach(function (input) {
      if (input.id === 'search-page-input') return;
      var scope = input.closest('[data-search-form]') || input.parentElement || doc;
      var results = scope.querySelector('[data-search-results]');
      if (results) {
        initDropdown(input, results);
        return;
      }
      var form = input.closest('form');
      if (form) {
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          var query = input.value.trim();
          window.location.href = link('/search/') + (query ? '?q=' + encodeURIComponent(query) : '');
        });
      }
    });

    // Dedicated search page
    var pageInput = doc.getElementById('search-page-input');
    var pageList = doc.querySelector('[data-search-list]');
    var pageStatus = doc.querySelector('[data-search-status]');
    if (pageInput && pageList && pageStatus) {
      initSearchPage(pageInput, pageList, pageStatus);
    }

    // Quick tag buttons on the search page
    $$('[data-search-tag]').forEach(function (button) {
      button.addEventListener('click', function () {
        var tag = button.getAttribute('data-search-tag');
        var input = doc.getElementById('search-page-input') || doc.querySelector('[data-search-input]');
        if (!input) return;
        input.value = '#' + tag;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      });
    });

    // Prefetch the index when the reader shows intent, keeping first load light.
    ['mouseover', 'focusin', 'touchstart'].forEach(function (eventName) {
      doc.addEventListener(eventName, function once() {
        loadIndex();
        doc.removeEventListener(eventName, once);
      }, { once: true, passive: true });
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
