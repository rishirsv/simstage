import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Preserve licenses for packages whose code is actually present in a bundle.
export async function writeNotices(destination, metafiles) {
  const packages = new Map();
  const inputs = metafiles.flatMap(meta => Object.keys(meta.inputs)).filter(path => path.includes("node_modules/"));
  inputs.push("node_modules/tailwindcss/index.css", "node_modules/tw-animate-css/dist/tw-animate.css");
  for (const input of inputs) {
    let directory = dirname(resolve(input));
    while (directory !== dirname(directory)) {
      let metadata;
      try { metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8")); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (metadata?.name && metadata.version) {
        packages.set(`${metadata.name}@${metadata.version}`, directory);
        break;
      }
      directory = dirname(directory);
    }
  }
  const sections = [];
  for (const [name, directory] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const files = (await readdir(directory)).filter(file => /^(license|licence|notice|copying)([.-]|$)/i.test(file)).sort();
    if (!files.length && name === "react-remove-scroll-bar@2.3.8") {
      // This release omitted its MIT license; retain the maintainer's license.
      // https://github.com/theKashey/react-remove-scroll-bar/blob/master/LICENSE
      sections.push(`${name}\n\n${await readFile("third_party/react-remove-scroll-bar/LICENSE", "utf8")}`);
      continue;
    }
    if (!files.length) throw new Error(`Missing bundled dependency license: ${name}`);
    const licenses = await Promise.all(files.map(async file => `${file}\n\n${await readFile(join(directory, file), "utf8")}`));
    sections.push(`${name}\n${"=".repeat(name.length)}\n\n${licenses.join("\n\n")}`);
  }
  sections.push(`shadcn@4.21.0 (vendored stylesheet and generated UI components)\n\n${await readFile("src/styles/shadcn.LICENSE", "utf8")}`);
  await writeFile(join(destination, "THIRD_PARTY_NOTICES.txt"), sections.join("\n\n----------------------------------------\n\n") + "\n");
  for (const file of ["LICENSE", "NOTICE"]) await cp(file, join(destination, file));
}
