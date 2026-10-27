// Speech engine: the Android recognizer through the Capacitor plugin when the
// app runs natively, Chrome's Web Speech API when it runs in a browser.
// Recognizers stop after a pause, so both paths restart themselves while the
// session is active. Each restart is a new "segment": onText(text, segment)
// always receives the full text heard in the current segment so far.
(function (root) {
  const RESTART_GAP_MS = 400;
  // Safari on the iPhone has no Iraqi Arabic; it falls back along this chain.
  const LANG_FALLBACK = { 'ar-IQ': 'ar-SA', 'ar-SA': 'ar' };

  function nativePlugin() {
    const cap = root.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
    return cap.registerPlugin('SpeechRecognition');
  }

  class Speech {
    constructor({ lang, onText, onState, onSpeech }) {
      this.lang = lang;
      this.onText = onText;
      this.onState = onState;
      this.onSpeech = onSpeech || (() => {}); // the recognizer hears a voice, before it has any words
      this.active = false;
      this.segment = 0;
      this.native = nativePlugin();
      const WebRec = root.SpeechRecognition || root.webkitSpeechRecognition;
      this.supported = Boolean(this.native || WebRec);
      this.WebRec = WebRec;
    }

    // `fromTap`: started by a tap, so a refusal means the mic is really denied
    // (Safari refuses a start without one).
    async start(fromTap = false) {
      if (this.active) return;
      this.active = true;
      try {
        if (this.native) await this.startNative();
        else if (this.WebRec) this.startWeb(fromTap);
        else this.onState('unsupported');
      } catch (err) {
        this.active = false;
        this.onState('error', err);
      }
    }

    stop() {
      this.active = false;
      clearInterval(this.watchdog);
      if (this.native) {
        this.native.stop().catch(() => {});
        this.native.removeAllListeners().catch(() => {});
      } else if (this.rec) {
        this.rec.onend = null;
        try { this.rec.stop(); } catch (_) {}
      }
      this.onState('stopped');
    }

    async startNative() {
      const sr = this.native;
      const { available } = await sr.available();
      if (!available) { this.active = false; this.onState('unsupported'); return; }
      const perm = await sr.requestPermissions();
      if (perm.speechRecognition !== 'granted') { this.active = false; this.onState('denied'); return; }
      await sr.addListener('partialResults', d => {
        if (this.active && d.matches && d.matches.length) this.onText(d.matches[0], this.segment);
      });
      this.onState('listening');
      let lastStart = 0, starting = false;
      const begin = async () => {
        if (!this.active || starting) return;
        starting = true;
        this.segment++;
        lastStart = Date.now();
        try {
          await sr.start({ language: this.lang, maxResults: 1, partialResults: true, popup: false });
        } catch (_) { /* a failed start is retried by the watchdog */ }
        starting = false;
      };
      await begin();
      this.watchdog = setInterval(async () => {
        if (!this.active || starting || Date.now() - lastStart < 1200) return;
        try {
          const { listening } = await sr.isListening();
          if (!listening) setTimeout(begin, RESTART_GAP_MS);
        } catch (_) {}
      }, 700);
    }

    startWeb(fromTap) {
      const rec = new this.WebRec();
      rec.lang = this.lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = e => this.onText(Speech.joinResults(e.results), this.segment);
      rec.onspeechstart = rec.onsoundstart = () => this.onSpeech();
      rec.onerror = e => {
        if (e.error === 'language-not-supported' && LANG_FALLBACK[rec.lang]) {
          this.lang = rec.lang = LANG_FALLBACK[rec.lang]; // onend restarts in the new language
        } else if (e.error === 'service-not-allowed') {
          this.active = false;
          this.onState('service-off'); // iPhone: dictation is switched off
        } else if (e.error === 'not-allowed') {
          this.active = false;
          this.onState(fromTap ? 'denied' : 'needs-tap');
        }
      };
      rec.onend = () => {
        if (!this.active) return;
        setTimeout(() => {
          if (!this.active) return;
          this.segment++;
          try { rec.start(); } catch (err) {
            if (err && err.name !== 'InvalidStateError') { this.active = false; this.onState('needs-tap'); }
          }
        }, RESTART_GAP_MS);
      };
      this.rec = rec;
      this.segment++;
      rec.start();
      this.onState('listening');
    }
  }

  // Joins a result list into the text heard so far. Chrome sends each phrase as
  // its own result; Safari on the iPhone can send each one as the whole
  // transcript so far, sometimes with an early word corrected. A result that
  // opens the way the text so far opens replaces it instead of repeating it.
  Speech.joinResults = results => {
    let words = [];
    for (let i = 0; i < results.length; i++) {
      const next = String(results[i][0].transcript).trim().split(/\s+/).filter(Boolean);
      const n = Math.min(3, next.length, words.length);
      let same = 0;
      for (let k = 0; k < n; k++) if (next[k] === words[k]) same++;
      words = n && same >= Math.min(2, n) ? next : words.concat(next);
    }
    return words.join(' ');
  };

  root.Speech = Speech;
})(this);
