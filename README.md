# سمعلي

تطبيق أندرويد لتسميع حفظيات السادس العلمي بالصوت. الطالب يختار سؤال (تعريف، تعليل...) ويحجي الجواب، والتطبيق يتابعه كلمة كلمة. إذا سكت أو غلط، يطلعله **تلميح صوري** (بطاقة ميم) للمقطع اللي وكف عنده، وإذا بقى واكف تطلع أول كلمتين. بالآخر يعطيه نتيجة ويأشرله الكلمات اللي نساها.

النسخة الحالية: فيزياء، أول سبع فصول (المتسعات، الحث الكهرومغناطيسي، التيار المتناوب، الموجات الكهرومغناطيسية، البصريات الفيزيائية، الفيزياء الحديثة، إلكترونيات الحالة الصلبة)، 474 سؤال من ملزمة كلاميات حسين محمد.

## تنزيل التطبيق

كل تحديث على `main` يبني ملف APK تلقائياً وينشره هنا:
`https://github.com/<owner>/samaali/releases/download/latest/samaali.apk`

افتح الرابط من موبايلك، نزّل الملف وثبّته (اسمح بالتثبيت من مصادر غير معروفة إذا طلب).

## How it works

- `www/` is the whole app: plain HTML/CSS/JS, no bundler. Capacitor wraps it as an Android app.
- `www/match.js` normalizes Arabic (hamza, ta marbuta, diacritics) and walks the heard words against the expected answer with a small lookahead, so ASR mistakes and skipped words don't derail it. Tokens with no Arabic letters (Q, ΔV, E/K) are optional.
- `www/speech.js` uses the Android speech recognizer through `@capacitor-community/speech-recognition`, or Chrome's Web Speech API in a browser. Recognizers stop after a pause, so it restarts itself; each restart is a new segment that is aligned from where the last one ended.
- `www/data/ch*.json` hold the questions (one file per chapter, listed in `www/data/index.json`), split into chunks; each chunk has its meme hint image in `www/memes/`.
- Progress (best score per question) is stored on the device.

## Development

```sh
npm ci
npm test                 # matcher unit tests
node test/ui.test.js .   # drives the web build in Chromium with simulated speech
npx cap sync android     # copy www/ into the Android project
cd android && ./gradlew assembleDebug
```

In a browser, `Samaali.say('...')` in the console feeds text as if it were heard.

Adding a chapter: add `www/data/<chapter>.json` in the same shape, list it in `www/data/index.json`, then render its hint cards with `tools/memes-render.js` (chapters 2 to 7 are generated from `tools/ch<N>_source.py`, which holds each chunk's text, emoji, scene and caption).

The debug APK is signed with `android/app/debug.keystore`, a test key kept in the repo so every CI build installs as an update. A Play Store release needs its own private key.
