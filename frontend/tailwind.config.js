/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wa: {
          teal: '#00a884',
          dark: '#111b21',
          darker: '#202c33',
          panel: '#f0f2f5',
          accent: '#008069'
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'chat-pattern': "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 10h10v10H10V10z' fill='%23d1d7db' fill-opacity='0.4'/%3E%3C/svg%3E\")",
      }
    },
  },
  plugins: [],
}