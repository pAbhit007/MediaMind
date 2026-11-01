import { defineConfig } from 'wxt';

// Rendered from public/icon.svg by scripts/make-icons.ts.
const ICONS = { 16: 'icon-16.png', 32: 'icon-32.png', 48: 'icon-48.png', 128: 'icon-128.png' };

export default defineConfig({
  srcDir: 'src',
  publicDir: '../public',
  vite: () => ({
    resolve: {
      // Browser export of onnxruntime-web embeds an unused 21 MB JSEP wasm via new URL(); use the CPU wasm bundle.
      alias: [{ find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' }],
    },
  }),
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'MediaMind',
    description: 'Turn any YouTube video into notes, chapters & flashcards — on your device.',
    permissions: ['sidePanel', 'storage', 'scripting', 'activeTab', 'commands'],
    host_permissions: ['https://www.youtube.com/*'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    icons: ICONS,
    action: { default_title: 'MediaMind', default_icon: ICONS },
    side_panel: { default_path: 'sidepanel.html' },
    commands: {
      'new-note': {
        suggested_key: { default: 'Alt+N' },
        description: 'Add a note at the current video time',
      },
    },
  },
});
