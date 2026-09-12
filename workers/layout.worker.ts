/// <reference lib="webworker" />

import { createLayout } from '@/lib/graph/layout';
import type { PathNode, Point, SimilarityRelation } from '@/lib/graph/types';

type LayoutRequest = {
  version: number;
  nodes: PathNode[];
  relations: SimilarityRelation[];
  previousPositions: Array<[string, Point]>;
  selectedPathIds: string[];
};

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const { version, nodes, relations, previousPositions, selectedPathIds } =
    event.data;
  const layout = createLayout(
    nodes,
    relations,
    new Map(previousPositions),
    new Set(selectedPathIds),
  );
  self.postMessage({ version, layout });
};

export {};
