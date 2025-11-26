/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.html",
    "./assets/js/**/*.js",
    "./components/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette - custom colors matching existing design
        primary: {
          DEFAULT: '#9BA9B2',
          dark: '#8899a3',
          light: '#BFC7CA',
          hover: '#8899a3',
        },
        success: {
          DEFAULT: '#8fbc8f',
          light: 'rgba(143, 188, 143, 0.15)',
          hover: '#7aab7a',
          50: '#f0f8f0',
          900: '#1a4d1a',
        },
        warning: {
          DEFAULT: '#d4a574',
          light: 'rgba(212, 165, 116, 0.15)',
          50: '#faf6f0',
          900: '#5c3d1f',
        },
        danger: {
          DEFAULT: '#c88888',
          light: 'rgba(200, 136, 136, 0.15)',
          hover: '#b87777',
          50: '#faf3f3',
          900: '#661111',
        },
        info: {
          DEFAULT: '#89b4c9',
          light: 'rgba(137, 180, 201, 0.15)',
          50: '#f0f6fb',
          900: '#0d3a52',
        },
        // Text colors
        text: {
          primary: '#2E2E2E',
          secondary: '#6B6B6B',
          muted: '#8E8E8E',
          light: '#FAFAFA',
        },
        // Surface/Background colors
        surface: {
          light: '#FAFAFA',
          DEFAULT: '#FFFFFF',
          gray: '#F6F6F6',
          sidebar: '#D9D9D9',
          dark: '#2E2E2E',
        },
        // Border colors
        border: {
          light: '#DCDCDC',
          dark: '#C8C8C8',
        },
      },
      spacing: {
        'sidebar': '280px',
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
        'sm': '0 1px 3px 0 rgba(0, 0, 0, 0.08)',
        'md': '0 2px 8px -1px rgba(0, 0, 0, 0.12)',
        'lg': '0 4px 12px -2px rgba(0, 0, 0, 0.15)',
        'cool': '0 4px 12px rgba(155, 169, 178, 0.2)',
        'logo': '0 20px 40px rgba(0, 0, 0, 0.3)',
        'alert': '0 10px 30px rgba(0, 0, 0, 0.2)',
        'toast': '0 4px 16px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
        'modal': '0 10px 40px rgba(0, 0, 0, 0.3)',
        'inset-sm': 'inset 0 2px 4px rgba(0, 0, 0, 0.1)',
        'sidebar': '2px 0 8px rgba(0, 0, 0, 0.08)',
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
        'sidebar': '280px 1fr',
        'sidebar-collapsed': '70px 1fr',
      },
      gridAutoColumns: {
        'auto-fit': 'minmax(300px, 1fr)',
      },
    },
  },
  plugins: [],
}
