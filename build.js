const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const source = path.join(__dirname, "site.b64");
const output = path.join(__dirname, "public");

if (!fs.existsSync(source)) {
  throw new Error("site.b64 is missing");
}

const encoded = fs.readFileSync(source, "utf8").replace(/\s+/g, "");
const archive = Buffer.from(encoded, "base64");

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const zip = new AdmZip(archive);
zip.extractAllTo(output, true);

const homepage = path.join(output, "index.html");
if (!fs.existsSync(homepage)) {
  throw new Error("Build verification failed: public/index.html was not extracted");
}

console.log("FREEHOTELS_BUILD_OK", fs.statSync(homepage).size);
