import { useCallback, useEffect, useRef, useState } from 'react';

export interface AutoScrollOptions {
  working: () => boolean;
  onUserInteracted?: () => void;
  overflowAnchor?: 'none' | 'auto' | 'dynamic';
  bottomThreshold?: number;
}

export function useAutoScroll(options: AutoScrollOptions) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const settlingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoRef = useRef<{ top: number; time: number } | undefined>(undefined);
  const interactingRef = useRef(false);
  const interactingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [userScrolled, setUserScrolled] = useState(false);

  const threshold = options.bottomThreshold ?? 10;
  const active = () => options.working() || settlingRef.current;

  const distanceFromBottom = (el: HTMLElement) => {
    return el.scrollHeight - el.clientHeight - el.scrollTop;
  };

  const canScroll = (el: HTMLElement) => {
    return el.scrollHeight - el.clientHeight > 1;
  };

  // Browsers can dispatch scroll events asynchronously. If new content arrives
  // between us calling `scrollTo()` and the subsequent `scroll` event firing,
  // the handler can see a non-zero `distanceFromBottom` and incorrectly assume
  // the user scrolled.
  const markAuto = useCallback((el: HTMLElement) => {
    autoRef.current = {
      top: Math.max(0, el.scrollHeight - el.clientHeight),
      time: Date.now(),
    };

    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(() => {
      autoRef.current = undefined;
      autoTimerRef.current = undefined;
    }, 250);
  }, []);

  const isAuto = useCallback((el: HTMLElement) => {
    const a = autoRef.current;
    if (!a) return false;

    if (Date.now() - a.time > 250) {
      autoRef.current = undefined;
      return false;
    }

    return Math.abs(el.scrollTop - a.top) < 2;
  }, []);

  const scrollToBottomNow = useCallback((behavior: ScrollBehavior) => {
    const el = scrollRef.current;
    if (!el) return;
    markAuto(el);
    if (behavior === 'smooth') {
      el.scrollTo({ top: el.scrollHeight, behavior });
      return;
    }

    // `scrollTop` assignment bypasses any CSS `scroll-behavior: smooth`.
    el.scrollTop = el.scrollHeight;
  }, [markAuto]);

  const scrollToBottom = useCallback(
    (force: boolean) => {
      if (!force && !active()) return;
      if (interactingRef.current) return;
      const el = scrollRef.current;
      if (!el) return;

      if (!force && userScrolled) return;
      if (force && userScrolled) setUserScrolled(false);

      const distance = distanceFromBottom(el);
      if (distance < 2) return;

      // For auto-following content we prefer immediate updates to avoid
      // visible "catch up" animations while content is still settling.
      scrollToBottomNow('auto');
    },
    [userScrolled, active, scrollToBottomNow]
  );

  const stop = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!canScroll(el)) {
      if (userScrolled) setUserScrolled(false);
      return;
    }
    if (userScrolled) return;

    setUserScrolled(true);
    options.onUserInteracted?.();
  }, [userScrolled, options]);

  const markInteracting = useCallback(() => {
    interactingRef.current = true;
    if (interactingTimerRef.current) clearTimeout(interactingTimerRef.current);
    interactingTimerRef.current = setTimeout(() => {
      interactingRef.current = false;
      interactingTimerRef.current = undefined;
    }, 200);
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      markInteracting();
      if (e.deltaY >= 0) return;
      // If the user is scrolling within a nested scrollable region (tool output,
      // code block, etc), don't treat it as leaving the "follow bottom" mode.
      // Those regions opt in via `data-scrollable`.
      const el = scrollRef.current;
      const target = e.target instanceof Element ? e.target : undefined;
      const nested = target?.closest('[data-scrollable]');
      if (el && nested && nested !== el) return;
      stop();
    },
    [markInteracting, stop]
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (!canScroll(el)) {
      if (userScrolled) setUserScrolled(false);
      return;
    }

    if (distanceFromBottom(el) < threshold) {
      if (userScrolled) setUserScrolled(false);
      return;
    }

    // Ignore scroll events triggered by our own scrollToBottom calls.
    if (!userScrolled && isAuto(el)) {
      scrollToBottom(false);
      return;
    }

    markInteracting();

    stop();
  }, [userScrolled, threshold, isAuto, scrollToBottom, stop, markInteracting]);

  const handleInteraction = useCallback(() => {
    if (!active()) return;
    stop();
  }, [active, stop]);

  const updateOverflowAnchor = useCallback((el: HTMLElement) => {
    const mode = options.overflowAnchor ?? 'dynamic';

    if (mode === 'none') {
      el.style.overflowAnchor = 'none';
      return;
    }

    if (mode === 'auto') {
      el.style.overflowAnchor = 'auto';
      return;
    }

    el.style.overflowAnchor = userScrolled ? 'auto' : 'none';
  }, [options.overflowAnchor, userScrolled]);

  // Handle resize observer for content changes
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const resizeObserver = new ResizeObserver(() => {
      const el = scrollRef.current;
      if (el && !canScroll(el)) {
        if (userScrolled) setUserScrolled(false);
        return;
      }
      if (!active()) return;
      if (userScrolled) return;
      // ResizeObserver fires after layout, before paint.
      // Keep the bottom locked in the same frame to avoid visible
      // "jump up then catch up" artifacts while streaming content.
      scrollToBottom(false);
    });

    resizeObserver.observe(content);
    return () => resizeObserver.disconnect();
  }, [active, userScrolled, scrollToBottom]);

  // Handle working state changes (settle timeout)
  useEffect(() => {
    const working = options.working();
    settlingRef.current = false;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = undefined;

    if (working) {
      if (!userScrolled) scrollToBottom(true);
      return;
    }

    settlingRef.current = true;
    settleTimerRef.current = setTimeout(() => {
      settlingRef.current = false;
    }, 300);

    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, [options.working, userScrolled, scrollToBottom]);

  // Update overflow anchor when userScrolled changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateOverflowAnchor(el);
  }, [userScrolled, updateOverflowAnchor]);

  // Setup scroll event listeners
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateOverflowAnchor(el);
    el.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      el.removeEventListener('wheel', handleWheel);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      if (interactingTimerRef.current) clearTimeout(interactingTimerRef.current);
    };
  }, [handleWheel, updateOverflowAnchor]);

  return {
    scrollRef,
    contentRef,
    handleScroll,
    handleInteraction,
    userScrolled,
    forceScrollToBottom: () => scrollToBottom(true),
  };
}