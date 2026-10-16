import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class", // <-- ADAUGĂ LINIA ASTA AICI
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ... restul configurărilor tale
    },
  },
  plugins: [],
};
export default config;
