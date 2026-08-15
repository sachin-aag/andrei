declare module "workflow/next" {
  import type { NextConfig } from "next";

  export function withWorkflow(config: NextConfig): NextConfig;
}
