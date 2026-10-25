#!/usr/bin/env bash
# Builds build/samaali.apk without Gradle or the full Android SDK: a small
# WebView shell (native/) around www/. Needs the Ubuntu/Debian packages
#   android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner
# and a JDK. The signing key is build/samaali.keystore (made on first run);
# keep it, because phones only accept updates signed with the same key.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=$ROOT/build
WORK=$OUT/apk-work
ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
KEYSTORE=${KEYSTORE:-$OUT/samaali.keystore}
KEY_PASS=${KEY_PASS:-samaali-sideload}

rm -rf "$WORK"
mkdir -p "$WORK/classes" "$WORK/assets" "$WORK/res" "$WORK/dex"

# Launcher icons rendered by tools/icons.js for the Capacitor project.
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  mkdir -p "$WORK/res/mipmap-$d"
  cp "$ROOT/android/app/src/main/res/mipmap-$d/ic_launcher.png" "$WORK/res/mipmap-$d/"
done
cp -r "$ROOT/www" "$WORK/assets/www"

javac -source 8 -target 8 -Xlint:-options -bootclasspath "$ANDROID_JAR" \
  -d "$WORK/classes" $(find "$ROOT/native/src" -name '*.java')
dalvik-exchange --dex --output="$WORK/dex/classes.dex" "$WORK/classes"

# Media is already compressed; resources.arsc must stay uncompressed for Android 11+.
aapt package -f -M "$ROOT/native/AndroidManifest.xml" -S "$WORK/res" -A "$WORK/assets" \
  -I "$ANDROID_JAR" -F "$WORK/unsigned.apk" -0 arsc -0 webp -0 png -0 woff2
(cd "$WORK/dex" && aapt add "$WORK/unsigned.apk" classes.dex > /dev/null)
zipalign -f -p 4 "$WORK/unsigned.apk" "$WORK/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -alias samaali -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KEY_PASS" -keypass "$KEY_PASS" -dname "CN=Samaali" 2> /dev/null
fi
apksigner sign --ks "$KEYSTORE" --ks-key-alias samaali --ks-pass "pass:$KEY_PASS" --key-pass "pass:$KEY_PASS" \
  --out "$OUT/samaali.apk" "$WORK/aligned.apk"
apksigner verify "$OUT/samaali.apk"
echo "built $OUT/samaali.apk"
