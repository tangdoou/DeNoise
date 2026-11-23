import { build, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const env = loadEnv('production', rootDir, '');

// API keys are NEVER compiled into the extension bundle. Users enter them on the
// options page and they live only in chrome.storage.local. This guard fails the
// build if any VITE_* secret is set, because Vite would inline it into the output.
const LEAKED_ENV_KEYS = Object.keys(env).filter(
  (name) => /^VITE_/i.test(name) && String(env[name] ?? '').trim() !== ''
);
if (LEAKED_ENV_KEYS.length > 0) {
  console.error(
    '✖ Build aborted: these VITE_* variables would be inlined into the public bundle:',
    LEAKED_ENV_KEYS.map((name) => `    - ${name}`).join('\n'),
    '\n  Remove them from .env.local. API keys must be entered on the extension options page.'
  );
  process.exit(1);
}

const envDefine = {
  'import.meta.env.VITE_DENOISE_DEEPSEEK_KEY': "''",
  'import.meta.env.VITE_DENOISE_ZLEAP_KEY': "''"
};

async function buildAll() {
  console.log('1/3 Building Popup & Options UI pages...');
  await build({
    root: rootDir,
    configFile: false,
    plugins: [react(), tailwindcss()],
    define: envDefine,
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(rootDir, 'popup.html'),
          options: resolve(rootDir, 'options.html')
        }
      }
    }
  });

  console.log('2/3 Building Background Service Worker (dist/background.js)...');
  await build({
    root: rootDir,
    configFile: false,
    publicDir: false,
    define: envDefine,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: resolve(rootDir, 'src/background/index.ts'),
        name: 'DeNoiseBackground',
        formats: ['iife'],
        fileName: () => 'background.js'
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true
        }
      }
    }
  });

  console.log('3/3 Building Content Script & Shadow DOM HUD (dist/content.js)...');
  await build({
    root: rootDir,
    configFile: false,
    publicDir: false,
    plugins: [react()],
    define: {
      ...envDefine,
      'process.env.NODE_ENV': JSON.stringify('production')
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      cssCodeSplit: false,
      lib: {
        entry: resolve(rootDir, 'src/content/index.tsx'),
        name: 'DeNoiseContent',
        formats: ['iife'],
        fileName: () => 'content.js'
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true
        }
      }
    }
  });

  console.log('✅ DeNoise Chrome Extension build complete in dist/');
}

/**
 * Post-build guard: the bundle must not contain anything that looks like an API
 * key, whether verbatim or reassembled from small string chunks (["sk-a","bcd"].join("")).
 * That chunking trick is exactly what leaked keys in v1.0.0 / v1.1.0.
 */
function listDistFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      listDistFiles(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function reassembleChunkedStrings(source) {
  const found = new Set();
  // Find every `].join(<empty string>)` and walk backwards over the array literal,
  // collecting short string pieces regardless of quote style.
  const joinCall = /\.join\((?:""|''|``)\)/g;
  let joinMatch;
  while ((joinMatch = joinCall.exec(source)) !== null) {
    const arrayEnd = source.lastIndexOf(']', joinMatch.index);
    if (arrayEnd < 0) continue;
    const arrayStart = source.lastIndexOf('[', arrayEnd);
    if (arrayStart < 0) continue;
    const body = source.slice(arrayStart + 1, arrayEnd);
    const pieces = [];
    let valid = true;
    let cursor = 0;
    while (cursor < body.length) {
      // skip whitespace / commas between pieces
      while (cursor < body.length && /[\s,]/.test(body[cursor])) cursor += 1;
      if (cursor >= body.length) break;
      const quote = body[cursor];
      if (quote !== '"' && quote !== "'" && quote !== '`') {
        valid = false;
        break;
      }
      let end = cursor + 1;
      while (end < body.length && body[end] !== quote) end += 1;
      if (end >= body.length) {
        valid = false;
        break;
      }
      pieces.push(body.slice(cursor + 1, end));
      if (pieces[pieces.length - 1].length > 16) {
        valid = false;
        break;
      }
      cursor = end + 1;
    }
    if (valid && pieces.length >= 3) {
      found.add(pieces.join('').trim());
    }
  }
  return found;
}

const KEY_LIKE = [
  { label: 'OpenAI/DeepSeek-style key', regex: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { label: 'Zleap-style key', regex: /\bzk_[A-Za-z0-9]{16,}\b/g },
  { label: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { label: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/g }
];

function assertNoSecretsInDist() {
  const files = listDistFiles(resolve(rootDir, 'dist')).filter((file) =>
    /\.(?:js|html|json|css|map)$/.test(file)
  );
  const problems = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const candidates = new Set([source, ...reassembleChunkedStrings(source)]);
    for (const { label, regex } of KEY_LIKE) {
      for (const candidate of candidates) {
        if (new RegExp(regex.source).test(candidate)) {
          problems.push(`${file}: ${label}`);
          break;
        }
      }
    }
  }
  if (problems.length > 0) {
    console.error('✖ Build aborted: secret-like strings detected in dist/:');
    for (const problem of problems) console.error(`    - ${problem}`);
    console.error('  Do not ship this build. Rotate the key, then rebuild without it.');
    process.exit(1);
  }
  console.log(`🔒 Secret scan passed (${files.length} files checked, 0 key-like strings).`);
}

buildAll()
  .then(assertNoSecretsInDist)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
