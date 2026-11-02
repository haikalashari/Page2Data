import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Page2Data',
    description:
      'Extract webpage tables into clean, structured datasets. Local-first, AI-assisted, bring your own key.',
    version: '0.1.0',
    permissions: ['storage', 'sidePanel', 'activeTab', 'scripting'],
    host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: 'Open Page2Data',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
