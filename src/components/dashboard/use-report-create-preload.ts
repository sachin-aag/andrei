"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { DocumentType } from "@/db/schema";

type PreloadState = {
  gen: number;
  id: string | null;
  type: DocumentType | null;
  pending: Promise<string | null>;
};

function discardReport(id: string, keepalive = false): void {
  void fetch(`/api/reports/${id}`, {
    method: "DELETE",
    keepalive,
  });
}

export function useReportCreatePreload(opts: {
  enabled: boolean;
  documentType: DocumentType | null;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  const stateRef = useRef<PreloadState>({
    gen: 0,
    id: null,
    type: null,
    pending: Promise.resolve(null),
  });

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const discard = useCallback(() => {
    stateRef.current.gen += 1;
    const id = stateRef.current.id;
    stateRef.current.id = null;
    stateRef.current.type = null;
    stateRef.current.pending = Promise.resolve(null);
    if (id) discardReport(id);
  }, []);

  const start = useCallback((type: DocumentType) => {
    stateRef.current.gen += 1;
    const previousId = stateRef.current.id;
    stateRef.current.id = null;
    stateRef.current.type = null;
    if (previousId) discardReport(previousId);
    const gen = stateRef.current.gen;
    const pending = (async () => {
      try {
        const res = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentType: type, preload: true }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { id?: string };
        if (!data.id) return null;
        if (stateRef.current.gen !== gen) {
          discardReport(data.id);
          return null;
        }
        stateRef.current.id = data.id;
        stateRef.current.type = type;
        routerRef.current.prefetch(`/reports/${data.id}/edit`);
        return data.id;
      } catch {
        return null;
      }
    })();
    stateRef.current.pending = pending;
    return pending;
  }, []);

  const takeForFinalize = useCallback(async (type: DocumentType) => {
    if (stateRef.current.type === type && stateRef.current.id) {
      return stateRef.current.id;
    }
    const id = await stateRef.current.pending;
    if (stateRef.current.type === type) {
      return stateRef.current.id ?? id;
    }
    return null;
  }, []);

  const releaseWithoutDiscard = useCallback(() => {
    stateRef.current.gen += 1;
    stateRef.current.id = null;
    stateRef.current.type = null;
    stateRef.current.pending = Promise.resolve(null);
  }, []);

  useEffect(() => {
    if (!opts.enabled || !opts.documentType) return;
    start(opts.documentType);
    return () => discard();
  }, [opts.enabled, opts.documentType, start, discard]);

  useEffect(() => {
    const onPageHide = () => {
      const id = stateRef.current.id;
      if (!id) return;
      discardReport(id, true);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  return { takeForFinalize, releaseWithoutDiscard, discard };
}
