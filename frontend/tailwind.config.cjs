/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "ink-900": "#102a43",
        "ink-700": "#243b53",
        "teal-500": "#14b8a6",
        "amber-500": "#f59e0b",
        "rose-500": "#f43f5e"
      }
    }
  },
  plugins: []
};
