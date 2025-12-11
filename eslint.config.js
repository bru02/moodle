const { defineConfig } = require("eslint/config");
const raycastConfig = require("@raycast/eslint-config");
const pluginQuery = require("@tanstack/eslint-plugin-query");
const reactHooks = require("eslint-plugin-react-hooks");

module.exports = defineConfig([
  ...raycastConfig,
  ...pluginQuery.configs["flat/recommended"],
  reactHooks.configs.flat["recommended-latest"],
]);
