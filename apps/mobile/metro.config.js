const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.watchFolders = [...(config.watchFolders || []), `${__dirname}/../..`];

// zustand only ships `import.meta.env` in its ESM build (esm/*.mjs). On web,
// Metro's conditions are ['browser'] and zustand has no `browser` export, so it
// falls back to the `import` (ESM) build, leaking `import.meta` into the classic
// web script -> SyntaxError -> blank page. Native uses the `react-native` (CJS)
// build and is unaffected. Force zustand to the CJS build on web too.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'zustand' || moduleName.startsWith('zustand/'))) {
    return context.resolveRequest(
      {
        ...context,
        unstable_conditionsByPlatform: {
          ...context.unstable_conditionsByPlatform,
          web: ['browser', 'react-native'],
        },
      },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
