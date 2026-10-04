FROM python:3.12-alpine AS builder
RUN apk add --no-cache unzip
COPY site.b64 /tmp/site.b64
COPY legacy/ /tmp/legacy/
RUN mkdir -p /site /site/de /site/en \
 && base64 -d /tmp/site.b64 > /tmp/site.zip \
 && unzip -oq /tmp/site.zip -d /site \
 && if [ -d /tmp/legacy/de ]; then cp -R /tmp/legacy/de/. /site/de/; fi \
 && if [ -d /tmp/legacy/en ]; then cp -R /tmp/legacy/en/. /site/en/; fi \
 && python3 /tmp/legacy/generate_corpus.py /site /tmp/legacy \
 && rm -f /site/Dockerfile /site/railway.toml /site/nginx.conf /site/vercel.json

FROM nginx:1.27-alpine
COPY --from=builder /site/ /usr/share/nginx/html/
COPY railway-nginx.conf /etc/nginx/conf.d/default.conf

# ASTRA BRICK PROOF GATE: test config, verified historic routes, route-family
# recovery, direct historic 200s, unknown-city 404s, sitemap and HTTPS canonical.
RUN apk add --no-cache curl \
 && nginx -t \
 && nginx \
 && sleep 0.3 \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/leipzig/)" = "200" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/leipzig/list.html)" = "301" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/halle_an_der_saale/8434)" = "301" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/krakau/18541)" = "301" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/mykonos/24532)" = "301" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/en/leipzig/329.html)" = "301" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/en/napoli/17914)" = "301" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/berlin/45.html)" = "200" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/koeln/133.html)" = "200" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/frankfurt/14.html)" = "200" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/en/berlin/45.html)" = "200" \
 && for u in /de/paris/list.html /de/paris/999999 /de/paris/999999.html /de/paris/999999/index.html; do test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1$u)" = "301"; done \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/paris/)" = "200" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/definitely-not-a-restored-city/12345)" = "404" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/sitemap-legacy.xml)" = "200" \
 && test "$(curl -sS -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/sitemap-legacy.xml | grep -c '<url>')" -ge 80 \
 && curl -sS -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/sitemap-legacy.xml | grep -q 'https://freehotels.info/de/berlin/guenstige-hotels/' \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/berlin/guenstige-hotels/)" = "200" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/muenchen/flughafen/)" = "200" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/en/)" = "200" \
 && curl -sS -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/dortmund/ | grep -q 'Signal Iduna Park' \
 && curl -sS -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/bonn/ | grep -q 'Bundesviertel' \
 && curl -sS -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/bremen/ | grep -q 'Überseestadt' \
 && curl -sS -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/dresden/ | grep -q 'Neustadt' \
 && curl -sS -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/essen/ | grep -q 'Rüttenscheid' \
 && curl -sS -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/heidelberg/ | grep -q 'Neuenheim' \
 && curl -sS -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/nuernberg/ | grep -q 'Messe Nürnberg' \
 && curl -sS -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/de/stuttgart/ | grep -q 'Bad Cannstatt' \
 && curl -sSI -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/ | grep -qi 'Strict-Transport-Security' \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: freehotels.info' -H 'X-Forwarded-Proto: http' http://127.0.0.1/)" = "301" \
 && test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: www.freehotels.info' -H 'X-Forwarded-Proto: https' http://127.0.0.1/)" = "301" \
 && nginx -s quit \
 && apk del curl

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/health || exit 1
