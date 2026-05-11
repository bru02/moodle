import { defineConfig } from "eslint/config";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const raycastConfig = require("@raycast/eslint-config");

export default defineConfig([...raycastConfig]);
