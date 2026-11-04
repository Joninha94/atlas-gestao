/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Identidade Produtiva: verde-petróleo sóbrio + âmbar para alertas
        brand: { 50: '#eefaf8', 100: '#d5f2ee', 200: '#ade4dc', 300: '#78cfc4', 400: '#43b2a6', 500: '#28968b', 600: '#1d7871', 700: '#1b605b', 800: '#1a4e4b', 900: '#19413f', 950: '#082625' },
        ink: { DEFAULT: '#0f1f1e', soft: '#3b4a49', muted: '#6b7a79' },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(15,31,30,.06), 0 1px 3px rgba(15,31,30,.04)' },
    },
  },
  plugins: [],
};
