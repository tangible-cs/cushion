import { useEffect, useRef, useState } from 'react';

export function useThrottledValue(value: string, delay = 100) {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(0);

  useEffect(() => {
    const now = Date.now();
    const remaining = delay - (now - lastUpdate.current);
    if (remaining <= 0) {
      lastUpdate.current = now;
      setThrottled(value);
      return;
    }
    const timeout = window.setTimeout(() => {
      lastUpdate.current = Date.now();
      setThrottled(value);
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);

  return throttled;
}
