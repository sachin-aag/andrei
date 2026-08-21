import { describe, expect, it } from "vitest";
import {
  chatMathDisplayFromClassName,
  isChatMathClassName,
  reactNodeToPlainText,
  rewriteChatMathHtmlConflicts,
} from "@/components/report/chat-markdown-math";

describe("rewriteChatMathHtmlConflicts", () => {
  it("rewrites $< so markdown does not treat it as HTML", () => {
    expect(rewriteChatMathHtmlConflicts("$<60$")).toBe("$\\lt 60$");
  });

  it("rewrites $> similarly", () => {
    expect(rewriteChatMathHtmlConflicts("$>5$")).toBe("$\\gt 5$");
  });

  it("leaves other latex unchanged", () => {
    expect(rewriteChatMathHtmlConflicts(String.raw`**$\pm 20\%$**`)).toBe(
      String.raw`**$\pm 20\%$**`
    );
  });

  it("expands one-line $$...$$ into display-math fences", () => {
    expect(rewriteChatMathHtmlConflicts(String.raw`$$\frac{a}{b}$$`)).toBe(
      String.raw`
$$
\frac{a}{b}
$$
`
    );
  });
});

describe("chat math class helpers", () => {
  it("detects the chat-math class on strings and arrays", () => {
    expect(isChatMathClassName("chat-math chat-math-inline")).toBe(true);
    expect(isChatMathClassName(["chat-math", "chat-math-block"])).toBe(true);
    expect(isChatMathClassName("leading-relaxed")).toBe(false);
  });

  it("reads block vs inline from class names", () => {
    expect(chatMathDisplayFromClassName("chat-math chat-math-block")).toBe("block");
    expect(chatMathDisplayFromClassName("chat-math chat-math-inline")).toBe("inline");
  });

  it("flattens react children to latex text", () => {
    expect(reactNodeToPlainText(["\\pm ", "20\\%"])).toBe("\\pm 20\\%");
    expect(reactNodeToPlainText(null)).toBe("");
  });
});
