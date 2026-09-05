import { useEffect, useRef, useState } from "react";

/** Keeps a plot title editable while syncing the suggested default until the user types. */
export function usePlotTitle(suggestedTitle: string, defaultTitle = "") {
  const initial = defaultTitle.trim() || suggestedTitle;
  const [title, setTitleState] = useState(initial);
  const userEditedRef = useRef(Boolean(defaultTitle.trim()));

  useEffect(() => {
    if (userEditedRef.current) return;
    setTitleState(suggestedTitle);
  }, [suggestedTitle]);

  const setTitle = (value: string) => {
    userEditedRef.current = true;
    setTitleState(value);
  };

  const resolvedTitle = title.trim() || suggestedTitle;

  return { title, setTitle, resolvedTitle };
}
