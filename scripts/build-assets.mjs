import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const sourceDir = new URL("../pages-user/", import.meta.url);
const outputDir = new URL("../dist/pages-user/", import.meta.url);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const html = await readFile(new URL("index.html", sourceDir), "utf8");
await writeFile(new URL("index.html", outputDir), minifyHtml(html));

await build({
  entryPoints: [fileURLToPath(new URL("app.js", sourceDir))],
  outfile: fileURLToPath(new URL("app.js", outputDir)),
  bundle: true,
  minify: true,
  legalComments: "none",
  platform: "browser",
  format: "iife",
});

await build({
  entryPoints: [fileURLToPath(new URL("styles.css", sourceDir))],
  outfile: fileURLToPath(new URL("styles.css", outputDir)),
  bundle: true,
  minify: true,
  legalComments: "none",
});

function minifyHtml(value) {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .trim();
}
