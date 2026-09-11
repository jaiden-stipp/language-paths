export type ConnectionState = 'checking' | 'online' | 'offline';

export type WalkStrategy =
  | 'weighted-random'
  | 'most-likely'
  | 'least-likely'
  | 'uniform-random';

export type DistributionPoint = {
  tokenId: number;
  probability: number;
};

export type PathNode = {
  id: string;
  parentId: string | null;
  depth: number;
  token: string;
  tokenId: number | null;
  conditionalProbability: number;
  cumulativeProbability: number;
  expanded: boolean;
  visibleProbabilityMass?: number;
  distribution?: DistributionPoint[];
  loading?: boolean;
  error?: string;
  fresh?: boolean;
};

export type PositionedNode = PathNode & {
  x: number;
  y: number;
};

export type TokenChoice = {
  id: number;
  token: string;
  probability: number;
};

export type TokenStep = {
  options: TokenChoice[];
  sampled: TokenChoice;
  stopType: string;
};

export type SimilarityRelation = {
  id: string;
  sourceId: string;
  targetId: string;
  strength: number;
  sharedTokens: number;
};

export type DistributionLink = SimilarityRelation & {
  source: PositionedNode;
  target: PositionedNode;
  fresh: boolean;
};

export type LayoutResult = {
  nodes: PositionedNode[];
  width: number;
  height: number;
};

export type Point = { x: number; y: number };

export type GraphSnapshot = {
  nodesById: Map<string, PathNode>;
  childrenByParent: Map<string, string[]>;
  order: string[];
};
