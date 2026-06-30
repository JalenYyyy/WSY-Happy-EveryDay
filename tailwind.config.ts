import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#fbf8f3",
        petal: "#f7e8e7",
        sage: "#dfe9df",
        ink: "#202124",
      },
      boxShadow: {
        soft: "0 18px 50px rgba(31, 35, 40, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
