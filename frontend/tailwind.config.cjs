/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        nf: {
          bg: "#0b0e14",
          panel: "#161b22",
          panel2: "#1c2330",
          line: "#273244",
          text: "#e8eef9",
          muted: "#8b9bb4",
          accent: "#7c5cff",
          accent2: "#3b82f6",
          teal: "#22d3ee",
          green: "#34d399",
          red: "#f43f5e",
          amber: "#f59e0b"
        }
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(124,92,255,0.25), 0 0 24px rgba(124,92,255,0.18)"
      }
    }
  },
  plugins: []
};
