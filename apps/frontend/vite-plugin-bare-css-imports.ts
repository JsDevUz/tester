import { createRequire } from 'node:module';
import { dirname, relative } from 'node:path';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);

// Ba'zi paketlar (masalan @blocknote/mantine) CSS ichida
// `@import url("@scope/pkg/path/to/file.css");` ko'rinishida bare-specifier
// ishlatadi. Bu shakl webpack'ning css-loader'i uchun mo'ljallangan va
// Vite/postcss-import npm paket nomini "url()" ichida hal qila olmaydi
// (build va dev-server'da ENOENT xatosi beradi). Bu plugin shunday
// importlarni CSS fayl yuklanganda haqiqiy nisbiy yo'lga almashtiradi.
const BARE_IMPORT = /@import\s+url\((["'])(@[^"')]+|[a-z][^"')]*)\1\);?/g;

export function bareCssImportsPlugin(): Plugin {
  return {
    name: 'bare-css-imports',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.css') || !id.includes('node_modules')) return null;
      if (!BARE_IMPORT.test(code)) return null;
      BARE_IMPORT.lastIndex = 0;

      const fromDir = dirname(id);
      const transformed = code.replace(BARE_IMPORT, (match, _quote, specifier) => {
        try {
          const resolved = require.resolve(specifier);
          let relPath = relative(fromDir, resolved).replace(/\\/g, '/');
          if (!relPath.startsWith('.')) relPath = `./${relPath}`;
          return `@import "${relPath}";`;
        } catch {
          return match;
        }
      });

      return { code: transformed, map: null };
    },
  };
}
