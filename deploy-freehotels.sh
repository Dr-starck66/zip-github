#!/usr/bin/env sh
set -eu
rm -rf site-public site.zip
mkdir -p site-public
base64 -d freehotels-site.zip.b64 > site.zip
unzip -q site.zip -d site-public
