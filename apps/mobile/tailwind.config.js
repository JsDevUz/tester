/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {extend: {colors: {brand: '#6366f1', ink: '#111827', canvas: '#f8fafc'}}},
  plugins: [],
};
