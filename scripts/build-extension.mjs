import { build, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const env = loadEnv('production', rootDir, '');
const deepseekKey = env.VITE_DENOISE_DEEPSEEK_KEY ?? '';
const zleapKey = env.VITE_DENOISE_ZLEAP_KEY ?? '';

function toSecretExpression(value) {
  if (!value) return "''";
  const chunks = [];
  for (let i = 0; i < value.length; i += 4) {
    chunks.push(JSON.stringify(value.slice(i, i + 4)));
  }
  return `[${chunks.join(', ')}].join('')`;
}

const envDefine = {
  'import.meta.env.VITE_DENOISE_DEEPSEEK_KEY': toSecretExpression(deepseekKey),
  'import.meta.env.VITE_DENOISE_ZLEAP_KEY': toSecretExpression(zleapKey)
};

if (!deepseekKey) {
  console.warn(
    '⚠️  VITE_DENOISE_DEEPSEEK_KEY is not set. The built-in DeepSeek provider will have an empty API key.'
  );
}

if (!zleapKey) {
  console.warn(
    '⚠️  VITE_DENOISE_ZLEAP_KEY is not set. The built-in Zleap Zev-1 provider will have an empty API key.'
  );
}

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

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
