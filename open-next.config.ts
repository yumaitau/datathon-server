import { defineCloudflareConfig, type OpenNextConfig } from "@opennextjs/cloudflare";

const config: OpenNextConfig = {
  ...defineCloudflareConfig({}),
  // Keeps the repository's default `build` command available for Cloudflare
  // Workers Builds without recursively invoking OpenNext.
  buildCommand: "pnpm build:next",
};

export default config;
