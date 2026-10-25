(function () {
  const $ = id => document.getElementById(id);
  const HINT_STAGE2_MS = 7000;
  const WRONG_WORDS_FOR_HINT = 3;

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('samaali:' + key); return v === null ? fallback : JSON.parse(v); }
      catch (_) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem('samaali:' + key, JSON.stringify(value)); } catch (_) {} },
  };

  const settings = Object.assign({ lang: 'ar-IQ', stall: 5000, showHeard: true }, store.get('settings', {}));
  let index = null;
  let chapter = null;
  let chapterId = store.get('chapter', null);
  let filter = 'الكل';
  let session = null;

  // ---------- screens ----------
  function show(id) {
    ['home', 'recite', 'result'].forEach(s => { $(s).hidden = s !== id; });
    window.scrollTo(0, 0);
  }

  // ---------- home ----------
  function bestOf(id) { return store.get('best:' + id, null); }

  function renderHome() {
    $('chapter-title').textContent = chapter.subject;
    const chapters = $('chapters');
    chapters.innerHTML = '';
    index.chapters.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.title;
      b.setAttribute('aria-pressed', String(c.id === chapterId));
      b.onclick = () => { if (c.id !== chapterId) loadChapter(c.id); };
      chapters.appendChild(b);
    });
    // Keep the selected chapter visible when the chip row scrolls on narrow screens.
    const current = chapters.querySelector('[aria-pressed="true"]');
    if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const done = chapter.items.filter(i => (bestOf(i.id) || 0) >= 80).length;
    $('overall-bar').style.width = (done / chapter.items.length * 100) + '%';
    $('overall-text').textContent = `حافظ ${done} من ${chapter.items.length}`;

    const types = ['الكل', ...new Set(chapter.items.map(i => i.type))];
    const chips = $('filters');
    chips.innerHTML = '';
    types.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t;
      b.setAttribute('aria-pressed', String(t === filter));
      b.onclick = () => { filter = t; renderHome(); };
      chips.appendChild(b);
    });

    const list = $('questions');
    list.innerHTML = '';
    chapter.items.filter(i => filter === 'الكل' || i.type === filter).forEach(item => {
      const li = document.createElement('li');
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'q-row';
      const best = bestOf(item.id);
      row.innerHTML = '<span class="q-text"></span><span class="tag"></span><span class="best"></span>';
      row.querySelector('.q-text').textContent = item.prompt;
      const tag = row.querySelector('.tag');
      tag.textContent = item.type;
      tag.dataset.type = item.type;
      const b = row.querySelector('.best');
      b.textContent = best === null ? 'جديد' : best + '%';
      if (best !== null) b.classList.add(best >= 80 ? 'good' : 'mid');
      row.onclick = () => startItem(item);
      li.appendChild(row);
      list.appendChild(li);
    });
  }

  // ---------- recite ----------
  function startItem(item) {
    stopListening();
    const words = Match.buildWords(item);
    session = {
      item, words, pointer: 0, segStart: 0, segment: -1, states: words.map(() => 'pending'),
      hintStage: 0, hintChunk: -1, hintsUsed: 0, lastProgress: Date.now(), startedAt: null, listening: false,
    };
    advanceOptional();
    const idx = chapter.items.indexOf(item);
    $('r-type').textContent = item.type;
    $('r-type').dataset.type = item.type;
    $('r-type').className = 'tag';
    $('r-counter').textContent = `${idx + 1} / ${chapter.items.length}`;
    $('r-prompt').textContent = item.prompt;
    $('r-heard').textContent = '';
    hideHint();
    setStatus('دوس على المايك وابدي تسمّع');
    renderAnswer();
    show('recite');
  }

  // Leading symbol tokens (Q, ΔV...) never need to be said.
  function advanceOptional() {
    const s = session;
    while (s.pointer < s.words.length && s.words[s.pointer].optional) {
      s.states[s.pointer] = 'skipped';
      s.pointer++;
    }
  }

  function renderAnswer(target = $('r-answer')) {
    const s = session;
    target.innerHTML = '';
    s.words.forEach((w, i) => {
      const span = document.createElement('span');
      span.className = 'w ' + s.states[i] + (i === s.pointer && target.id === 'r-answer' ? ' current' : '');
      span.textContent = w.raw;
      target.appendChild(span);
    });
  }

  function setStatus(text) { $('r-status').textContent = text; }

  function onHeard(text, segment) {
    const s = session;
    if (!s || !s.listening) return;
    if (settings.showHeard) $('r-heard').textContent = text;
    if (segment !== s.segment) { s.segment = segment; s.segStart = s.pointer; }
    const r = Match.align(s.words, s.segStart, text);
    for (let i = s.segStart; i < s.words.length; i++) s.states[i] = 'pending';
    Object.entries(r.states).forEach(([i, st]) => { s.states[i] = st; });
    const before = s.pointer;
    s.pointer = Math.max(s.segStart, r.pointer);
    if (s.pointer > before) {
      s.lastProgress = Date.now();
      if (s.hintStage && currentChunk() !== s.hintChunk) hideHint();
      else if (s.hintStage === 2) showHintWords();
    }
    renderAnswer();
    if (s.pointer >= s.words.length) { finish(); return; }
    if (r.unmatchedRun >= WRONG_WORDS_FOR_HINT && s.hintStage === 0) showHint();
  }

  function currentChunk() {
    const s = session;
    const w = s.words[Math.min(s.pointer, s.words.length - 1)];
    return w ? w.chunk : 0;
  }

  function showHint() {
    const s = session;
    const chunk = s.item.chunks[currentChunk()];
    if (s.hintStage === 0 || s.hintChunk !== currentChunk()) {
      s.hintStage = 1;
      s.hintChunk = currentChunk();
      s.hintsUsed++;
      s.hintShownAt = Date.now();
      $('hint-img').src = chunk.image;
      $('hint-img').alt = 'تلميح: ' + chunk.caption;
      $('hint-words').hidden = true;
      $('hint').hidden = false;
      setStatus('شوف التلميح وكمّل 👀');
    } else if (s.hintStage === 1) {
      s.hintStage = 2;
      s.hintsUsed++;
      showHintWords();
    }
  }

  // Second-level hint: the next two words to say, as text.
  function showHintWords() {
    const s = session;
    const next = s.words.slice(s.pointer).filter(w => !w.optional && w.chunk === s.hintChunk).slice(0, 2);
    $('hint-words').textContent = next.length ? next.map(w => w.raw).join(' ') + ' ...' : '';
    $('hint-words').hidden = !next.length;
  }

  function hideHint() {
    if (session) { session.hintStage = 0; session.hintChunk = -1; }
    $('hint').hidden = true;
    if (session && session.listening) setStatus('أسمعك... 👂');
  }

  setInterval(() => {
    const s = session;
    if (!s || !s.listening) return;
    const idle = Date.now() - s.lastProgress;
    if (s.hintStage === 0 && idle > settings.stall) showHint();
    else if (s.hintStage === 1 && Date.now() - s.hintShownAt > HINT_STAGE2_MS && idle > settings.stall) showHint();
  }, 250);

  let speech = null;
  function startListening() {
    const s = session;
    speech = new Speech({
      lang: settings.lang,
      onText: onHeard,
      onState: (state) => {
        if (state === 'listening') { s.listening = true; s.lastProgress = Date.now(); s.startedAt = s.startedAt || Date.now(); $('mic').classList.add('on'); setStatus('أسمعك... 👂'); }
        if (state === 'denied') { s.listening = false; $('mic').classList.remove('on'); setStatus('لازم تسمح للتطبيق يستخدم المايك من الإعدادات'); }
        if (state === 'unsupported') { s.listening = false; $('mic').classList.remove('on'); setStatus('التعرف على الصوت مو متوفر بهذا الجهاز'); }
        if (state === 'error') { s.listening = false; $('mic').classList.remove('on'); setStatus('صار خطأ بالمايك، جرب مرة ثانية'); }
      },
    });
    speech.start();
  }

  function stopListening() {
    if (speech) { speech.stop(); speech = null; }
    if (session) session.listening = false;
    $('mic').classList.remove('on');
  }

  function finish() {
    const s = session;
    stopListening();
    for (let i = s.pointer; i < s.words.length; i++) if (s.states[i] === 'pending') s.states[i] = s.words[i].optional ? 'skipped' : 'missed';
    const required = s.words.filter(w => !w.optional).length;
    const matched = s.words.filter((w, i) => !w.optional && s.states[i] === 'matched').length;
    const score = Math.round(matched / required * 100);
    const prev = bestOf(s.item.id);
    if (prev === null || score > prev) store.set('best:' + s.item.id, score);

    const el = $('s-score');
    el.textContent = score + '%';
    el.className = 'score' + (score >= 80 ? '' : score >= 50 ? ' mid' : ' low');
    $('s-verdict').textContent = score >= 95 ? 'حافظه حفظ 🔥' : score >= 80 ? 'زين، بس راجع الكلمات الحمر' : score >= 50 ? 'نص ونص، عيده مرة لخ' : 'يحتاج مراجعة 📖';
    const secs = s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : 0;
    $('s-stats').innerHTML = '';
    [`💡 ${s.hintsUsed} تلميح`, `⏱️ ${secs} ثانية`, `✅ ${matched} من ${required} كلمة`].forEach(t => {
      const span = document.createElement('span'); span.textContent = t; $('s-stats').appendChild(span);
    });
    $('s-prompt').textContent = s.item.prompt;
    renderAnswer($('s-answer'));
    show('result');
  }

  // ---------- wiring ----------
  $('mic').onclick = () => {
    if (!session) return;
    if (session.listening) { stopListening(); setStatus('وكفت التسميع. دوس المايك تكمّل'); }
    else startListening();
  };
  $('stuck').onclick = () => { if (session) showHint(); };
  $('done').onclick = () => { if (session) finish(); };
  $('back').onclick = () => { stopListening(); session = null; renderHome(); show('home'); };
  $('again').onclick = () => startItem(session.item);
  $('next').onclick = () => {
    const i = chapter.items.indexOf(session.item);
    startItem(chapter.items[(i + 1) % chapter.items.length]);
  };
  $('to-home').onclick = () => { session = null; renderHome(); show('home'); };

  $('open-settings').onclick = () => {
    $('set-lang').value = settings.lang;
    $('set-stall').value = String(settings.stall);
    $('set-heard').checked = settings.showHeard;
    $('settings').showModal();
  };
  $('settings').addEventListener('close', () => {
    settings.lang = $('set-lang').value;
    settings.stall = Number($('set-stall').value);
    settings.showHeard = $('set-heard').checked;
    store.set('settings', settings);
  });

  // Android back button: leave the recite/result screen instead of closing the app.
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
    const App = cap.registerPlugin('App');
    App.addListener('backButton', () => {
      if (!$('home').hidden) App.exitApp();
      else $('back').click();
    });
  }

  // For testing in a browser without a microphone: Samaali.say('...').
  window.Samaali = {
    say(text) {
      if (!session) return;
      if (!session.listening) { session.listening = true; session.startedAt = session.startedAt || Date.now(); }
      onHeard(text, (session.segment || 0) + 1);
    },
  };

  function loadChapter(id) {
    const entry = index.chapters.find(c => c.id === id) || index.chapters[0];
    return fetch(entry.file)
      .then(r => r.json())
      .then(data => {
        chapter = data;
        chapterId = entry.id;
        filter = 'الكل';
        store.set('chapter', chapterId);
        renderHome();
      });
  }

  fetch('data/index.json')
    .then(r => r.json())
    .then(data => { index = data; return loadChapter(chapterId); });
})();
