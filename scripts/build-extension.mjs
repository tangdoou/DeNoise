import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

async function buildAll() {
  console.log('1/3 Building Popup & Options UI pages...');
  await build({
    root: rootDir,
    configFile: false,
    plugins: [react(), tailwindcss()],
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
