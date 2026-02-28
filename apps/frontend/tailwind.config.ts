import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        'sidebar-bg': 'var(--sidebar-bg)',
        surface: 'var(--surface)',
        'surface-elevated': 'var(--surface-elevated)',
        'surface-tertiary': 'var(--surface-tertiary)',
        foreground: 'var(--foreground)',
        muted: 'var(--background-subtle)',
        'muted-foreground': 'var(--foreground-muted)',
        'foreground-muted': 'var(--foreground-muted)',
        'foreground-subtle': 'var(--foreground-subtle)',
        'foreground-faint': 'var(--foreground-faint)',
        border: 'var(--border)',
        'border-subtle': 'var(--border-subtle)',
        accent: 'var(--accent-primary)',
        'accent-hover': 'var(--accent-primary-hover)',
        'accent-green': 'var(--accent-green)',
        'accent-red': 'var(--accent-red)',
        'menu-bg': 'var(--menu-background)',
        'menu-border': 'var(--menu-border-color)',
        'modal-bg': 'var(--modal-background)',
        'modal-border': 'var(--modal-border-color)',
        'nav-item': 'var(--nav-item-color)',
        'nav-item-hover': 'var(--nav-item-color-hover)',
        'nav-item-active': 'var(--nav-item-color-active)',
        'nav-bg-hover': 'var(--nav-item-background-hover)',
        'nav-bg-selected': 'var(--nav-item-background-selected)',
        'tab-container': 'var(--tab-container-background)',
        'tab-active': 'var(--tab-background-active)',
        'tab-text': 'var(--tab-text-color)',
        'tab-text-active': 'var(--tab-text-color-active)',
        'graph-text': 'var(--graph-text)',
        'graph-line': 'var(--graph-line)',
        'graph-node': 'var(--graph-node)',
        'graph-node-unresolved': 'var(--graph-node-unresolved)',
        'graph-node-focused': 'var(--graph-node-focused)',
      },
      keyframes: {
        slideIn: {
          from: { opacity: '0', transform: 'scale(0.95) translateY(-10px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        menuFadeIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'slide-in': 'slideIn 0.15s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'menu-fade-in': 'menuFadeIn 0.15s ease-out',
      },
      zIndex: {
        'panel': '10',
        'popover': '50',
        'overlay': '100',
        'modal': '200',
        'context-menu': '300',
        'confirm': '400',
        'toast': '500',
        'workspace-modal': '1000',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};

export default config;
