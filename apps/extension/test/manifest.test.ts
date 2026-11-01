import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifest = JSON.parse(
  readFileSync(resolve(__dirname, '../.output/chrome-mv3/manifest.json'), 'utf8'),
);

describe('built manifest', () => {
  it('has exact permissions', () => {
    expect([...manifest.permissions].sort()).toEqual(
      ['activeTab', 'commands', 'scripting', 'sidePanel', 'storage'],
    );
  });
  it('has exact host permissions', () => {
    expect(manifest.host_permissions).toEqual(['https://www.youtube.com/*']);
  });
  it('has the required CSP', () => {
    expect(manifest.content_security_policy.extension_pages).toBe(
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    );
  });
  it('declares the side panel', () => {
    expect(manifest.side_panel.default_path).toBe('sidepanel.html');
  });
  it('declares the four brain icon sizes for the extension and the toolbar action', () => {
    const icons = { 16: 'icon-16.png', 32: 'icon-32.png', 48: 'icon-48.png', 128: 'icon-128.png' };
    expect(manifest.icons).toEqual(icons);
    expect(manifest.action.default_icon).toEqual(icons);
  });
  it('declares Alt+N new-note command', () => {
    expect(manifest.commands['new-note'].suggested_key.default).toBe('Alt+N');
  });
});
