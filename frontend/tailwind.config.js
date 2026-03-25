/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          950: '#0d1209',
          900: '#131a11',
          800: '#1a2318',
          700: '#1f2b1c',
          600: '#263522',
          500: '#4a6741',
        },
        amber: {
          DEFAULT: '#d4863a',
          light: '#e8a060',
          dark: '#a86228',
        },
        cream: '#f0e6d3',
        sage: '#8aab80',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        body: ['Lato', 'sans-serif'],
      },
      keyframes: {
        'fade-slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'amber-flash': {
          '0%': { backgroundColor: 'rgba(212, 134, 58, 0)' },
          '50%': { backgroundColor: 'rgba(212, 134, 58, 0.15)' },
          '100%': { backgroundColor: 'rgba(212, 134, 58, 0)' },
        },
      },
      animation: {
        'fade-slide-up': 'fade-slide-up 0.4s ease-out forwards',
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'amber-flash': 'amber-flash 0.6s ease-out',
      },
    },
  },
  plugins: [],
};
