import type { Page } from "@playwright/test";
import { STUB_VOICE_FINAL } from "@/lib/voice/constants";

/** Stub Speech-to-Text still opens getUserMedia; Cloud VMs have no mic. */
export async function installFakeMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) return;
    const original = mediaDevices.getUserMedia.bind(mediaDevices);
    mediaDevices.getUserMedia = async (constraints) => {
      const audio =
        typeof constraints === "object" && constraints != null && "audio" in constraints
          ? constraints.audio
          : false;
      if (!audio) return original(constraints);
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      oscillator.frequency.value = 220;
      oscillator.connect(destination);
      oscillator.start();
      return destination.stream;
    };
  });
}

export { STUB_VOICE_FINAL };
