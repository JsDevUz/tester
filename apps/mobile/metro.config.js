const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');
const tailwindResolver = path.resolve(__dirname, 'scripts/tailwind-resolver.js');
require(tailwindResolver);
process.env.NODE_OPTIONS = [
  `--require=${tailwindResolver}`,
  process.env.NODE_OPTIONS,
].filter(Boolean).join(' ');
const { withNativeWind } = require('nativewind/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const workspaceRoot = path.resolve(__dirname, '../..');
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
  },
};

module.exports = withNativeWind(mergeConfig(getDefaultConfig(__dirname), config), {
  input: path.resolve(__dirname, 'src/styles/global.css'),
  configPath: path.resolve(__dirname, 'tailwind.config.js'),
});
