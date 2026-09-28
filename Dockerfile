FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json index.mjs ./
EXPOSE 8080
CMD ["npm","start"]
