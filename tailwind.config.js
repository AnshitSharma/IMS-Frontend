/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.html",
    "./assets/js/**/*.js",
    "./components/**/*.js"
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0D9488',      // Teal 600
          dark: '#0F766E',         // Teal 700
          light: '#14B8A6',        // Teal 500
          lighter: '#5EEAD4',      // Teal 300
          lightest: '#CCFBF1',     // Teal 100
          hover: '#0F766E',
          50: '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488',
          700: '#0F766E',
          800: '#115E59',
          900: '#134E4A',
        },
        success: {
          DEFAULT: '#22C55E',      // Green 500
          light: '#DCFCE7',        // Green 100
          hover: '#16A34A',
          50: '#F0FDF4',
          100: '#DCFCE7',
          500: '#22C55E',
          600: '#16A34A',
          900: '#14532D',
        },
        warning: {
          DEFAULT: '#EAB308',      // Yellow 500
          light: '#FEF9C3',        // Yellow 100
          hover: '#CA8A04',
          50: '#FEFCE8',
          100: '#FEF9C3',
          500: '#EAB308',
          600: '#CA8A04',
          900: '#713F12',
        },
        danger: {
          DEFAULT: '#DC2626',      // Red 600
          light: '#FEE2E2',        // Red 100
          hover: '#B91C1C',
          50: '#FEF2F2',
          100: '#FEE2E2',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
          900: '#7F1D1D',
        },
        info: {
          DEFAULT: '#0EA5E9',      // Sky 500
          light: '#E0F2FE',        // Sky 100
          hover: '#0284C7',
          50: '#F0F9FF',
          100: '#E0F2FE',
          500: '#0EA5E9',
          600: '#0284C7',
          900: '#0C4A6E',
        },
        // Text colors
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          disabled: 'var(--color-text-disabled)',
          light: '#F8FAFC',        // Slate 50
          inverse: 'var(--color-text-inverse)',
        },
        // Surface/Background colors
        surface: {
          main: 'var(--color-surface-main)',
          card: 'var(--color-surface-card)',
          secondary: 'var(--color-surface-secondary)',
          hover: 'var(--color-surface-hover)',
          sidebar: 'var(--color-sidebar-bg)',
          'sidebar-hover': 'var(--color-sidebar-hover)',
          'sidebar-active': '#0D9488', // Primary for active items
        },
        // Border colors
        border: {
          DEFAULT: 'var(--color-border)',
          light: 'var(--color-border-light)',
          dark: 'var(--color-border-dark)',
          focus: '#0D9488',        // Primary for focus states
        },
        // Sidebar specific
        sidebar: {
          bg: 'var(--color-sidebar-bg)',
          hover: 'var(--color-sidebar-hover)',
          active: '#0D9488',       // Primary
          text: 'var(--color-sidebar-text)',
          'text-muted': 'var(--color-sidebar-text-muted)',
        },
        // Chart colors
        chart: {
          primary: '#0D9488',
          secondary: '#14B8A6',
          tertiary: '#5EEAD4',
          grid: '#E2E8F0',
        },
      },
      spacing: {
        'sidebar': '320px',
        'navbar': '70px',
      },
      zIndex: {
        'navbar': '1000',
        'dropdown': '1001',
        'hamburger': '1002',
        'modal': '2000',
        'alert': '3000',
        'loading': '3000',
        'overlay-alt': '9999',
        'toast': '10001',
      },
      animation: {
        'float': 'float 15s infinite ease-in-out',
        'logo-float': 'logoFloat 3s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease forwards',
        'spin-slow': 'spin 1s linear infinite',
        'slide-in': 'slideIn 0.3s ease forwards',
        'modal-slide': 'modalSlideIn 0.3s ease forwards',
        'alert-slide': 'alertSlideIn 0.3s ease forwards',
        'field-slide': 'formFieldSlideIn 0.3s ease forwards',
        'shimmer': 'shimmer 2s infinite',
        'toast-progress': 'toastProgress 4s linear forwards',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'bouncy': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
      backdropBlur: {
        'xs': '1px',
        'sm': '2px',
        'md': '4px',
        'lg': '10px',
        'xl': '20px',
      },
      boxShadow: {
        // Teal & Slate Modern Theme Shadows
        'sm': '0 1px 3px rgba(15, 23, 42, 0.1), 0 1px 2px rgba(15, 23, 42, 0.06)',
        'md': '0 4px 6px -1px rgba(15, 23, 42, 0.1), 0 2px 4px -1px rgba(15, 23, 42, 0.06)',
        'lg': '0 10px 15px -3px rgba(15, 23, 42, 0.1), 0 4px 6px -2px rgba(15, 23, 42, 0.05)',
        'xl': '0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 10px 10px -5px rgba(15, 23, 42, 0.04)',
        'card': '0 1px 3px rgba(15, 23, 42, 0.1), 0 1px 2px rgba(15, 23, 42, 0.06)',
        'dropdown': '0 4px 6px -1px rgba(15, 23, 42, 0.1), 0 2px 4px -1px rgba(15, 23, 42, 0.06)',
        'modal': '0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 10px 10px -5px rgba(15, 23, 42, 0.04)',
        'alert': '0 10px 30px rgba(15, 23, 42, 0.15)',
        'toast': '0 4px 16px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.08)',
        'sidebar': '2px 0 8px rgba(15, 23, 42, 0.08)',
        'inset-sm': 'inset 0 2px 4px rgba(15, 23, 42, 0.1)',
        'focus': '0 0 0 3px rgba(13, 148, 136, 0.2)',
      },
      borderRadius: {
        DEFAULT: '8px',
        'lg': '12px',
      },
      fontSize: {
        'xs': ['12px', { lineHeight: '1.5' }],
        'sm': ['14px', { lineHeight: '1.5' }],
        'base': ['14px', { lineHeight: '1.6' }],
        'lg': ['16px', { lineHeight: '1.6' }],
        'xl': ['20px', { lineHeight: '1.6' }],
        '2xl': ['24px', { lineHeight: '1.2' }],
        '3xl': ['32px', { lineHeight: '1.2' }],
        '4xl': ['40px', { lineHeight: '1.1' }],
      },
      gridTemplateColumns: {
        '10': 'repeat(10, minmax(0, 1fr))',
        'sidebar': '320px 1fr',
        'sidebar-collapsed': '70px 1fr',
      },
      gridAutoColumns: {
        'auto-fit': 'minmax(300px, 1fr)',
      },
    },
  },
  plugins: [],
}
