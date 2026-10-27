// In the plain Android shell (native/), the shell exposes window.SamaaliNative.
// This wraps it in the small part of the Capacitor plugin API that speech.js
// uses, so the same web code runs in the shell, in Capacitor and in a browser.
(function (root) {
  const bridge = root.SamaaliNative;
  if (!bridge) return;

  const listeners = {}; // "Plugin:event" -> callbacks
  const pending = {};
  let nextId = 1;

  // The shell calls these through evaluateJavascript.
  root.__samaali = {
    emit(plugin, event, data) {
      (listeners[plugin + ':' + event] || []).slice().forEach(cb => { try { cb(data); } catch (_) {} });
    },
    resolve(id, value) {
      const done = pending[id];
      delete pending[id];
      if (done) done(value);
    },
  };

  function call(method, ...args) {
    return new Promise(resolve => {
      const id = nextId++;
      pending[id] = resolve;
      bridge[method](id, ...args);
    });
  }

  function listenerApi(plugin) {
    return {
      addListener(event, cb) {
        const key = plugin + ':' + event;
        (listeners[key] = listeners[key] || []).push(cb);
        const handle = { remove: () => { listeners[key] = (listeners[key] || []).filter(f => f !== cb); return Promise.resolve(); } };
        return Promise.resolve(handle);
      },
      removeAllListeners() {
        Object.keys(listeners).filter(k => k.startsWith(plugin + ':')).forEach(k => delete listeners[k]);
        return Promise.resolve();
      },
    };
  }

  const plugins = {
    SpeechRecognition: Object.assign(listenerApi('SpeechRecognition'), {
      available: () => Promise.resolve({ available: bridge.available() }),
      requestPermissions: () => call('requestPermission').then(granted => ({ speechRecognition: granted ? 'granted' : 'denied' })),
      start: options => { bridge.start((options && options.language) || 'ar-IQ'); return Promise.resolve(); },
      stop: () => { bridge.stop(); return Promise.resolve(); },
      isListening: () => Promise.resolve({ listening: bridge.isListening() }),
    }),
    App: Object.assign(listenerApi('App'), {
      exitApp: () => { bridge.exitApp(); return Promise.resolve(); },
    }),
  };

  root.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    registerPlugin: name => plugins[name],
  };
})(this);
