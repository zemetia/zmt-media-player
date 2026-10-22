/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        player: {
          bg: '#0a0d14',
          surface: '#111726',
          panel: '#161f33',
          border: '#23304b',
          accent: '#06b6d4', // Cyan accent
          accentHover: '#0891b2',
          glow: 'rgba(6, 182, 212, 0.35)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
