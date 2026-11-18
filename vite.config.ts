import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` builds one self-contained HTML file (for instant sharing as a single page).
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2020',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
}));
