const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, "../..");

config.projectRoot = workspaceRoot;
config.watchFolders = [workspaceRoot];
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@/assets/")) {
    return context.resolveRequest(
      context,
      path.join(__dirname, moduleName.slice(2)),
      platform,
    );
  }

  if (moduleName.startsWith("@/")) {
    return context.resolveRequest(
      context,
      path.join(__dirname, "src", moduleName.slice(2)),
      platform,
    );
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true,
  },
});

module.exports = config;
