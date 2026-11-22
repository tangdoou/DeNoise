/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./popup.html",
    "./options.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        notion: {
          bg: "#FFFFFF",
          subtle: "#F7F7F5",
          hover: "#EFEFED",
          border: "#E9E9E7",
          text: "#191919",
          muted: "#787774",
          green: "#0F7B6C",
          amber: "#D9730D",
          red: "#E03E3E"
        }
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif"
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace"
        ]
      }
    }
  },
  plugins: []
};
