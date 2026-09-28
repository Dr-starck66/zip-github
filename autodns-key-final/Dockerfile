FROM node:22-bookworm-slim
WORKDIR /app
COPY autodns-key-final/package.json ./package.json
COPY autodns-key-final/index.mjs ./index.mjs
EXPOSE 8080
CMD ["npm","start"]
