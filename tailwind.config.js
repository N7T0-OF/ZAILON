/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: 'var(--zailon-accent)',
          dim: 'color-mix(in srgb, var(--zailon-accent) 56%, #64706e)',
          glow: 'var(--zailon-accent-muted)',
          bright: 'var(--zailon-accent-hover)',
          light: 'var(--zailon-accent-hover)',
        },
        ink: {
          50: '#29302f',
          100: '#1d2322',
          200: '#141817',
          300: '#0f1212',
          400: '#090b0b',
          500: '#050606',
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
          '0%, 100%': { boxShadow: '0 0 8px rgba(219,232,229,0.16)' },
          '50%': { boxShadow: '0 0 20px rgba(219,232,229,0.30)' },
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
