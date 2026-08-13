/** @type {import('tailwindcss').Config} */
module.exports = {
  // 'class' (not 'media') so useThemeStore's light/dark/system toggle can
  // drive NativeWind via colorScheme.set() - 'media' would only ever follow
  // the OS setting and break manual overrides.
  darkMode: 'class',
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: '#6366f1',
        ink: '#111827',
        canvas: '#f1f5f9',
        // Dark palette mirrors apps/frontend/src/index.css's
        // :root[data-theme="dark"] tokens, so both apps read the same way.
        'dark-canvas': '#1b1c22',
        'dark-surface': '#30313a',
        'dark-surface-2': '#24252c',
        'dark-card': '#20242c',
        'dark-ink': '#e8eaed',
        'dark-border': '#454752',
        'dark-muted': '#a4a7b2',
        'dark-focus': '#818cf8',
      },
    },
  },
  plugins: [],
};
