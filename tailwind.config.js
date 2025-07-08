/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'baseball-green': '#0d5016',
        'diamond-brown': '#8b4513',
        'home-team': '#003366',
        'away-team': '#cc0000',
      },
    },
  },
  plugins: [],
}