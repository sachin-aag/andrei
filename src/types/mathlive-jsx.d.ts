import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          readOnly?: boolean;
          class?: string;
          "virtual-keyboard-mode"?: "auto" | "manual" | "onfocus" | "off";
        },
        HTMLElement
      >;
    }
  }
}

export {};
