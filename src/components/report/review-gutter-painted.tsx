"use client";

import { createContext, use, type ReactNode } from "react";

const ReviewGutterPaintedContext = createContext(false);

export function ReviewGutterPaintedProvider({
  painted,
  children,
}: {
  painted: boolean;
  children: ReactNode;
}) {
  return (
    <ReviewGutterPaintedContext value={painted}>
      {children}
    </ReviewGutterPaintedContext>
  );
}

/** False outside the report canvas — keep the in-document card. */
export function useReviewGutterColumnPainted(): boolean {
  return use(ReviewGutterPaintedContext);
}
