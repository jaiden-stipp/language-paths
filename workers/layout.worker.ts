/// <reference lib="webworker" />

import { createLayout } from '@/lib/graph/layout';
import type { PathNode, Point, SimilarityRelation } from '@/lib/graph/types';

type LayoutRequest = {
  version: number;
  nodes: PathNode[];
  relations: SimilarityRelation[];
  previousPositions: Array<[string, Point]>;
};

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const { version, nodes, relations, previousPositions } = event.data;
  const layout = createLayout(nodes, relations, new Map(previousPositions));
  self.postMessage({ version, layout });
};

export {};
