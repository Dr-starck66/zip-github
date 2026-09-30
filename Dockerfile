FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

COPY astra-crawl/package.json ./
RUN npm install --omit=dev

COPY astra-crawl/server.mjs ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.mjs"]
