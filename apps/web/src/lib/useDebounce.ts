import { useRef, useCallback } from "react";

export function useDebounce<T extends unknown[]>(
  fn: (...args: T) => void,
  ms: number
): (...args: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (...args: T) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), ms);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ms]
  );
}
