// Speech engine: the Android recognizer through the Capacitor plugin when the
// app runs natively, Chrome's Web Speech API when it runs in a browser.
// Recognizers stop after a pause, so both paths restart themselves while the
// session is active. Each restart is a new "segment": onText(text, segment)
// always receives the full text heard in the current segment so far.
(function (root) {
  const RESTART_GAP_MS = 400;

  function nativePlugin() {
    const cap = root.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
    return cap.registerPlugin('SpeechRecognition');
  }

  class Speech {
    constructor({ lang, onText, onState }) {
      this.lang = lang;
      this.onText = onText;
      this.onState = onState;
      this.active = false;
      this.segment = 0;
      this.native = nativePlugin();
      const WebRec = root.SpeechRecognition || root.webkitSpeechRecognition;
      this.supported = Boolean(this.native || WebRec);
      this.WebRec = WebRec;
    }

    async start() {
      if (this.active) return;
      this.active = true;
      try {
        if (this.native) await this.startNative();
        else if (this.WebRec) this.startWeb();
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

    startWeb() {
      const rec = new this.WebRec();
      rec.lang = this.lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = e => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript + ' ';
        this.onText(text.trim(), this.segment);
      };
      rec.onerror = e => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          this.active = false;
          this.onState('denied');
        }
      };
      rec.onend = () => {
        if (!this.active) return;
        setTimeout(() => { if (this.active) { this.segment++; try { rec.start(); } catch (_) {} } }, RESTART_GAP_MS);
      };
      this.rec = rec;
      this.segment++;
      rec.start();
      this.onState('listening');
    }
  }

  root.Speech = Speech;
})(this);
