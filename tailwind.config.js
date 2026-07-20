/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cms: {
          deep: '#2E3440',
          dark: '#3B4252',
          medium: '#434C5E',
          soft: '#F4F4F6',
          slate: '#6B7280',
          white: '#FFFFFF',
        },
      },
    },
  },
  plugins: [],
}
