import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18202B",
        muted: "#667085",
        line: "#DDE3EA",
        canvas: "#F4F6F8",
        blue: "#175CD3",
        blueSoft: "#E8F0FF",
        green: "#087443",
        greenSoft: "#E8F5EE",
        amber: "#A15C07",
        amberSoft: "#FFF4D6",
      },
      boxShadow: {
        card: "0 12px 32px rgba(24, 32, 43, 0.07)",
        float: "0 20px 55px rgba(24, 32, 43, 0.14)",
      },
    },
  },
  plugins: [],
};

export default config;
