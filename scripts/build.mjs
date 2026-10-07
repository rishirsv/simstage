import { mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { writeNotices } from "./licenses.mjs";

await import("./sync-version.mjs");
const destination = "packages/sim-stage-mcp/dist";
await mkdir(destination, { recursive: true });
await import("./build-native.mjs");
const app = await build({ entryPoints: ["src/app.ts"], outfile: `${destination}/app.js`, bundle: true, legalComments: "external", metafile: true, format: "esm", platform: "browser", target: "es2022", minify: true, define: { "process.env.NODE_ENV": '"production"' } });
const stylesheet = await postcss([tailwindcss({ optimize: true })]).process(await readFile("src/app.css", "utf8"), { from: "src/app.css", to: `${destination}/app.css` });
stylesheet.root.walkComments(comment => comment.remove());
await writeFile(`${destination}/app.css`, stylesheet.root.toString());
const server = await build({ entryPoints: ["src/server.ts"], outfile: `${destination}/server.js`, bundle: true, legalComments: "external", metafile: true, format: "esm", platform: "node", target: "es2022", packages: "bundle", banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' } });
await writeNotices(destination, [app.metafile, server.metafile]);
