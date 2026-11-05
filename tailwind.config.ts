import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bakery: {
          50: '#fef7ee',
          100: '#fdedd6',
          200: '#fad7ac',
          300: '#f6ba77',
          400: '#f19340',
          500: '#ed751a',
          600: '#de5b10',
          700: '#b84310',
          800: '#933615',
          900: '#772f14',
          950: '#401508',
        },
        lz: {
          linen: '#F7F5F0', oat: '#EFECE6', sand: '#E7E2D8',
          'sage-dark': '#244936', sage: '#2D5A43', 'sage-medium': '#3C7356',
          'sage-light': '#E9EFEA', 'sage-tint': '#D5E3D8',
          amber: '#D9822B', 'amber-warm': '#E8973D', 'amber-light': '#FAF1E6',
          charcoal: '#1F2421', 'charcoal-muted': '#545B56',
          surface: '#FFFFFF', border: '#E2DDD3',
          'danger-surface': '#FDEAE8', danger: '#C03728', 'danger-border': '#F8C8C3',
        },
      },
      fontFamily: {
        'lz-sans': ['var(--font-lz-sans)', 'system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        'lz-display': ['var(--font-lz-display)', 'system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        'lz-soft': '0 2px 10px rgba(31, 36, 33, 0.04)',
        'lz-card': '0 3px 14px rgba(31, 36, 33, 0.05)',
        'lz-float': '0 8px 30px rgba(45, 90, 67, 0.12)',
      },
      keyframes: {
        'lz-onda': {
          '0%': { transform: 'scale(0)', opacity: '0.45' },
          '100%': { transform: 'scale(1)', opacity: '0' },
        },
        'lz-sacudir': {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
        'lz-aparecer': {
          '0%': { transform: 'scale(0.4)', opacity: '0' },
          '70%': { transform: 'scale(1.15)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'lz-moneda': {
          '0%': { transform: 'translate(0, 0) scale(0.6)', opacity: '0' },
          '25%': { opacity: '1' },
          '100%': { transform: 'translate(var(--lz-dx, 0px), -30px) scale(1)', opacity: '0' },
        },
      },
      animation: {
        'lz-onda': 'lz-onda 600ms ease-out forwards',
        'lz-sacudir': 'lz-sacudir 400ms ease-in-out',
        'lz-aparecer': 'lz-aparecer 350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'lz-moneda': 'lz-moneda 750ms ease-out forwards',
      },
    },
  },
  plugins: [],
};

export default config;
