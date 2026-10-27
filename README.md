# سمعلي

تطبيق أندرويد لتسميع حفظيات السادس العلمي بالصوت. تفتحه تطلعلك شاشة فاضية: تحجي من حفظك والتطبيق يسمعك ويعرف لحاله شنو دتسمّع (من الجواب أو من السؤال إذا كلته)، ويتابعك كلمة كلمة. إذا وكفت وسكتت، يطلعلك **تلميح ميم** مع جملة تضحك؛ إذا بقيت واكف تطلع أول كلمتين، وبعدها المقطع كله حتى تقراه. من تخلص جواب يفرحلك ويروح للي بعده.

النسخة الحالية: فيزياء، كل فصول الملزمة التسعة (المتسعات، الحث الكهرومغناطيسي، التيار المتناوب، الموجات الكهرومغناطيسية، البصريات الفيزيائية، الفيزياء الحديثة، إلكترونيات الحالة الصلبة، الأطياف الذرية والليزر، الفيزياء النووية)، 590 سؤال من ملزمة كلاميات حسين محمد.

## تنزيل التطبيق

**آيفون:** افتح رابط التطبيق بـ Safari، دوس على الشاشة واسمح بالمايك. حتى يصير أيقونة بالشاشة الرئيسية: زر المشاركة ← إضافة إلى الشاشة الرئيسية. لازم يكون الإملاء (Dictation) مفعّل من الإعدادات.

**أندرويد:** `tools/build-apk.sh` يبني ملف `build/samaali.apk`. انقل الملف لموبايلك، افتحه وثبّته (اسمح بالتثبيت من مصادر غير معروفة إذا طلب). التطبيق يحتاج خدمة التعرف على الصوت مال Google بالموبايل.

## How it works

- `www/` is the whole app: plain HTML/CSS/JS, no bundler. It is one empty screen; hints, cheers and mic notices are the only things that appear on it.
- `www/match.js` normalizes Arabic (hamza, ta marbuta, diacritics) and walks the heard words against the expected answer with a small lookahead, so ASR mistakes and skipped words don't derail it. Tokens with no Arabic letters (Q, ΔV, E/K) are optional. `locate()` finds which item the student is reciting when their words stop fitting the current one: it tries every place in every answer, and the prompt if they opened with a question word.
- `www/speech.js` uses the Android speech recognizer, or the Web Speech API in a browser (Chrome, or Safari on the iPhone, which needs a tap before it listens and falls back from `ar-IQ` to `ar-SA`). Recognizers stop after a pause, so it restarts itself; each restart is a new segment that is aligned from where the last one ended.
- `native/` is a small WebView shell (one Java file) that serves `www/` from a fake https origin and exposes the Android recognizer as `window.SamaaliNative`; `www/native-shim.js` wraps it in the Capacitor plugin API that `speech.js` already uses. `tools/build-apk.sh` builds it with `aapt`, `dx` and `apksigner` from Ubuntu packages, no Gradle. The Capacitor project in `android/` still works the same way if you build with Gradle instead.
- `www/data/ch*.json` hold the questions (one file per chapter, listed in `www/data/index.json`), split into chunks; each chunk has its meme hint image in `www/memes/`.
- Progress (best score per question) is stored on the device.

## Development

```sh
npm ci
npm test                          # matcher unit tests
node test/ui.test.js .            # drives the web build in Chromium with a fake recognizer
node test/native-shim.test.js     # the same, through a fake of the Android shell's bridge
sudo apt-get install android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner
./tools/build-apk.sh              # build/samaali.apk
./tools/publish-web.sh            # www/ to the gh-pages branch (the iPhone link)
```

In a browser, `Samaali.say('...')` in the console feeds text as if it were heard, and `Samaali.state()` shows which item it is following.

Adding a chapter: add `www/data/<chapter>.json` in the same shape, list it in `www/data/index.json`, then render its hint cards with `tools/memes-render.js` (chapters 2 to 9 are generated from `tools/ch<N>_source.py`, which holds each chunk's text, emoji, scene and caption).

`tools/build-apk.sh` signs with `build/samaali.keystore`, made on the first build and kept out of git. Phones only install an update signed with the same key, so keep that file (a copy lives with the project files). A Play Store release needs its own private key.
