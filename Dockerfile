FROM node:22-alpine
WORKDIR /app
COPY app.b64 /app/app.b64
ENV NODE_ENV=production
CMD ["sh","-c","node -e \"const fs=require('fs'),z=require('zlib');eval(z.gunzipSync(Buffer.from(fs.readFileSync('/app/app.b64','utf8'),'base64')).toString())\""]
