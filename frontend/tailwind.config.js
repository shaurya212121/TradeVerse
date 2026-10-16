/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#07080B',
        background: '#07080B',
        panel: '#0E1117',
        surface: '#0E1117',
        border: 'rgba(255, 255, 255, 0.08)',
        'border-bright': 'rgba(255, 255, 255, 0.15)',
        'text-primary': '#F1F5F9',
        'text-muted': '#64748B',
        'text-dim': '#475569',
        'bull-green': '#00F090',
        'bear-red': '#FF3B56',
        cyan: '#38BDF8',
        accent: '#38BDF8',
        amber: '#F59E0B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      }
    },
  },
  plugins: [],
}

