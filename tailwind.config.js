/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: '#7c3aed',
        secondary: '#10b981',
        danger: '#ef4444',
      },
    },
  },
  plugins: [],
}
