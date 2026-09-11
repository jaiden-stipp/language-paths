'use client';

import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { clampZoom } from '@/lib/graph/geometry';

export function useGraphCamera() {
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const zoomFrame = useRef<number | null>(null);
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panGesture = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const pinchGesture = useRef<{
    distance: number;
    startZoom: number;
    worldX: number;
    worldY: number;
  } | null>(null);

  const commitCamera = useCallback(
    (nextZoom: number, left: number, top: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const boundedZoom = clampZoom(nextZoom);
      const target = { left: Math.max(0, left), top: Math.max(0, top) };
      zoomRef.current = boundedZoom;
      pendingScroll.current = target;
      setZoom(boundedZoom);
      if (zoomFrame.current !== null) {
        window.cancelAnimationFrame(zoomFrame.current);
      }
      zoomFrame.current = window.requestAnimationFrame(() => {
        const currentViewport = viewportRef.current;
        if (currentViewport) {
          currentViewport.scrollLeft = target.left;
          currentViewport.scrollTop = target.top;
        }
        pendingScroll.current = null;
        zoomFrame.current = null;
      });
    },
    [],
  );

  const zoomAroundPoint = useCallback(
    (nextZoom: number, clientX?: number, clientY?: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const localX =
        (clientX ?? rect.left + viewport.clientWidth / 2) - rect.left;
      const localY =
        (clientY ?? rect.top + viewport.clientHeight / 2) - rect.top;
      const camera = pendingScroll.current ?? {
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
      const worldX = (camera.left + localX) / zoomRef.current;
      const worldY = (camera.top + localY) / zoomRef.current;
      const boundedZoom = clampZoom(nextZoom);
      commitCamera(
        boundedZoom,
        worldX * boundedZoom - localX,
        worldY * boundedZoom - localY,
      );
    },
    [commitCamera],
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0014);
      zoomAroundPoint(zoomRef.current * factor, event.clientX, event.clientY);
    },
    [zoomAroundPoint],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if ((event.target as HTMLElement).closest('.token-node')) return;
      const viewport = event.currentTarget;
      const point = { x: event.clientX, y: event.clientY };
      pointers.current.set(event.pointerId, point);
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('dragging');

      if (pointers.current.size === 1) {
        const camera = pendingScroll.current ?? {
          left: viewport.scrollLeft,
          top: viewport.scrollTop,
        };
        panGesture.current = {
          startX: point.x,
          startY: point.y,
          scrollLeft: camera.left,
          scrollTop: camera.top,
        };
        pinchGesture.current = null;
      } else if (pointers.current.size === 2) {
        const [first, second] = [...pointers.current.values()];
        if (!first || !second) return;
        const rect = viewport.getBoundingClientRect();
        const midpointX = (first.x + second.x) / 2 - rect.left;
        const midpointY = (first.y + second.y) / 2 - rect.top;
        const camera = pendingScroll.current ?? {
          left: viewport.scrollLeft,
          top: viewport.scrollTop,
        };
        pinchGesture.current = {
          distance: Math.max(
            1,
            Math.hypot(second.x - first.x, second.y - first.y),
          ),
          startZoom: zoomRef.current,
          worldX: (camera.left + midpointX) / zoomRef.current,
          worldY: (camera.top + midpointY) / zoomRef.current,
        };
        panGesture.current = null;
      }
      event.preventDefault();
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(event.pointerId)) return;
      const viewport = event.currentTarget;
      pointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (pointers.current.size >= 2 && pinchGesture.current) {
        const [first, second] = [...pointers.current.values()];
        if (!first || !second) return;
        const rect = viewport.getBoundingClientRect();
        const midpointX = (first.x + second.x) / 2 - rect.left;
        const midpointY = (first.y + second.y) / 2 - rect.top;
        const distance = Math.max(
          1,
          Math.hypot(second.x - first.x, second.y - first.y),
        );
        const nextZoom = clampZoom(
          pinchGesture.current.startZoom *
            (distance / pinchGesture.current.distance),
        );
        commitCamera(
          nextZoom,
          pinchGesture.current.worldX * nextZoom - midpointX,
          pinchGesture.current.worldY * nextZoom - midpointY,
        );
      } else if (panGesture.current) {
        pendingScroll.current = null;
        viewport.scrollLeft =
          panGesture.current.scrollLeft -
          (event.clientX - panGesture.current.startX);
        viewport.scrollTop =
          panGesture.current.scrollTop -
          (event.clientY - panGesture.current.startY);
      }
      event.preventDefault();
    },
    [commitCamera],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const viewport = event.currentTarget;
      pointers.current.delete(event.pointerId);
      if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }
      if (pointers.current.size === 1) {
        const remaining = [...pointers.current.values()][0];
        if (remaining) {
          panGesture.current = {
            startX: remaining.x,
            startY: remaining.y,
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
          };
        }
        pinchGesture.current = null;
      } else {
        panGesture.current = null;
        pinchGesture.current = null;
        viewport.classList.remove('dragging');
      }
    },
    [],
  );

  useEffect(
    () => () => {
      if (zoomFrame.current !== null) {
        window.cancelAnimationFrame(zoomFrame.current);
      }
    },
    [],
  );

  return {
    commitCamera,
    handlePointerDown,
    handlePointerEnd,
    handlePointerMove,
    handleWheel,
    viewportRef,
    zoom,
    zoomAroundPoint,
    zoomRef,
  };
}
