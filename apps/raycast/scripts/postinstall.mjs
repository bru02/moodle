/**
 * ray publish/build expects typescript and @raycast/api in ./node_modules,
 * but bun workspaces hoist everything to the monorepo root.
 * This script symlinks the packages ray needs into the local node_modules.
 */
import { existsSync, mkdirSync, symlinkSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "..", "..", "..", "node_modules");

mkdirSync("node_modules/.bin", { recursive: true });

for (const name of ["typescript", "@raycast"]) {
  const local = `node_modules/${name}`;
  if (!existsSync(local)) {
    symlinkSync(`${root}/${name}`, local);
  }
}

for (const [bin, target] of [
  ["tsc", "typescript/bin/tsc"],
  ["tsserver", "typescript/bin/tsserver"],
]) {
  const local = `node_modules/.bin/${bin}`;
  if (!existsSync(local)) {
    symlinkSync(`${root}/${target}`, local);
  }
}
