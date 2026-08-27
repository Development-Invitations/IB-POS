/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // из макета: тёмно-синий сайдбар, красный акцент
        sidebar: "#0f1b33",
        accent: {
          DEFAULT: "#e11d2e",
          hover: "#c8172a",
        },
      },
    },
  },
  plugins: [],
};
