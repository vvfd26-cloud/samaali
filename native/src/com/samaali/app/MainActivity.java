package com.samaali.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;

/**
 * A plain WebView shell for the web app in assets/www. The pages are served
 * from a fake https origin so fetch() works, and the Android speech
 * recognizer is exposed to JavaScript as window.SamaaliNative (wrapped by
 * www/native-shim.js).
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int REQUEST_MIC = 1;

    private WebView web;
    private SpeechRecognizer recognizer;
    private AudioManager audio;
    private volatile boolean listening;
    private boolean paused;
    private boolean muted;
    private int pendingPermission = -1;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);

        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int background = dark ? 0xff0e131c : 0xfff4f6fb;
        Window window = getWindow();
        // The student recites without touching the phone, so keep the screen on.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        window.setStatusBarColor(background);
        window.setNavigationBarColor(background);
        if (!dark) window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        web = new WebView(this);
        web.setBackgroundColor(background);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setTextZoom(100);
        settings.setAllowFileAccess(false);
        web.addJavascriptInterface(new Bridge(), "SamaaliNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!HOST.equals(url.getHost())) return null;
                return asset(url.getPath());
            }

            // The WebResourceRequest overload is API 24; this one is still called on newer phones.
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !HOST.equals(Uri.parse(url).getHost());
            }
        });
        setContentView(web);
        web.loadUrl("https://" + HOST + "/index.html");
    }

    private WebResourceResponse asset(String path) {
        if (path == null || path.equals("/")) path = "/index.html";
        String type = mimeType(path);
        String encoding = type.startsWith("text/") || type.endsWith("javascript") || type.endsWith("json") ? "UTF-8" : null;
        try {
            InputStream in = getAssets().open("www" + path);
            return new WebResourceResponse(type, encoding, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
        }
    }

    private static String mimeType(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    // ---------- speech ----------

    private void startListening(final String language) {
        runOnUiThread(new Runnable() {
            public void run() {
                if (paused) return;
                if (recognizer == null) {
                    recognizer = SpeechRecognizer.createSpeechRecognizer(MainActivity.this);
                    recognizer.setRecognitionListener(new Listener());
                }
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
                // The recognizer beeps on every restart; the app restarts it after
                // each pause, so keep media quiet while it listens.
                mute(true);
                listening = true;
                recognizer.cancel();
                recognizer.startListening(intent);
            }
        });
    }

    private void stopListening() {
        runOnUiThread(new Runnable() {
            public void run() {
                listening = false;
                if (recognizer != null) recognizer.cancel();
                mute(false);
            }
        });
    }

    private void mute(boolean on) {
        if (audio == null || on == muted) return;
        try {
            audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, on ? AudioManager.ADJUST_MUTE : AudioManager.ADJUST_UNMUTE, 0);
            muted = on;
        } catch (SecurityException ignored) {
            // Some phones refuse while Do Not Disturb is on; the beep is only a nuisance.
        }
    }

    private class Listener implements RecognitionListener {
        public void onReadyForSpeech(Bundle params) {}
        public void onBeginningOfSpeech() {}
        public void onRmsChanged(float rms) {}
        public void onBufferReceived(byte[] buffer) {}
        public void onEndOfSpeech() {}
        public void onEvent(int type, Bundle params) {}

        public void onError(int error) {
            listening = false;
        }

        public void onPartialResults(Bundle results) {
            send(results);
        }

        public void onResults(Bundle results) {
            listening = false;
            send(results);
        }

        private void send(Bundle results) {
            ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (matches == null || matches.isEmpty() || matches.get(0).trim().isEmpty()) return;
            try {
                JSONObject data = new JSONObject();
                data.put("matches", new JSONArray(matches));
                js("__samaali.emit('SpeechRecognition','partialResults'," + data + ")");
            } catch (Exception ignored) {
            }
        }
    }

    // ---------- bridge ----------

    private void js(final String code) {
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript("window.__samaali && " + code, null);
            }
        });
    }

    private class Bridge {
        @JavascriptInterface
        public boolean available() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }

        @JavascriptInterface
        public void requestPermission(final int id) {
            runOnUiThread(new Runnable() {
                public void run() {
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        js("__samaali.resolve(" + id + ",true)");
                    } else {
                        pendingPermission = id;
                        requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, REQUEST_MIC);
                    }
                }
            });
        }

        @JavascriptInterface
        public void start(String language) {
            startListening(language);
        }

        @JavascriptInterface
        public void stop() {
            stopListening();
        }

        @JavascriptInterface
        public boolean isListening() {
            return listening;
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                public void run() {
                    finish();
                }
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode != REQUEST_MIC || pendingPermission < 0) return;
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        js("__samaali.resolve(" + pendingPermission + "," + granted + ")");
        pendingPermission = -1;
    }

    // ---------- lifecycle ----------

    @Override
    protected void onPause() {
        super.onPause();
        // No listening in the background; the page's watchdog restarts it on return.
        paused = true;
        listening = false;
        if (recognizer != null) recognizer.cancel();
        mute(false);
    }

    @Override
    protected void onResume() {
        super.onResume();
        paused = false;
    }

    @Override
    protected void onDestroy() {
        if (recognizer != null) recognizer.destroy();
        recognizer = null;
        mute(false);
        if (web != null) web.destroy();
        web = null;
        super.onDestroy();
    }
}
