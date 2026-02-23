import { useRef, useEffect, useState, useCallback, RefObject } from 'react';

interface UsePullToRefreshOptions {
  scrollRef: RefObject<HTMLElement>;
  threshold?: number; // px to pull before triggering
  maxPull?: number; // max visual pull distance
}

export function usePullToRefresh({ scrollRef, threshold = 80, maxPull = 120 }: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Reload the page after a brief visual delay
    setTimeout(() => {
      window.location.reload();
    }, 600);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Only enable on touch devices
    const isTouchDevice = 'ontouchstart' in window;
    if (!isTouchDevice) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (el.scrollTop <= 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;

      if (diff > 0 && el.scrollTop <= 0) {
        const distance = Math.min(diff * 0.5, maxPull); // dampen the pull
        setPullDistance(distance);
        if (distance > 10) {
          e.preventDefault(); // prevent native scroll when pulling
        }
      } else {
        pulling.current = false;
        setPullDistance(0);
      }
    };

    const handleTouchEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;

      if (pullDistance >= threshold) {
        onRefresh();
      }
      setPullDistance(0);
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [scrollRef, threshold, maxPull, pullDistance, refreshing, onRefresh]);

  return { pullDistance, refreshing };
}
