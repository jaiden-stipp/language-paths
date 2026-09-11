'use client';

import { useEffect, useRef, useState } from 'react';

import { createLayout } from '@/lib/graph/layout';
import type {
  LayoutResult,
  PathNode,
  Point,
  SimilarityRelation,
} from '@/lib/graph/types';

type LayoutState = {
  layout: LayoutResult;
  spawnOrigins: Map<string, Point>;
};

export function useGraphLayout(
  nodes: PathNode[],
  relations: SimilarityRelation[],
) {
  const [state, setState] = useState<LayoutState>(() => ({
    layout: createLayout(nodes, relations),
    spawnOrigins: new Map(),
  }));
  const layoutRef = useRef(state.layout);
  const workerRef = useRef<Worker | null>(null);
  const versionRef = useRef(0);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    const worker = new Worker(
      new URL('../workers/layout.worker.ts', import.meta.url),
      {
        type: 'module',
      },
    );
    workerRef.current = worker;
    worker.onmessage = (
      event: MessageEvent<{ version: number; layout: LayoutResult }>,
    ) => {
      if (event.data.version !== versionRef.current) return;
      const previous = new Map(
        layoutRef.current.nodes.map((node) => [
          node.id,
          { x: node.x, y: node.y },
        ]),
      );
      layoutRef.current = event.data.layout;
      setState({ layout: event.data.layout, spawnOrigins: previous });
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const version = ++versionRef.current;
    const previousPositions = layoutRef.current.nodes.map(
      (node): [string, Point] => [node.id, { x: node.x, y: node.y }],
    );
    if (workerRef.current) {
      workerRef.current.postMessage({
        version,
        nodes,
        relations,
        previousPositions,
      });
      return;
    }
    queueMicrotask(() => {
      if (version !== versionRef.current) return;
      const previous = new Map(previousPositions);
      const layout = createLayout(nodes, relations, previous);
      layoutRef.current = layout;
      setState({ layout, spawnOrigins: previous });
    });
  }, [nodes, relations]);

  return state;
}
