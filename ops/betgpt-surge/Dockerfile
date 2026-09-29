FROM node:22-bookworm
WORKDIR /app
COPY ops/betgpt-surge/package.json ./
RUN npm install --omit=dev
COPY ops/betgpt-surge/publisher.mjs ./
ENV NODE_ENV=production
CMD ["npm","start"]
