import { useEffect } from "react";

let renderCounter = 0;

export function useRenderTimer(label: string) {
  const renderId = ++renderCounter;
  const start = performance.now();

  useEffect(() => {
    const duration = performance.now() - start;
    console.log(`render:${label}#${renderId} ${duration.toFixed(2)}ms`);
  });
}

export function createRenderProfiler(label: string) {
  const start = performance.now();
  let last = start;

  return {
    step(name: string) {
      const now = performance.now();
      console.log(`render-step:${label}:${name} ${(now - last).toFixed(2)}ms (+${(now - start).toFixed(2)}ms)`);
      last = now;
    },
    end(note?: string) {
      const now = performance.now();
      const suffix = note ? ` ${note}` : "";
      console.log(`render-done:${label} ${(now - start).toFixed(2)}ms total${suffix ? ` (${note})` : ""}`);
    },
  };
}
