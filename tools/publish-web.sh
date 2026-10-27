#!/usr/bin/env bash
# Publishes www/ to the gh-pages branch, which GitHub Pages serves. That link
# is how the app runs on an iPhone: opened in Safari, which has its own
# speech recognizer, instead of an installed APK.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
DIR=$ROOT/build/pages
REMOTE=$(git -C "$ROOT" remote get-url origin)
SOURCE=$(git -C "$ROOT" rev-parse --short HEAD)

rm -rf "$DIR"
mkdir -p "$DIR"
cp -r "$ROOT/www/." "$DIR/"
touch "$DIR/.nojekyll" # serve the files as they are, no Jekyll build

cd "$DIR"
git init -q -b gh-pages
git add -A
git commit -q -m "Publish www from $SOURCE"
git push -f "$REMOTE" gh-pages
echo "published $SOURCE to gh-pages"
