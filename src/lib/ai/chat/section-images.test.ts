import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  CHAT_SECTION_IMAGES_MAX,
  countImagesInDoc,
  dataUrlToBase64,
  flattenDocForChat,
  stripSectionImageDataUrls,
  type SectionInlineImage,
} from "@/lib/ai/chat/section-images";
import { flattenForAnchor } from "@/lib/suggestions/locator";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function pngDataUrl(): string {
  return `data:image/png;base64,${TINY_PNG}`;
}

function docWithHelloAndChart(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "hello" },
          {
            type: "imageInline",
            attrs: {
              src: pngDataUrl(),
              alt: "Results of an Exam",
              width: 400,
            },
          },
        ],
      },
    ],
  };
}

describe("flattenDocForChat", () => {
  it("keeps anchor text aligned with flattenForAnchor while marking images", () => {
    const doc = docWithHelloAndChart();
    const collected: SectionInlineImage[] = [];
    const chat = flattenDocForChat(doc, {
      targetField: "narrative",
      imageIndexStart: 1,
      collected,
    });

    expect(chat.text).toBe(flattenForAnchor(doc).text);
    expect(chat.readingText).toBe("hello[image:1]");
    expect(chat.imageCount).toBe(1);
    expect(collected).toHaveLength(1);
    expect(collected[0]).toMatchObject({
      id: "narrative#1",
      index: 1,
      alt: "Results of an Exam",
      mediaType: "image/png",
    });
    expect(collected[0]!.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("caps collected vision images but still marks extras", () => {
    const images = Array.from({ length: CHAT_SECTION_IMAGES_MAX + 2 }, () => ({
      type: "imageInline",
      attrs: { src: pngDataUrl(), alt: "chart" },
    }));
    const doc: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: images }],
    };
    const collected: SectionInlineImage[] = [];
    const chat = flattenDocForChat(doc, {
      targetField: "narrative",
      imageIndexStart: 1,
      collected,
      maxImages: CHAT_SECTION_IMAGES_MAX,
    });

    expect(collected).toHaveLength(CHAT_SECTION_IMAGES_MAX);
    expect(chat.imageCount).toBe(CHAT_SECTION_IMAGES_MAX + 2);
    expect(chat.readingText).toContain("[image]");
    expect((chat.readingText.match(/\[image:\d+\]/g) ?? []).length).toBe(
      CHAT_SECTION_IMAGES_MAX
    );
  });

  it("skips unsupported or oversized data URLs but marks the slot", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "imageInline",
              attrs: { src: "data:image/svg+xml;base64,YQ==", alt: "svg" },
            },
          ],
        },
      ],
    };
    const collected: SectionInlineImage[] = [];
    const chat = flattenDocForChat(doc, {
      targetField: "narrative",
      imageIndexStart: 1,
      collected,
    });
    expect(collected).toHaveLength(0);
    expect(chat.readingText).toBe("[image]");
  });
});

describe("countImagesInDoc / dataUrl helpers", () => {
  it("counts nested imageInline nodes", () => {
    expect(countImagesInDoc(docWithHelloAndChart())).toBe(1);
    expect(countImagesInDoc(null)).toBe(0);
  });

  it("extracts base64 from a data URL", () => {
    expect(dataUrlToBase64(pngDataUrl())).toBe(TINY_PNG);
    expect(dataUrlToBase64("https://example.com/x.png")).toBeNull();
  });

  it("strips dataUrl payloads for persistence", () => {
    const stripped = stripSectionImageDataUrls({
      images: [{ id: "narrative#1", dataUrl: pngDataUrl() }],
    });
    expect(stripped.images[0]!.dataUrl).toBe("[omitted]");
  });
});
