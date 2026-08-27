/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  // Without this, `hover:scale-[1.01]` on a button fires on touch too, and iOS
  // keeps the :hover state on the last-tapped element - so the button stayed
  // scaled up after the tap and read as the page zooming.
  future: {
    hoverOnlyWhenSupported: true,
  },
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: '#06b6d4',
        secondary: '#10b981',
        danger: '#ef4444',
      },
    },
  },
  plugins: [],
}
