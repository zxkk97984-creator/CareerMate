import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "coverage/**",
      "dist/**",
      ".worktrees/**",
      "src/agentic-v2/platform/automation/**",
      "prisma/dev.db",
      "work/**",
      // 第三方 vendor 浏览器库（Live2D / Pixi），由 public/live2d/index.html 加载，非本项目源码。
      // 来源与许可证：pixi.js v6.5.2（MIT）；live2dcubismcore（Live2D Inc · Cubism Core）；
      // live2d / pixi-live2d-display / index min 脚本（Live2D/Pixi 显示层）。
      "public/lib/*.min.js",
    ],
  },
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
