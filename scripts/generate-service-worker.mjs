import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const template = await readFile(new URL("src/service-worker.js", root), "utf8");
await writeFile(new URL("public/sw.js", root), template.replace("__BUILD_VERSION__", randomUUID()));
console.log("Generated a fresh production service worker.");
