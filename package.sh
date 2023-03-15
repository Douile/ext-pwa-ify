#!/bin/sh

set -eu

echo "Building"
rm -rf dist
tsc

echo "Packaging"
zip -9r pwaify.zip manifest.json package.json tsconfig.json src/ dist/ manifests/ _locales/
