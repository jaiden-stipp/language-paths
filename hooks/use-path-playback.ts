'use client';

import { useCallback, useEffect, useState } from 'react';

type PathPlaybackOptions = {
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onSelect: (nodeId: string) => void;
  intervalMs?: number;
};

export function usePathPlayback({
  playing,
  onPlayingChange,
  onSelect,
  intervalMs = 650,
}: PathPlaybackOptions) {
  const [path, setPath] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!playing || path.length < 2) return;
    const timer = window.setTimeout(() => {
      const nextIndex = Math.min(index + 1, path.length - 1);
      setIndex(nextIndex);
      const nextId = path[nextIndex];
      if (nextId) onSelect(nextId);
      if (nextIndex >= path.length - 1) onPlayingChange(false);
    }, intervalMs);
    return () => window.clearTimeout(timer);
  }, [index, intervalMs, onPlayingChange, onSelect, path, playing]);

  const reset = useCallback(() => {
    setPath([]);
    setIndex(0);
  }, []);

  const toggle = (selectedPath: string[]) => {
    if (playing) {
      onPlayingChange(false);
      return;
    }
    if (path.length > 1 && index > 0 && index < path.length - 1) {
      onPlayingChange(true);
      return;
    }
    if (selectedPath.length < 2) return;
    setPath(selectedPath);
    setIndex(0);
    const firstId = selectedPath[0];
    if (firstId) onSelect(firstId);
    onPlayingChange(true);
  };

  return { index, path, reset, toggle };
}
