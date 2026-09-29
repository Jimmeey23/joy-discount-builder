import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // `-discount.decision.test.ts` is a compile-time type regression checked by
    // tsc, not a runtime suite.
    exclude: ["**/node_modules/**", "**/-*.test.ts"],
  },
});
