import nextConfig from "eslint-config-next";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "next-env.d.ts",
      "dist/**",
      "out/**",
      "android/**",
    ],
  },
  ...nextConfig,
];

export default eslintConfig;
