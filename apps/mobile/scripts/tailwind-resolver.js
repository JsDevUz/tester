// The monorepo also has Tailwind v4 for the web app. NativeWind v4 needs
// Tailwind v3, so force only NativeWind/Metro child processes to resolve the
// mobile workspace's local Tailwind installation.
const Module = require('module');
const path = require('path');

if (!global.__mobileTailwindResolverInstalled) {
  global.__mobileTailwindResolverInstalled = true;
  const originalResolveFilename = Module._resolveFilename;
  const mobileRoot = path.resolve(__dirname, '..');
  const mobileParent = {
    id: 'mobile-tailwind-resolver',
    filename: path.join(mobileRoot, 'package.json'),
    paths: Module._nodeModulePaths(mobileRoot),
  };
  Module._resolveFilename = function resolveMobileTailwind(request, parent, isMain, options) {
    if (request === 'tailwindcss' || request.startsWith('tailwindcss/')) {
      return originalResolveFilename.call(this, request, mobileParent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}
