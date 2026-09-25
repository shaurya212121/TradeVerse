/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0c',
        surface: '#121216',
        border: '#242429',
        'text-primary': '#e4e4e7',
        'text-muted': '#8a8a94',
        'bull-green': '#22c55e',
        'bear-red': '#ef4444',
        accent: '#4f8cff'
      },
      fontFamily: {
        sans: ['Inter', 'IBM Plex Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'monospace']
      }
    },
  },
  plugins: [],
}
