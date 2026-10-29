import { Box } from '@mui/material';
import { JSX, RefObject, useEffect, useState } from 'react';

/** Animation-frame measurements update only the marker, not every topic row. */
const TopicSelectionMarker = ({ listRef }: { listRef: RefObject<HTMLUListElement | null> }): JSX.Element | null => {
  const [marker, setMarker] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = (): void => {
      const active = list.querySelector('[data-active-topic="true"]');
      if (!active) {
        setMarker(null);
        return;
      }
      const rect = active.getBoundingClientRect();
      const parent = list.getBoundingClientRect();
      const next = { top: rect.top - parent.top + 8, height: Math.max(0, rect.height - 16) };
      setMarker((previous) => (previous?.top === next.top && previous.height === next.height ? previous : next));
    };
    measure();
    let frame: number | null = null;
    const scheduleMeasure = (): void => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    resize?.observe(list);
    const mutations = new MutationObserver(scheduleMeasure);
    mutations.observe(list, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-active-topic'],
    });
    window.addEventListener('resize', scheduleMeasure);
    return (): void => {
      resize?.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [listRef]);

  return marker ? (
    <Box
      component="li"
      aria-hidden="true"
      sx={{
        position: 'absolute',
        left: 8,
        top: 0,
        width: 3,
        height: marker.height,
        transform: `translateY(${marker.top}px)`,
        borderRadius: 2,
        bgcolor: 'primary.main',
        pointerEvents: 'none',
        listStyle: 'none',
        zIndex: 1,
        transition: 'transform 200ms ease, height 200ms ease',
      }}
    />
  ) : null;
};

export default TopicSelectionMarker;
