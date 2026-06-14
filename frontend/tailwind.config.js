/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0F172A',      # Slate 900
          card: '#1E293B',    # Slate 800
          border: '#334155',  # Slate 700
          accent: '#3B82F6',  # Blue 500
        }
      }
    },
  },
  plugins: [],
}
