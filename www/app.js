// سمعلي: one empty screen with just the question. The student recites from
// memory, the app works out which item they are on and follows along, and only
// when they go quiet does it pop a funny meme hint.
(function () {
  const $ = id => document.getElementById(id);
  const timing = { stall: 4000, stage: 6000 }; // silence before the first hint, then before each stronger one
  const LOCATE_AFTER = 3; // heard words that don't fit the current item before looking at the others
  const CHEER_MS = 1400;

  const LINES = {
    start: ['ها؟ ساكت ليش؟ هاك تلميح 👇', 'نسيت شلون تبدي؟ شوف الصورة 😂', 'يلا بطل، الصورة تذكرك 😎', 'الأستاذ ينتظرك 👀'],
    stall: ['ها؟ وكفت؟ 😅', 'الجواب على طرف لسانك 👅', 'ركّز يا بطل، شوف الصورة 🧠', 'لا تخلي الأستاذ يزعل 😂',
      'يمعود تذكر، هاي الصورة تذكرك 👀', 'وين رحت؟ ارجع ويانا 🛸', 'دماغك علّق؟ هاك تلميح 🔌'],
    words: ['هاك أول كلمتين، لا تكول ما ساعدتك 🙈', 'خوش، أساعدك شوية بعد 🤏', 'ها هاي بداية الجملة 👇'],
    full: ['خلاص هاك المقطع كله، اقره وعيده 📖', 'ماكو مشكلة، اقره وكمّل 💪'],
    cheer: ['عاش! 🔥', 'وحش 💪', 'صح لسانك 👏', 'ولك انت عبقري 🤯', 'الأستاذ فخور بيك 🥹', 'نار 🔥🔥', 'حفظ ميه بالميه 💯'],
  };
  const pick = list => list[Math.floor(Math.random() * list.length)];

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('samaali:' + key); return v === null ? fallback : JSON.parse(v); }
      catch (_) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem('samaali:' + key, JSON.stringify(value)); } catch (_) {} },
  };

  let items = [];   // every item of every chapter, in booklet order
  let entries = []; // the matcher's view of each item
  let st = null;    // where the student is in the current item
  let listening = false;
  let cheering = false;
  let speech = null;

  // ---------- following the student ----------
  // Starts following items[index]. `start` is where the current speech segment
  // lines up in the item and `pointer` how far it got; segment bookkeeping
  // carries over so a jump mid-sentence keeps lining up.
  function begin(index, start = 0, pointer = start) {
    const carry = st ? { segment: st.segment, tokOffset: st.tokOffset } : { segment: -1, tokOffset: 0 };
    st = Object.assign({
      index, words: entries[index].words, segStart: start, pointer: Math.max(start, pointer), states: {},
      hint: 0, hintChunk: -1, hintAt: 0, hintsUsed: 0, lastProgress: Date.now(),
    }, carry);
    if (st.pointer === start) {
      while (st.pointer < st.words.length && st.words[st.pointer].optional) st.pointer++;
      st.segStart = st.pointer;
    }
    store.set('pos', items[index].id);
    hideHint();
    if (!cheering) showQuestion();
    items[index].chunks.forEach(c => { new Image().src = c.image; });
  }

  function onHeard(text, segment) {
    if (!st || !listening) return;
    if (segment !== st.segment) { st.segment = segment; st.segStart = st.pointer; st.tokOffset = 0; }
    const toks = Match.tokenize(text);
    const fresh = toks.slice(st.tokOffset).join(' ');
    if (!fresh) return;
    const r = follow(fresh);
    if (st.pointer >= st.words.length) { complete(toks.length); return; }
    if (r.unmatchedRun >= LOCATE_AFTER) relocate(fresh, toks.length);
  }

  // Lines the segment's words up with the current item from where the segment began.
  function follow(fresh) {
    const r = Match.align(st.words, st.segStart, fresh);
    for (const k in st.states) if (k >= st.segStart) delete st.states[k];
    Object.assign(st.states, r.states);
    const pointer = Math.max(st.segStart, r.pointer);
    const moved = pointer > st.pointer;
    st.pointer = pointer; // the recognizer may also take words back
    if (moved) progressed();
    return r;
  }

  // The words don't fit where we are: maybe they jumped to another item, said its question, or restarted.
  function relocate(fresh, tokCount) {
    const found = Match.locate(entries, fresh, st.index);
    if (!found || (found.index === st.index && found.start === st.segStart)) return;
    begin(found.index, found.start, found.pointer);
    follow(fresh);
    st.lastProgress = Date.now();
    if (st.pointer >= st.words.length) complete(tokCount);
  }

  function progressed() {
    st.lastProgress = Date.now();
    if (!st.hint) return;
    if (currentChunk() !== st.hintChunk) hideHint();
    else if (st.hint >= 2) setHintWords(st.hint);
  }

  function complete(tokCount) {
    const required = st.words.filter(w => !w.optional).length;
    const matched = st.words.filter((w, k) => !w.optional && st.states[k] === 'matched').length;
    const id = items[st.index].id;
    const score = Math.round(matched / required * 100);
    if (score > store.get('best:' + id, -1)) store.set('best:' + id, score);
    cheer();
    st.tokOffset = tokCount; // words already heard in this segment belong to the finished item
    begin((st.index + 1) % items.length);
  }

  function currentChunk() {
    const w = st.words[Math.min(st.pointer, st.words.length - 1)];
    return w ? w.chunk : 0;
  }

  // ---------- question and hints ----------
  // The item's question stays on screen; the hint comes only after silence.
  function showQuestion() {
    const el = $('question');
    const prompt = items[st.index].prompt;
    if (!el.hidden && el.textContent === prompt) return;
    el.textContent = prompt;
    el.hidden = false;
    replay(el);
  }

  // Stage 1: the meme card. Stage 2: also the next two words. Stage 3: the rest of the chunk to read.
  function showHint(stage) {
    const item = items[st.index];
    const ci = currentChunk();
    const chunk = item.chunks[ci];
    const isNew = !st.hint || ci !== st.hintChunk;
    const started = Object.keys(st.states).some(k => st.states[k] === 'matched');
    st.hint = stage;
    st.hintChunk = ci;
    st.hintAt = Date.now();
    st.hintsUsed++;
    $('hint-line').textContent = pick(stage === 1 ? (started ? LINES.stall : LINES.start) : stage === 2 ? LINES.words : LINES.full);
    if (isNew) {
      $('hint-img').src = chunk.image;
      $('hint-img').alt = 'تلميح: ' + chunk.caption;
      replay($('hint'));
    }
    setHintWords(stage);
    if (stage >= 2) replay($('hint-words'));
    $('hint').hidden = false;
  }

  function setHintWords(stage) {
    const el = $('hint-words');
    const rest = st.words.slice(st.pointer).filter(w => w.chunk === st.hintChunk);
    const shown = stage >= 3 ? rest : rest.filter(w => !w.optional).slice(0, 2);
    el.textContent = shown.length ? shown.map(w => w.raw).join(' ') + (shown.length < rest.length ? ' ...' : '') : '';
    el.hidden = stage < 2 || !shown.length;
  }

  function hideHint() {
    if (st) { st.hint = 0; st.hintChunk = -1; }
    $('hint').hidden = true;
  }

  function replay(el) {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  function cheer() {
    const el = $('cheer');
    el.textContent = pick(LINES.cheer);
    el.hidden = false;
    $('question').hidden = true;
    cheering = true;
    replay(el);
    clearTimeout(cheer.timer);
    cheer.timer = setTimeout(() => {
      el.hidden = true;
      cheering = false;
      if (!st) return;
      st.lastProgress = Date.now();
      showQuestion();
    }, CHEER_MS);
  }

  setInterval(() => {
    if (!st || !listening || cheering) return;
    const now = Date.now();
    if (now - st.lastProgress < timing.stall) return;
    if (!st.hint) showHint(1);
    else if (st.hint < 3 && now - st.hintAt > timing.stage) showHint(st.hint + 1);
  }, 250);

  // ---------- listening ----------
  function setNotice(text) {
    $('notice').textContent = text;
    $('notice').hidden = !text;
  }

  function listen(fromTap = false) {
    if (speech) return;
    speech = new Speech({
      lang: 'ar-IQ',
      onText: onHeard,
      onState: state => {
        if (state === 'listening') {
          listening = true;
          if (st) st.lastProgress = Date.now();
          setNotice('');
          $('dot').classList.add('on');
          keepAwake();
          return;
        }
        if (state === 'stopped') return;
        listening = false;
        speech = null;
        $('dot').classList.remove('on');
        hideHint();
        if (state === 'needs-tap') setNotice('دوس على الشاشة حتى أبدي أسمعك 🎙️');
        if (state === 'service-off') setNotice('فعّل الإملاء بالآيفون: الإعدادات ← عام ← لوحة المفاتيح ← تفعيل الإملاء، وبعدين دوس على الشاشة 🎙️');
        if (state === 'denied') setNotice('اسمح للتطبيق يستخدم المايك حتى يسمعك 🎙️ وبعدين دوس على الشاشة');
        if (state === 'unsupported') setNotice('موبايلك ما بيه خدمة التعرف على الصوت 😕 نزّل تطبيق Google وجرب مرة ثانية');
        if (state === 'error') setNotice('المايك ما اشتغل 😕 دوس على الشاشة وجرب مرة ثانية');
      },
    });
    speech.start(fromTap);
  }

  function pause() {
    if (speech) speech.stop();
    speech = null;
    listening = false;
    $('dot').classList.remove('on');
  }

  // The phone sits untouched while the student recites, so keep the screen on.
  let wakeLock = null;
  function keepAwake() {
    if (wakeLock || !navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {});
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else if (st) listen();
  });

  // Tapping starts the mic if it isn't on, otherwise asks for a stronger hint.
  $('stage').addEventListener('click', () => {
    if (!st) return;
    if (!listening) { listen(true); return; }
    showHint(Math.min(3, st.hint + 1));
  });

  // For testing without a microphone: Samaali.say('...') is one new speech
  // segment; pass the same segment number again to send a longer partial.
  window.Samaali = {
    say(text, segment) {
      if (!st) return;
      listening = true;
      onHeard(text, segment === undefined ? st.segment + 1 : segment);
    },
    state() {
      return st && { id: items[st.index].id, pointer: st.pointer, length: st.words.length, hint: st.hint, listening };
    },
    timing,
  };

  fetch('data/index.json')
    .then(r => r.json())
    .then(index => Promise.all(index.chapters.map(c => fetch(c.file).then(r => r.json()))))
    .then(chapters => {
      chapters.forEach(ch => items.push(...ch.items));
      entries = items.map(it => ({ words: Match.buildWords(it), prompt: Match.promptWords(it.prompt) }));
      const saved = items.findIndex(it => it.id === store.get('pos', null));
      begin(saved < 0 ? 0 : saved);
      listen();
    })
    .catch(() => setNotice('ما كدرت أحمّل الأسئلة 😕'));
})();
