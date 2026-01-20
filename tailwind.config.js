/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "riscv-blue": "#0056b3", // Example custom color
      },
    },
  },
  plugins: [],
};
