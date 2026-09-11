'use client';

import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function PanelResizer({
  label,
  value,
  minimum,
  maximum,
  defaultValue,
  direction = 1,
  onResize,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  defaultValue: number;
  direction?: 1 | -1;
  onResize: (value: number) => void;
}) {
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startValue: number;
  } | null>(null);

  const finishResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.removeAttribute('data-resizing');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const physicalDelta = event.key === 'ArrowRight' ? 1 : -1;
    const step = event.shiftKey ? 40 : 12;
    onResize(clamp(value + physicalDelta * step * direction, minimum, maximum));
    event.preventDefault();
  };

  return (
    <button
      type="button"
      className="panel-resizer"
      aria-label={label}
      onDoubleClick={() => onResize(defaultValue)}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startValue: value,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.setAttribute('data-resizing', '');
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        const delta = (event.clientX - drag.current.startX) * direction;
        onResize(clamp(drag.current.startValue + delta, minimum, maximum));
        event.preventDefault();
      }}
      onPointerUp={finishResize}
      onPointerCancel={finishResize}
      title={`${label}. Drag or use arrow keys. Double-click to reset.`}
    />
  );
}
