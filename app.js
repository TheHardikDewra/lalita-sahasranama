/* ========================================
   Sri Lalita Sahasranama - App Logic
   ======================================== */

(function () {
  'use strict';

  // ---- State ----
  const STATE = {
    learnedNames: new Set(),
    currentView: 'home',
    currentVerse: 1,
    practiceMode: 's2m',      // 's2m' or 'm2s'
    practiceScope: 'all',
    practiceQueue: [],
    practiceIndex: 0,
    practiceFlipped: false,
    scoreGot: 0,
    scoreReview: 0,
    nameSearchQuery: '',
    nameRangeFilter: 'all',
    nameStatusFilter: 'all',
    expandedCard: null,
    renderedNameCards: [],      // for virtual rendering
    renderBatchSize: 80,
    renderOffset: 0,
    isRendering: false,
    chantVerse: 1,
    chantAuto: false,
    chantSpeed: 8,
    chantShowTranslit: true,
    chantShowMeaning: false,
    chantFullscreen: false,
    chantTimer: null,
  };

  // ---- Data helpers ----
  const DATA = SAHASRANAMA_DATA;
  const TOTAL_NAMES = DATA.meta.totalNames;
  const TOTAL_VERSES = DATA.meta.totalVerses;

  // Build a lookup map: nameNumber -> name object
  const nameMap = new Map();
  DATA.names.forEach(n => nameMap.set(n.number, n));

  // Build a lookup: verse number -> array of name objects
  function getNamesByVerse(verseNum) {
    const verse = DATA.verses[verseNum];
    if (!verse) return [];
    return verse.names.map(num => nameMap.get(num)).filter(Boolean);
  }

  // ---- localStorage ----
  const STORAGE_KEY = 'lsn_learned';

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          STATE.learnedNames = new Set(arr);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...STATE.learnedNames]));
    } catch (e) {
      // ignore
    }
  }

  function toggleLearned(num) {
    if (STATE.learnedNames.has(num)) {
      STATE.learnedNames.delete(num);
    } else {
      STATE.learnedNames.add(num);
    }
    saveProgress();
  }

  function markLearned(num) {
    STATE.learnedNames.add(num);
    saveProgress();
  }

  function isLearned(num) {
    return STATE.learnedNames.has(num);
  }

  // ---- SRS (SM-2 Spaced Repetition) ----
  const SRS_KEY = 'lsn_srs';

  function loadSRS() {
    try {
      const raw = localStorage.getItem(SRS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveSRS(srsData) {
    try {
      localStorage.setItem(SRS_KEY, JSON.stringify(srsData));
    } catch (e) {
      // ignore
    }
  }

  function getSRSEntry(srsData, num) {
    return srsData[num] || { interval: 0, easeFactor: 2.5, nextReview: null, repetitions: 0 };
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function recordSRS(nameNumber, quality) {
    // quality: 5 = "Got It", 1 = "Review Again"
    const srsData = loadSRS();
    const entry = getSRSEntry(srsData, nameNumber);

    if (quality >= 3) {
      // Got It - increase interval
      if (entry.repetitions === 0) {
        entry.interval = 1;
      } else if (entry.repetitions === 1) {
        entry.interval = 3;
      } else {
        entry.interval = Math.round(entry.interval * entry.easeFactor);
      }
      entry.repetitions++;
    } else {
      // Review Again - reset
      entry.interval = 1;
      entry.repetitions = 0;
    }

    // SM-2 ease factor adjustment
    entry.easeFactor += (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (entry.easeFactor < 1.3) entry.easeFactor = 1.3;

    // Set next review date
    const next = new Date();
    next.setDate(next.getDate() + entry.interval);
    entry.nextReview = next.toISOString().slice(0, 10);

    srsData[nameNumber] = entry;
    saveSRS(srsData);
  }

  function countDueNames() {
    const srsData = loadSRS();
    const today = todayStr();
    let count = 0;
    DATA.names.forEach(n => {
      const entry = srsData[n.number];
      if (!entry) {
        count++; // never reviewed = due
      } else if (entry.nextReview <= today) {
        count++;
      }
    });
    return count;
  }

  // ---- Notes ----
  const NOTES_KEY = 'lsn_notes';

  function loadNotes() {
    try {
      const raw = localStorage.getItem(NOTES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveNotes(notes) {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    } catch (e) {
      // ignore
    }
  }

  function getNote(num) {
    const notes = loadNotes();
    return notes[num] || '';
  }

  function setNote(num, text) {
    const notes = loadNotes();
    if (text.trim()) {
      notes[num] = text;
    } else {
      delete notes[num];
    }
    saveNotes(notes);
  }

  // ---- Font Size ----
  const FONTSIZE_KEY = 'lsn_fontsize';
  const FONTSIZE_MAP = { small: '14px', normal: '16px', large: '18px' };

  function loadFontSize() {
    const val = localStorage.getItem(FONTSIZE_KEY) || 'normal';
    applyFontSize(val);
  }

  function applyFontSize(size) {
    if (!FONTSIZE_MAP[size]) size = 'normal';
    document.documentElement.style.fontSize = FONTSIZE_MAP[size];
    localStorage.setItem(FONTSIZE_KEY, size);
  }

  function getCurrentFontSize() {
    return localStorage.getItem(FONTSIZE_KEY) || 'normal';
  }

  function cycleFontSize(direction) {
    const sizes = ['small', 'normal', 'large'];
    const current = getCurrentFontSize();
    let idx = sizes.indexOf(current);
    idx += direction;
    if (idx < 0) idx = 0;
    if (idx > sizes.length - 1) idx = sizes.length - 1;
    applyFontSize(sizes[idx]);
  }

  // ---- Router ----
  function getHash() {
    const h = window.location.hash.replace('#', '').trim();
    // Deep link: #name/42
    const nameMatch = h.match(/^name\/(\d+)$/);
    if (nameMatch) return { view: 'names', deepLink: parseInt(nameMatch[1], 10) };
    const view = ['home', 'names', 'verses', 'practice', 'chant'].includes(h) ? h : 'home';
    return { view, deepLink: null };
  }

  function navigate(viewOrObj) {
    let view, deepLink;
    if (typeof viewOrObj === 'string') {
      view = viewOrObj;
      deepLink = null;
    } else {
      view = viewOrObj.view;
      deepLink = viewOrObj.deepLink;
    }

    STATE.currentView = view;
    // Update tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === view);
    });
    // Toggle views
    document.querySelectorAll('.view').forEach(v => {
      v.hidden = v.id !== 'view-' + view;
    });
    // Init view
    if (view === 'home') renderHome();
    else if (view === 'names') initNames(deepLink);
    else if (view === 'verses') renderVerse(STATE.currentVerse);
    else if (view === 'practice') initPractice();
    else if (view === 'chant') initChant();

    // Stop chant auto-advance when navigating away
    if (view !== 'chant' && STATE.chantTimer) {
      clearInterval(STATE.chantTimer);
      STATE.chantTimer = null;
    }
    // Remove fullscreen class when leaving chant
    if (view !== 'chant' && STATE.chantFullscreen) {
      STATE.chantFullscreen = false;
      document.body.classList.remove('chant-fullscreen');
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(function() {});
      }
    }

    // Scroll to top of main (skip if deep linking - we'll scroll to card)
    if (!deepLink) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  window.addEventListener('hashchange', () => navigate(getHash()));

  // ---- Seeded random (for Name of the Day) ----
  function seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function getNameOfTheDay() {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const idx = Math.floor(seededRandom(seed) * TOTAL_NAMES);
    return DATA.names[idx];
  }

  // ---- Format number ----
  function formatNumber(n) {
    return n.toLocaleString('en-IN');
  }

  // ---- Sadhana Tracker ----
  const SADHANA_KEY = 'lsn_sadhana';

  function loadSadhana() {
    try {
      const raw = localStorage.getItem(SADHANA_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data.total === 'number' && Array.isArray(data.log)) {
          return data;
        }
      }
    } catch (e) {
      // ignore
    }
    return { total: 0, log: [], streak: 0 };
  }

  function saveSadhana(data) {
    try {
      localStorage.setItem(SADHANA_KEY, JSON.stringify(data));
    } catch (e) {
      // ignore
    }
  }

  function logRecitation() {
    const data = loadSadhana();
    const today = todayStr();
    const existing = data.log.find(e => e.date === today);
    if (existing) {
      existing.count++;
    } else {
      data.log.push({ date: today, count: 1 });
    }
    data.total++;
    data.streak = calcStreak(data.log);
    saveSadhana(data);
    renderSadhana();
  }

  function calcStreak(log) {
    if (!log.length) return 0;
    const dateSet = new Set(log.filter(e => e.count > 0).map(e => e.date));
    let streak = 0;
    const d = new Date();
    while (true) {
      const ds = d.toISOString().slice(0, 10);
      if (dateSet.has(ds)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function renderSadhana() {
    const data = loadSadhana();
    const totalEl = document.getElementById('sadhana-total');
    const streakEl = document.getElementById('sadhana-streak');
    const monthEl = document.getElementById('sadhana-month');
    const lastEl = document.getElementById('sadhana-last');

    if (!totalEl) return;

    data.streak = calcStreak(data.log);

    totalEl.textContent = formatNumber(data.total);
    streakEl.textContent = data.streak;

    // This month count
    const now = new Date();
    const monthPrefix = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    let monthCount = 0;
    data.log.forEach(e => {
      if (e.date.startsWith(monthPrefix)) {
        monthCount += e.count;
      }
    });
    monthEl.textContent = formatNumber(monthCount);

    // Last recitation date
    if (data.log.length > 0) {
      const sorted = [...data.log].sort((a, b) => b.date.localeCompare(a.date));
      const lastDate = new Date(sorted[0].date + 'T00:00:00');
      const formatted = lastDate.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
      lastEl.textContent = 'Last: ' + formatted;
    } else {
      lastEl.textContent = '';
    }
  }

  // Sadhana log button
  document.getElementById('sadhana-log').addEventListener('click', logRecitation);

  // ---- Home View ----
  function renderHome() {
    const learned = STATE.learnedNames.size;
    const pct = TOTAL_NAMES > 0 ? Math.round((learned / TOTAL_NAMES) * 100) : 0;

    document.getElementById('stat-names').textContent = formatNumber(TOTAL_NAMES);
    document.getElementById('stat-verses').textContent = formatNumber(TOTAL_VERSES);
    document.getElementById('stat-learned').textContent = formatNumber(learned);
    document.getElementById('stat-progress').textContent = pct + '%';

    // Sadhana tracker
    renderSadhana();

    // Name of the Day
    const notd = getNameOfTheDay();
    const notdEl = document.getElementById('name-of-day');
    notdEl.innerHTML = `
      <div class="notd-number">Name #${notd.number}</div>
      <div class="notd-sanskrit">${notd.sanskrit}</div>
      <div class="notd-translit">${escHtml(notd.transliteration)}</div>
      <div class="notd-meaning">${escHtml(notd.meaning)}</div>
    `;

    // Dhyana verses (render once)
    const dhyanaContent = document.getElementById('dhyana-content');
    if (dhyanaContent.children.length === 0) {
      dhyanaContent.innerHTML = DATA.dhyana.map((d, i) => `
        <div class="dhyana-verse">
          <div class="dhyana-deva">${d.devanagari}</div>
          <div class="dhyana-translit">${escHtml(d.transliteration)}</div>
          <div class="dhyana-meaning">${escHtml(d.meaning)}</div>
        </div>
      `).join('');
    }
  }

  // Dhyana toggle
  document.getElementById('dhyana-toggle').addEventListener('click', () => {
    const content = document.getElementById('dhyana-content');
    const icon = document.getElementById('toggle-icon');
    const toggle = document.getElementById('dhyana-toggle');
    const isHidden = content.hidden;
    content.hidden = !isHidden;
    icon.textContent = isHidden ? '-' : '+';
    toggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  });

  // Phala Shruti toggle
  document.getElementById('phala-shruti-toggle').addEventListener('click', () => {
    const content = document.getElementById('phala-shruti-content');
    const icon = document.getElementById('phala-shruti-toggle-icon');
    const toggle = document.getElementById('phala-shruti-toggle');
    const isHidden = content.hidden;
    content.hidden = !isHidden;
    icon.textContent = isHidden ? '-' : '+';
    toggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  });

  // ---- Names View ----
  let filteredNames = [];
  let namesScrollSentinel = null;

  function initNames(deepLinkNum) {
    STATE.renderOffset = 0;
    STATE.expandedCard = null;
    filterAndRenderNames();
    if (deepLinkNum && nameMap.has(deepLinkNum)) {
      scrollToAndExpandName(deepLinkNum);
    }
  }

  function scrollToAndExpandName(num) {
    const grid = document.getElementById('names-grid');
    // Make sure the name is rendered - render all batches until we find it
    while (STATE.renderOffset < filteredNames.length) {
      const existing = grid.querySelector(`[data-num="${num}"]`);
      if (existing) break;
      renderNamesBatch();
    }
    const card = grid.querySelector(`[data-num="${num}"]`);
    if (card) {
      // Expand
      if (STATE.expandedCard && STATE.expandedCard !== card) {
        STATE.expandedCard.classList.remove('expanded');
      }
      card.classList.add('expanded');
      STATE.expandedCard = card;
      // Scroll into view after a tick (let DOM settle)
      requestAnimationFrame(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  function filterNames() {
    const q = STATE.nameSearchQuery.toLowerCase().trim();
    const range = STATE.nameRangeFilter;
    const status = STATE.nameStatusFilter;

    let results = DATA.names;

    // Range filter
    if (range !== 'all') {
      const [lo, hi] = range.split('-').map(Number);
      results = results.filter(n => n.number >= lo && n.number <= hi);
    }

    // Status filter
    if (status === 'learned') {
      results = results.filter(n => isLearned(n.number));
    } else if (status === 'unlearned') {
      results = results.filter(n => !isLearned(n.number));
    }

    // Search
    if (q) {
      results = results.filter(n => {
        const numStr = String(n.number);
        return (
          n.sanskrit.includes(q) ||
          n.transliteration.toLowerCase().includes(q) ||
          n.meaning.toLowerCase().includes(q) ||
          numStr === q
        );
      });
    }

    return results;
  }

  function filterAndRenderNames() {
    filteredNames = filterNames();
    STATE.renderOffset = 0;

    const grid = document.getElementById('names-grid');
    const empty = document.getElementById('names-empty');
    const counter = document.getElementById('names-counter');

    grid.innerHTML = '';

    const learnedInFilter = filteredNames.filter(n => isLearned(n.number)).length;
    counter.textContent = `${filteredNames.length} of ${TOTAL_NAMES} names` +
      (learnedInFilter > 0 ? ` - ${learnedInFilter} learned` : '');

    if (filteredNames.length === 0) {
      empty.hidden = false;
      removeSentinel();
      return;
    }

    empty.hidden = true;
    renderNamesBatch();
    setupScrollSentinel();
  }

  function renderNamesBatch() {
    if (STATE.isRendering) return;
    STATE.isRendering = true;

    const grid = document.getElementById('names-grid');
    const batch = filteredNames.slice(STATE.renderOffset, STATE.renderOffset + STATE.renderBatchSize);

    const frag = document.createDocumentFragment();
    batch.forEach(name => {
      frag.appendChild(createNameCard(name));
    });
    grid.appendChild(frag);

    STATE.renderOffset += batch.length;
    STATE.isRendering = false;

    if (STATE.renderOffset >= filteredNames.length) {
      removeSentinel();
    }
  }

  function createNameCard(name) {
    const card = document.createElement('div');
    card.className = 'name-card' + (isLearned(name.number) ? ' learned' : '');
    card.dataset.num = name.number;

    const verseInfo = name.verse ? `Verse ${name.verse}` : 'Closing';
    const verseSanskrit = name.verse && DATA.verses[name.verse] ? DATA.verses[name.verse].sanskrit : '';

    const hasCommentary = name.commentary && name.commentary.trim().length > 0;
    const hasMantra = name.mantra && name.mantra.trim().length > 0;
    const hasSimpleMantra = !hasMantra && name.simpleMantra && name.simpleMantra.trim().length > 0;
    const displayMantra = hasMantra ? name.mantra : (hasSimpleMantra ? name.simpleMantra : '');
    const existingNote = getNote(name.number);
    const hasNote = existingNote.length > 0;

    card.innerHTML = `
      <div class="name-tag">#${name.number}</div>
      ${hasNote ? '<div class="note-indicator"></div>' : ''}
      <div class="name-card-header">
        <div class="name-info">
          <div class="name-sanskrit">${name.sanskrit}</div>
          <div class="name-translit">${escHtml(name.transliteration)}</div>
          <div class="name-meaning-short">${escHtml(name.meaning)}</div>
        </div>
      </div>
      <div class="name-details">
        <div class="name-detail-row">
          <div class="name-detail-label">Verse Context</div>
          <div class="name-detail-value">${verseInfo}</div>
          ${verseSanskrit ? `<div class="name-detail-value sanskrit-verse">${verseSanskrit}</div>` : ''}
        </div>
        ${displayMantra ? `<div class="name-mantra${hasMantra ? '' : ' simple'}">${escHtml(displayMantra)}</div>` : ''}
        ${hasCommentary ? `<div class="name-commentary">${escHtml(name.commentary)}</div>` : ''}
        <div class="name-notes">
          <textarea class="note-input" placeholder="Add your personal notes..." data-note="${name.number}">${escHtml(existingNote)}</textarea>
        </div>
        <div class="name-actions">
          <button class="learn-btn ${isLearned(name.number) ? 'unmark' : 'mark'}" data-learn="${name.number}">
            ${isLearned(name.number) ? 'Unmark Learned' : 'Mark as Learned'}
          </button>
          ${name.telegramLink ? `<a class="telegram-link" href="${name.telegramLink}" target="_blank" rel="noopener">View on Telegram</a>` : ''}
        </div>
      </div>
    `;

    // Click to expand/collapse
    card.addEventListener('click', (e) => {
      // Don't toggle if clicking a button or link
      if (e.target.closest('.learn-btn') || e.target.closest('.telegram-link')) return;
      toggleCardExpand(card, name.number);
    });

    // Learn button
    const learnBtn = card.querySelector('.learn-btn');
    learnBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLearned(name.number);
      refreshNameCard(card, name);
      updateNamesCounter();
      updateHomeStats();
    });

    // Note textarea - auto-save on blur
    const noteInput = card.querySelector('.note-input');
    noteInput.addEventListener('click', (e) => e.stopPropagation());
    noteInput.addEventListener('blur', () => {
      const num = parseInt(noteInput.dataset.note, 10);
      const text = noteInput.value;
      setNote(num, text);
      // Update note indicator
      const indicator = card.querySelector('.note-indicator');
      if (text.trim() && !indicator) {
        const dot = document.createElement('div');
        dot.className = 'note-indicator';
        card.appendChild(dot);
      } else if (!text.trim() && indicator) {
        indicator.remove();
      }
    });

    return card;
  }

  function toggleCardExpand(card, num) {
    if (STATE.expandedCard && STATE.expandedCard !== card) {
      STATE.expandedCard.classList.remove('expanded');
    }
    card.classList.toggle('expanded');
    STATE.expandedCard = card.classList.contains('expanded') ? card : null;

    // Update URL for deep linking
    if (STATE.expandedCard) {
      history.replaceState(null, '', '#name/' + num);
    } else {
      history.replaceState(null, '', '#names');
    }
  }

  function refreshNameCard(card, name) {
    const learned = isLearned(name.number);
    card.classList.toggle('learned', learned);
    const badge = card.querySelector('.name-badge');
    if (badge) badge.textContent = name.number;
    const btn = card.querySelector('.learn-btn');
    if (btn) {
      btn.className = 'learn-btn ' + (learned ? 'unmark' : 'mark');
      btn.textContent = learned ? 'Unmark Learned' : 'Mark as Learned';
    }
  }

  function updateNamesCounter() {
    const counter = document.getElementById('names-counter');
    const learnedInFilter = filteredNames.filter(n => isLearned(n.number)).length;
    counter.textContent = `${filteredNames.length} of ${TOTAL_NAMES} names` +
      (learnedInFilter > 0 ? ` - ${learnedInFilter} learned` : '');
  }

  function updateHomeStats() {
    const learned = STATE.learnedNames.size;
    const pct = TOTAL_NAMES > 0 ? Math.round((learned / TOTAL_NAMES) * 100) : 0;
    const statLearned = document.getElementById('stat-learned');
    const statProgress = document.getElementById('stat-progress');
    if (statLearned) statLearned.textContent = formatNumber(learned);
    if (statProgress) statProgress.textContent = pct + '%';
  }

  // Infinite scroll sentinel
  function setupScrollSentinel() {
    removeSentinel();
    if (STATE.renderOffset >= filteredNames.length) return;

    namesScrollSentinel = document.createElement('div');
    namesScrollSentinel.style.height = '1px';
    document.getElementById('names-grid').appendChild(namesScrollSentinel);

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && STATE.renderOffset < filteredNames.length) {
        renderNamesBatch();
        // Re-attach sentinel
        if (STATE.renderOffset < filteredNames.length) {
          document.getElementById('names-grid').appendChild(namesScrollSentinel);
        } else {
          removeSentinel();
        }
      }
    }, { rootMargin: '200px' });

    observer.observe(namesScrollSentinel);
    namesScrollSentinel._observer = observer;
  }

  function removeSentinel() {
    if (namesScrollSentinel) {
      if (namesScrollSentinel._observer) {
        namesScrollSentinel._observer.disconnect();
      }
      namesScrollSentinel.remove();
      namesScrollSentinel = null;
    }
  }

  // Search & filter event listeners
  document.getElementById('names-search').addEventListener('input', debounce((e) => {
    STATE.nameSearchQuery = e.target.value;
    filterAndRenderNames();
  }, 200));

  document.getElementById('range-filter').addEventListener('change', (e) => {
    STATE.nameRangeFilter = e.target.value;
    filterAndRenderNames();
  });

  document.getElementById('status-filter').addEventListener('change', (e) => {
    STATE.nameStatusFilter = e.target.value;
    filterAndRenderNames();
  });


  // ---- Verses View ----
  function renderVerse(num) {
    num = Math.max(1, Math.min(TOTAL_VERSES, num));
    STATE.currentVerse = num;

    const verse = DATA.verses[num];
    const names = getNamesByVerse(num);
    const display = document.getElementById('verse-display');
    const jumpInput = document.getElementById('verse-jump');

    jumpInput.value = num;

    // Prev/next buttons
    document.getElementById('verse-prev').disabled = num <= 1;
    document.getElementById('verse-next').disabled = num >= TOTAL_VERSES;

    // Progress bar
    const completedVerses = countCompletedVerses();
    const pct = TOTAL_VERSES > 0 ? (completedVerses / TOTAL_VERSES) * 100 : 0;
    document.getElementById('verse-progress-fill').style.width = pct + '%';
    document.getElementById('verse-progress-text').textContent =
      `${completedVerses} of ${TOTAL_VERSES} verses completed`;

    // Check if all names in this verse are learned
    const allLearned = names.length > 0 && names.every(n => isLearned(n.number));

    let html = `
      <div class="verse-number-label">Verse ${num}</div>
      <div class="verse-sanskrit-text">${verse ? verse.sanskrit : ''}</div>
      <div class="verse-names-list">
    `;

    names.forEach(n => {
      const learned = isLearned(n.number);
      html += `
        <div class="verse-name-item${learned ? ' learned' : ''}">
          <div class="verse-name-num">${n.number}</div>
          <div class="verse-name-info">
            <div class="verse-name-sanskrit">${n.sanskrit}</div>
            <div class="verse-name-translit">${escHtml(n.transliteration)}</div>
            <div class="verse-name-meaning">${escHtml(n.meaning)}</div>
          </div>
        </div>
      `;
    });

    html += `</div>`;

    if (names.length > 0) {
      html += `
        <div class="verse-actions">
          <button class="verse-learn-btn ${allLearned ? 'unmark' : 'mark'}" id="verse-learn-toggle">
            ${allLearned ? 'Unmark Verse' : 'Mark Verse as Learned'}
          </button>
        </div>
      `;
    }

    display.innerHTML = html;

    // Attach verse learn button
    const verseBtn = document.getElementById('verse-learn-toggle');
    if (verseBtn) {
      verseBtn.addEventListener('click', () => {
        const allCurrentlyLearned = names.every(n => isLearned(n.number));
        names.forEach(n => {
          if (allCurrentlyLearned) {
            STATE.learnedNames.delete(n.number);
          } else {
            STATE.learnedNames.add(n.number);
          }
        });
        saveProgress();
        renderVerse(STATE.currentVerse);
        updateHomeStats();
      });
    }
  }

  function countCompletedVerses() {
    let count = 0;
    for (let v = 1; v <= TOTAL_VERSES; v++) {
      const names = getNamesByVerse(v);
      if (names.length > 0 && names.every(n => isLearned(n.number))) {
        count++;
      }
    }
    return count;
  }

  // Verse navigation
  document.getElementById('verse-prev').addEventListener('click', () => {
    renderVerse(STATE.currentVerse - 1);
  });

  document.getElementById('verse-next').addEventListener('click', () => {
    renderVerse(STATE.currentVerse + 1);
  });

  document.getElementById('verse-jump').addEventListener('change', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > TOTAL_VERSES) val = TOTAL_VERSES;
    renderVerse(val);
  });

  // Keyboard nav for verses
  document.addEventListener('keydown', (e) => {
    if (STATE.currentView !== 'verses') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') renderVerse(STATE.currentVerse - 1);
    if (e.key === 'ArrowRight') renderVerse(STATE.currentVerse + 1);
  });


  // ---- Practice View ----
  function initPractice() {
    STATE.scoreGot = 0;
    STATE.scoreReview = 0;
    updatePracticeScore();
    buildPracticeQueue();
    showNextCard();
  }

  function buildPracticeQueue() {
    const scope = STATE.practiceScope;
    let pool = [];

    if (scope === 'due') {
      // Due Today scope - only overdue and never-reviewed names
      const srsData = loadSRS();
      const today = todayStr();
      pool = DATA.names.filter(n => {
        const entry = srsData[n.number];
        return !entry || entry.nextReview <= today;
      });
    } else if (scope === 'unlearned') {
      pool = DATA.names.filter(n => !isLearned(n.number));
    } else if (scope === 'all') {
      pool = [...DATA.names];
    } else {
      // Verse range like "1-100" or "101-182"
      const [lo, hi] = scope.split('-').map(Number);
      pool = DATA.names.filter(n => {
        return n.verse !== null && n.verse >= lo && n.verse <= hi;
      });
    }

    // Sort by SRS priority: overdue first, then never reviewed, then shortest interval
    const srsData = loadSRS();
    const today = todayStr();

    pool.sort((a, b) => {
      const ea = srsData[a.number];
      const eb = srsData[b.number];
      const aOverdue = ea && ea.nextReview <= today;
      const bOverdue = eb && eb.nextReview <= today;
      const aNever = !ea;
      const bNever = !eb;

      // Overdue names first
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      // Then never reviewed
      if (aNever && !bNever) return -1;
      if (!aNever && bNever) return 1;
      // Then by interval (shortest first)
      const aInt = ea ? ea.interval : 0;
      const bInt = eb ? eb.interval : 0;
      return aInt - bInt;
    });

    STATE.practiceQueue = pool;
    STATE.practiceIndex = 0;

    // Update due count display
    updateDueCount();
  }

  function updateDueCount() {
    const dueEl = document.getElementById('practice-due-count');
    if (dueEl) {
      const count = countDueNames();
      dueEl.textContent = count > 0 ? `Due for review: ${count} names` : 'All caught up!';
    }
  }

  function showNextCard() {
    const container = document.querySelector('.flashcard-container');
    const flashcard = document.getElementById('flashcard');
    const actions = document.getElementById('practice-actions');
    const hint = document.getElementById('flip-hint');
    const empty = document.getElementById('practice-empty');

    if (STATE.practiceIndex >= STATE.practiceQueue.length) {
      // Rebuild queue with fresh SRS data if we've gone through all
      if (STATE.practiceQueue.length === 0) {
        container.style.display = 'none';
        actions.hidden = true;
        hint.hidden = true;
        empty.hidden = false;
        return;
      }
      buildPracticeQueue();
    }

    container.style.display = '';
    empty.hidden = true;
    hint.hidden = false;

    const name = STATE.practiceQueue[STATE.practiceIndex];
    STATE.practiceFlipped = false;
    flashcard.classList.remove('flipped');
    actions.hidden = true;

    const front = document.getElementById('flashcard-front');
    const back = document.getElementById('flashcard-back');

    if (STATE.practiceMode === 's2m') {
      // Front: Sanskrit, Back: Meaning
      front.innerHTML = `
        <div class="flashcard-label">What does this name mean?</div>
        <div class="flashcard-sanskrit">${name.sanskrit}</div>
        <div class="flashcard-translit">${escHtml(name.transliteration)}</div>
        <div class="flashcard-number">#${name.number}</div>
      `;
      back.innerHTML = `
        <div class="flashcard-label">Meaning</div>
        <div class="flashcard-meaning">${escHtml(name.meaning)}</div>
        <div class="flashcard-number">#${name.number} - ${escHtml(name.transliteration)}</div>
      `;
    } else {
      // Front: Meaning, Back: Sanskrit
      front.innerHTML = `
        <div class="flashcard-label">Which name is this?</div>
        <div class="flashcard-meaning">${escHtml(name.meaning)}</div>
        <div class="flashcard-number">#${name.number}</div>
      `;
      back.innerHTML = `
        <div class="flashcard-label">Sanskrit Name</div>
        <div class="flashcard-sanskrit">${name.sanskrit}</div>
        <div class="flashcard-translit">${escHtml(name.transliteration)}</div>
        <div class="flashcard-number">#${name.number}</div>
      `;
    }
  }

  function flipCard() {
    const flashcard = document.getElementById('flashcard');
    const actions = document.getElementById('practice-actions');
    const hint = document.getElementById('flip-hint');

    if (!STATE.practiceFlipped) {
      flashcard.classList.add('flipped');
      STATE.practiceFlipped = true;
      actions.hidden = false;
      hint.hidden = true;
    }
  }

  function updatePracticeScore() {
    document.getElementById('score-got').textContent = STATE.scoreGot;
    document.getElementById('score-review').textContent = STATE.scoreReview;
  }

  // Flashcard click
  document.getElementById('flashcard').addEventListener('click', flipCard);
  document.getElementById('flashcard').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flipCard();
    }
  });

  // Got it
  document.getElementById('btn-got').addEventListener('click', () => {
    const name = STATE.practiceQueue[STATE.practiceIndex];
    if (name) {
      markLearned(name.number);
      recordSRS(name.number, 5);
    }
    STATE.scoreGot++;
    STATE.practiceIndex++;
    updatePracticeScore();
    updateDueCount();
    updateHomeStats();
    showNextCard();
  });

  // Review again
  document.getElementById('btn-review').addEventListener('click', () => {
    const name = STATE.practiceQueue[STATE.practiceIndex];
    if (name) {
      recordSRS(name.number, 1);
    }
    STATE.scoreReview++;
    STATE.practiceIndex++;
    updatePracticeScore();
    updateDueCount();
    showNextCard();
  });

  // Mode toggle
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.practiceMode = btn.dataset.mode;
      showNextCard();
    });
  });

  // Scope change
  document.getElementById('practice-scope').addEventListener('change', (e) => {
    STATE.practiceScope = e.target.value;
    STATE.scoreGot = 0;
    STATE.scoreReview = 0;
    updatePracticeScore();
    buildPracticeQueue();
    showNextCard();
  });

  // Keyboard shortcuts for practice
  document.addEventListener('keydown', (e) => {
    if (STATE.currentView !== 'practice') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!STATE.practiceFlipped) {
        flipCard();
      }
    } else if (e.key === 'ArrowRight' || e.key === 'g') {
      if (STATE.practiceFlipped) {
        document.getElementById('btn-got').click();
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'r') {
      if (STATE.practiceFlipped) {
        document.getElementById('btn-review').click();
      }
    }
  });


  // ---- Chant View ----
  const CHANT_POS_KEY = 'lsn_chant_pos';
  const CHANT_SETTINGS_KEY = 'lsn_chant_settings';
  const DEVA_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

  function toDevanagariNum(n) {
    return String(n).split('').map(function(d) { return DEVA_DIGITS[parseInt(d, 10)]; }).join('');
  }

  function loadChantSettings() {
    try {
      var raw = localStorage.getItem(CHANT_SETTINGS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (typeof s.speed === 'number') STATE.chantSpeed = s.speed;
        if (typeof s.showTranslit === 'boolean') STATE.chantShowTranslit = s.showTranslit;
        if (typeof s.showMeaning === 'boolean') STATE.chantShowMeaning = s.showMeaning;
        if (typeof s.auto === 'boolean') STATE.chantAuto = s.auto;
      }
    } catch (e) { /* ignore */ }
    try {
      var pos = localStorage.getItem(CHANT_POS_KEY);
      if (pos) {
        var v = parseInt(pos, 10);
        if (v >= 1 && v <= TOTAL_VERSES) STATE.chantVerse = v;
      }
    } catch (e) { /* ignore */ }
  }

  function saveChantSettings() {
    try {
      localStorage.setItem(CHANT_SETTINGS_KEY, JSON.stringify({
        speed: STATE.chantSpeed,
        showTranslit: STATE.chantShowTranslit,
        showMeaning: STATE.chantShowMeaning,
        auto: STATE.chantAuto,
      }));
    } catch (e) { /* ignore */ }
  }

  function saveChantPos() {
    try {
      localStorage.setItem(CHANT_POS_KEY, String(STATE.chantVerse));
    } catch (e) { /* ignore */ }
  }

  function initChant() {
    loadChantSettings();

    // Sync UI controls with state
    var startInput = document.getElementById('chant-start');
    var autoCheck = document.getElementById('chant-auto');
    var autoLabel = document.getElementById('chant-auto-label');
    var speedSlider = document.getElementById('chant-speed');
    var speedLabel = document.getElementById('chant-speed-label');
    var translitCheck = document.getElementById('chant-show-translit');
    var meaningCheck = document.getElementById('chant-show-meaning');

    startInput.value = STATE.chantVerse;
    autoCheck.checked = STATE.chantAuto;
    autoLabel.textContent = STATE.chantAuto ? 'On' : 'Off';
    speedSlider.value = STATE.chantSpeed;
    speedLabel.textContent = STATE.chantSpeed + 's';
    translitCheck.checked = STATE.chantShowTranslit;
    meaningCheck.checked = STATE.chantShowMeaning;

    buildChantDots();
    renderChantVerse(STATE.chantVerse);

    if (STATE.chantAuto) {
      startChantTimer();
    }
  }

  function buildChantDots() {
    var container = document.getElementById('chant-dots');
    container.innerHTML = '';
    for (var i = 1; i <= TOTAL_VERSES; i++) {
      var dot = document.createElement('span');
      dot.className = 'chant-dot' + (i === STATE.chantVerse ? ' active' : '');
      dot.dataset.verse = i;
      container.appendChild(dot);
    }
  }

  function updateChantDots() {
    var dots = document.querySelectorAll('.chant-dot');
    dots.forEach(function(d) {
      d.classList.toggle('active', parseInt(d.dataset.verse, 10) === STATE.chantVerse);
    });
    // Scroll active dot into view
    var activeDot = document.querySelector('.chant-dot.active');
    if (activeDot) {
      activeDot.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }

  function renderChantVerse(num) {
    num = Math.max(1, Math.min(TOTAL_VERSES, num));
    STATE.chantVerse = num;
    saveChantPos();

    var verse = DATA.verses[num];
    var names = getNamesByVerse(num);
    var stage = document.getElementById('chant-stage');

    // Fade out
    stage.classList.add('chant-fade');

    setTimeout(function() {
      // Verse number in Devanagari
      document.getElementById('chant-verse-num').textContent = '॥ ' + toDevanagariNum(num) + ' ॥';

      // Sanskrit text
      document.getElementById('chant-sanskrit').textContent = verse ? verse.sanskrit : '';

      // Transliteration - combine name transliterations
      var translitEl = document.getElementById('chant-translit');
      if (STATE.chantShowTranslit && names.length > 0) {
        translitEl.textContent = names.map(function(n) { return n.transliteration; }).join(' | ');
        translitEl.hidden = false;
      } else {
        translitEl.hidden = true;
      }

      // Meanings
      var meaningsEl = document.getElementById('chant-meanings');
      if (STATE.chantShowMeaning && names.length > 0) {
        meaningsEl.innerHTML = names.map(function(n) {
          return '<div><strong>' + escHtml(n.transliteration) + '</strong> - ' + escHtml(n.meaning) + '</div>';
        }).join('');
        meaningsEl.hidden = false;
      } else {
        meaningsEl.hidden = true;
      }

      // Update info bar
      document.getElementById('chant-verse-info').textContent = 'Verse ' + num + ' of ' + TOTAL_VERSES;

      // Update start input
      document.getElementById('chant-start').value = num;

      // Update nav buttons
      document.getElementById('chant-prev').disabled = num <= 1;
      document.getElementById('chant-next').disabled = num >= TOTAL_VERSES;

      // Update dots
      updateChantDots();

      // Fade in
      stage.classList.remove('chant-fade');
    }, 150);
  }

  function chantNext() {
    if (STATE.chantVerse >= TOTAL_VERSES) {
      if (STATE.chantAuto) {
        stopChantTimer();
        STATE.chantAuto = false;
        document.getElementById('chant-auto').checked = false;
        document.getElementById('chant-auto-label').textContent = 'Off';
        saveChantSettings();
      }
      return;
    }
    renderChantVerse(STATE.chantVerse + 1);
  }

  function chantPrev() {
    if (STATE.chantVerse <= 1) return;
    renderChantVerse(STATE.chantVerse - 1);
  }

  function startChantTimer() {
    stopChantTimer();
    STATE.chantTimer = setInterval(chantNext, STATE.chantSpeed * 1000);
  }

  function stopChantTimer() {
    if (STATE.chantTimer) {
      clearInterval(STATE.chantTimer);
      STATE.chantTimer = null;
    }
  }

  function toggleChantFullscreen() {
    STATE.chantFullscreen = !STATE.chantFullscreen;
    document.body.classList.toggle('chant-fullscreen', STATE.chantFullscreen);

    var btn = document.getElementById('chant-fullscreen');
    btn.textContent = STATE.chantFullscreen ? 'Exit Full Screen' : 'Full Screen';

    if (STATE.chantFullscreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(function() {});
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(function() {});
      }
    }
  }

  // Chant event listeners
  document.getElementById('chant-prev').addEventListener('click', chantPrev);
  document.getElementById('chant-next').addEventListener('click', chantNext);

  document.getElementById('chant-fullscreen').addEventListener('click', toggleChantFullscreen);

  document.getElementById('chant-settings-toggle').addEventListener('click', function() {
    var panel = document.getElementById('chant-settings');
    panel.hidden = !panel.hidden;
  });

  document.getElementById('chant-start').addEventListener('change', function(e) {
    var val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > TOTAL_VERSES) val = TOTAL_VERSES;
    renderChantVerse(val);
  });

  document.getElementById('chant-auto').addEventListener('change', function(e) {
    STATE.chantAuto = e.target.checked;
    document.getElementById('chant-auto-label').textContent = STATE.chantAuto ? 'On' : 'Off';
    saveChantSettings();
    if (STATE.chantAuto) {
      startChantTimer();
    } else {
      stopChantTimer();
    }
  });

  document.getElementById('chant-speed').addEventListener('input', function(e) {
    STATE.chantSpeed = parseInt(e.target.value, 10);
    document.getElementById('chant-speed-label').textContent = STATE.chantSpeed + 's';
    saveChantSettings();
    if (STATE.chantAuto) {
      startChantTimer();
    }
  });

  document.getElementById('chant-show-translit').addEventListener('change', function(e) {
    STATE.chantShowTranslit = e.target.checked;
    saveChantSettings();
    renderChantVerse(STATE.chantVerse);
  });

  document.getElementById('chant-show-meaning').addEventListener('change', function(e) {
    STATE.chantShowMeaning = e.target.checked;
    saveChantSettings();
    renderChantVerse(STATE.chantVerse);
  });

  // Chant keyboard navigation
  document.addEventListener('keydown', function(e) {
    if (STATE.currentView !== 'chant') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      chantNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      chantPrev();
    } else if (e.key === 'f' || e.key === 'F') {
      toggleChantFullscreen();
    } else if (e.key === 'Escape' && STATE.chantFullscreen) {
      toggleChantFullscreen();
    }
  });

  // Handle browser exiting fullscreen (e.g. pressing Esc natively)
  document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement && STATE.chantFullscreen) {
      STATE.chantFullscreen = false;
      document.body.classList.remove('chant-fullscreen');
      var btn = document.getElementById('chant-fullscreen');
      if (btn) btn.textContent = 'Full Screen';
    }
  });

  // Chant dot click navigation
  document.getElementById('chant-dots').addEventListener('click', function(e) {
    var dot = e.target.closest('.chant-dot');
    if (dot && dot.dataset.verse) {
      renderChantVerse(parseInt(dot.dataset.verse, 10));
    }
  });


  // ---- Utility ----
  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }


  // ---- Export / Import ----
  const EXPECTED_KEYS = ['lsn_learned', 'lsn_srs', 'lsn_notes', 'lsn_sadhana', 'lsn_fontsize', 'lsn_chant_pos', 'lsn_theme'];

  function exportData() {
    const data = {};
    EXPECTED_KEYS.forEach(key => {
      const val = localStorage.getItem(key);
      if (val !== null) {
        data[key] = JSON.parse(val);
      }
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'lalita-sahasranama-backup-' + today + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        // Validate: at least one expected key must be present
        const hasValidKey = EXPECTED_KEYS.some(key => key in data);
        if (!hasValidKey) {
          alert('Invalid backup file. No recognized data found.');
          return;
        }
        if (!confirm('This will replace your current progress. Continue?')) {
          return;
        }
        EXPECTED_KEYS.forEach(key => {
          if (key in data) {
            localStorage.setItem(key, JSON.stringify(data[key]));
          }
        });
        window.location.reload();
      } catch (err) {
        alert('Failed to read backup file. Make sure it is a valid JSON file.');
      }
    };
    reader.readAsText(file);
  }

  document.getElementById('export-data').addEventListener('click', exportData);
  document.getElementById('import-data').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importData(file);
      e.target.value = '';
    }
  });

  // ---- Init ----
  function init() {
    initTheme();
    loadProgress();
    loadFontSize();
    injectFontControls();
    injectDueCountEl();
    injectDueTodayOption();
    const view = getHash();
    navigate(view);
  }

  function injectFontControls() {
    const controls = document.getElementById('font-controls');
    if (!controls) return;
    controls.innerHTML = '<button class="font-btn" id="font-dec" aria-label="Decrease font size">A-</button><button class="font-btn" id="font-inc" aria-label="Increase font size">A+</button>';

    document.getElementById('font-dec').addEventListener('click', () => cycleFontSize(-1));
    document.getElementById('font-inc').addEventListener('click', () => cycleFontSize(1));
  }

  // ---- Theme (light/dark/system) ----
  const THEME_KEY = 'lsn_theme';
  const THEME_CYCLE = ['system', 'light', 'dark'];
  const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

  function getStoredTheme() {
    return localStorage.getItem(THEME_KEY) || 'system';
  }

  function applyTheme(mode) {
    const html = document.documentElement;
    if (mode === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else if (mode === 'light') {
      html.setAttribute('data-theme', 'light');
    } else {
      html.removeAttribute('data-theme');
    }
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = THEME_LABELS[mode];
    localStorage.setItem(THEME_KEY, mode);
  }

  function cycleTheme() {
    const current = getStoredTheme();
    const idx = THEME_CYCLE.indexOf(current);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    applyTheme(next);
  }

  function initTheme() {
    applyTheme(getStoredTheme());
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', cycleTheme);
  }

  function injectDueCountEl() {
    const scoreEl = document.getElementById('practice-score');
    if (!scoreEl) return;
    const dueEl = document.createElement('div');
    dueEl.className = 'practice-due-count';
    dueEl.id = 'practice-due-count';
    scoreEl.insertAdjacentElement('afterend', dueEl);
  }

  function injectDueTodayOption() {
    const scopeSelect = document.getElementById('practice-scope');
    if (!scopeSelect) return;
    // Insert "Due Today" after "Unlearned Only"
    const unlearned = scopeSelect.querySelector('option[value="unlearned"]');
    const dueOption = document.createElement('option');
    dueOption.value = 'due';
    dueOption.textContent = 'Due Today';
    if (unlearned && unlearned.nextSibling) {
      scopeSelect.insertBefore(dueOption, unlearned.nextSibling);
    } else {
      scopeSelect.appendChild(dueOption);
    }
  }

  // Run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
