/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#e8b84b',
          dim: '#a07c28',
          glow: 'rgba(232,184,75,0.15)',
          bright: '#f5d070',
        },
        ink: {
          50: '#2a2940',
          100: '#1e1d2e',
          200: '#14131f',
          300: '#0d0c17',
          400: '#080710',
          500: '#04040b',
        },
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-gold': 'pulse-gold 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
      },
      keyframes: {
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(232,184,75,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(232,184,75,0.6)' },
        },
        'slide-up': {
          from: { transform: 'translateY(8px)', opacity: 0 },
          to: { transform: 'translateY(0)', opacity: 1 },
        },
        'fade-in': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
}
