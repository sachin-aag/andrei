const MAX_WIDTH_PX = 1280;
const JPEG_QUALITY = 0.85;
const MAX_BYTES = 1_048_576;

export type CompressedImage = {
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
};

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Could not compress image."));
        else resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read compressed image."));
    reader.readAsDataURL(blob);
  });
}

/** Resize and compress an uploaded image for inline narrative storage. */
export async function compressImageFile(file: File): Promise<CompressedImage> {
  if (file.type === "image/svg+xml") {
    throw new Error("SVG images are not supported.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose a PNG or JPEG image.");
  }

  const img = await loadImageFromFile(file);
  const scale = Math.min(1, MAX_WIDTH_PX / Math.max(img.width, 1));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image canvas.");
  ctx.drawImage(img, 0, 0, width, height);

  const mimeType =
    file.type === "image/png" && file.size < MAX_BYTES / 2
      ? "image/png"
      : "image/jpeg";
  const quality = mimeType === "image/jpeg" ? JPEG_QUALITY : undefined;

  let blob = await canvasToBlob(canvas, mimeType, quality ?? 1);
  if (blob.size > MAX_BYTES && mimeType !== "image/jpeg") {
    blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  } else if (blob.size > MAX_BYTES) {
    blob = await canvasToBlob(canvas, "image/jpeg", 0.7);
  }

  if (blob.size > MAX_BYTES) {
    throw new Error("Image is too large after compression (max 1 MB).");
  }

  const dataUrl = await blobToDataUrl(blob);
  return {
    dataUrl,
    width,
    height,
    mimeType: blob.type || mimeType,
  };
}

export function countImagesInDoc(doc: { content?: unknown[] } | null | undefined): number {
  if (!doc?.content?.length) return 0;
  let count = 0;
  const walk = (node: { type?: string; content?: unknown[] }) => {
    if (node.type === "imageInline") count++;
    for (const ch of node.content ?? []) {
      if (ch && typeof ch === "object") walk(ch as { type?: string; content?: unknown[] });
    }
  };
  walk(doc);
  return count;
}

export const MAX_IMAGES_PER_SECTION = 10;
