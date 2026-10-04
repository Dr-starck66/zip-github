FROM nginx:1.27-alpine
RUN apk add --no-cache unzip
COPY site.b64 /tmp/site.b64
COPY railway-nginx.conf /tmp/railway-nginx.conf
COPY legacy/ /tmp/legacy/
RUN base64 -d /tmp/site.b64 > /tmp/site.zip \
 && rm -rf /usr/share/nginx/html/* \
 && unzip -oq /tmp/site.zip -d /usr/share/nginx/html \
 && cp -R /tmp/legacy/. /usr/share/nginx/html/ \
 && cp /tmp/railway-nginx.conf /etc/nginx/conf.d/default.conf \
 && printf '\nSitemap: https://freehotels.info/sitemap-legacy.xml\n' >> /usr/share/nginx/html/robots.txt \
 && rm -rf /tmp/site.b64 /tmp/site.zip /tmp/railway-nginx.conf /tmp/legacy \
    /usr/share/nginx/html/Dockerfile \
    /usr/share/nginx/html/railway.toml \
    /usr/share/nginx/html/nginx.conf \
    /usr/share/nginx/html/vercel.json
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/health || exit 1
