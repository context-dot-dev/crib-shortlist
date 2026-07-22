import next from "eslint-config-next/core-web-vitals";

const config = [
  ...next,
  {
    ignores: [
      ".next/**",
      "dist/**",
      "node_modules/**"
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
