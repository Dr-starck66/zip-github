import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF || "astra-reliability",
  dirs: ["./src"],
  maxDuration: 300,
});
