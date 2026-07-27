import { useCallback, useRef, useState } from "react";

export interface UseFocusReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  focused: string | null;
  toggleFocus: (block: string) => void;
}

export function useFocus(): UseFocusReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const toggleFocus = useCallback((block: string) => {
    const container = containerRef.current;
    if (!container) return;

    const blocks = container.querySelectorAll<HTMLElement>("[data-block]");
    const firstRects = new Map<string, DOMRect>();
    blocks.forEach((el) => {
      const key = el.dataset.block;
      if (key) firstRects.set(key, el.getBoundingClientRect());
    });

    setFocused((prev) => (prev === block ? null : block));

    requestAnimationFrame(() => {
      blocks.forEach((el) => {
        const key = el.dataset.block;
        if (!key) return;
        const first = firstRects.get(key);
        if (!first) return;
        const last = el.getBoundingClientRect();

        const dx = first.left - last.left;
        const dy = first.top - last.top;
        const dw = last.width > 0 ? first.width / last.width : 1;
        const dh = last.height > 0 ? first.height / last.height : 1;

        if (
          Math.abs(dx) < 1 &&
          Math.abs(dy) < 1 &&
          Math.abs(dw - 1) < 0.01 &&
          Math.abs(dh - 1) < 0.01
        )
          return;

        el.animate(
          [
            {
              transformOrigin: "top left",
              transform: `translate(${dx}px, ${dy}px) scale(${dw}, ${dh})`,
            },
            {
              transformOrigin: "top left",
              transform: "none",
            },
          ],
          {
            duration: 320,
            easing: "cubic-bezier(0.4, 0, 0.2, 1)",
            fill: "both",
          },
        );
      });
    });
  }, []);

  return { containerRef, focused, toggleFocus };
}
