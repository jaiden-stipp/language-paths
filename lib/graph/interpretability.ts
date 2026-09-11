import { hashUnit } from '@/lib/graph/geometry';
import type { PathNode, PositionedNode } from '@/lib/graph/types';

export type SemanticZoomLevel = 'overview' | 'focus' | 'detail';

export const OVERVIEW_ZOOM_THRESHOLD = 0.42;
export const DETAIL_ZOOM_THRESHOLD = 0.78;

export function semanticZoomLevel(zoom: number): SemanticZoomLevel {
  if (zoom < OVERVIEW_ZOOM_THRESHOLD) return 'overview';
  if (zoom < DETAIL_ZOOM_THRESHOLD) return 'focus';
  return 'detail';
}

export function distributionEntropy(
  nodes: Pick<PathNode, 'conditionalProbability'>[],
) {
  const total = nodes.reduce(
    (sum, node) => sum + Math.max(0, node.conditionalProbability),
    0,
  );
  if (total <= 0) return 0;
  return nodes.reduce((entropy, node) => {
    const probability = Math.max(0, node.conditionalProbability) / total;
    return probability > 0
      ? entropy - probability * Math.log2(probability)
      : entropy;
  }, 0);
}

export function distributionDescription(
  nodes: Pick<PathNode, 'conditionalProbability'>[],
) {
  if (nodes.length < 2) return 'one visible continuation';
  const entropy = distributionEntropy(nodes);
  const maximumEntropy = Math.log2(nodes.length);
  const normalizedEntropy = maximumEntropy > 0 ? entropy / maximumEntropy : 0;
  const total = nodes.reduce(
    (sum, node) => sum + Math.max(0, node.conditionalProbability),
    0,
  );
  const topShare =
    total > 0
      ? Math.max(...nodes.map((node) => node.conditionalProbability)) / total
      : 0;

  if (topShare >= 0.68 || normalizedEntropy < 0.38) return 'one clear favorite';
  if (normalizedEntropy < 0.66) return 'a few plausible continuations';
  if (normalizedEntropy < 0.86) return 'several plausible continuations';
  return 'many similarly likely continuations';
}

export type StepCluster = {
  id: string;
  parentId: string;
  depth: number;
  count: number;
  probabilityMass: number;
  entropy: number;
  x: number;
  y: number;
  path: string;
  lineage: number;
};

export function createStepClusters(
  nodes: PositionedNode[],
  selectedPath: Set<string>,
  lineageById: Map<string, number>,
): StepCluster[] {
  const positionById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, PositionedNode[]>();
  for (const node of nodes) {
    if (!node.parentId || !selectedPath.has(node.parentId)) continue;
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  }

  return [...childrenByParent].flatMap(([parentId, siblings]) => {
    const parent = positionById.get(parentId);
    const alternatives = siblings.filter((node) => !selectedPath.has(node.id));
    if (!parent || alternatives.length === 0) return [];

    const probabilityMass = Math.min(
      1,
      alternatives.reduce(
        (sum, node) => sum + Math.max(0, node.conditionalProbability),
        0,
      ),
    );
    const weightTotal = Math.max(0.0001, probabilityMass);
    let x =
      alternatives.reduce(
        (sum, node) =>
          sum + node.x * Math.max(0.0001, node.conditionalProbability),
        0,
      ) / weightTotal;
    let y =
      alternatives.reduce(
        (sum, node) =>
          sum + node.y * Math.max(0.0001, node.conditionalProbability),
        0,
      ) / weightTotal;

    let deltaX = x - parent.x;
    let deltaY = y - parent.y;
    let distance = Math.hypot(deltaX, deltaY);
    if (distance < 92) {
      const angle =
        distance > 1
          ? Math.atan2(deltaY, deltaX)
          : hashUnit(`step-cluster-${parentId}`) * Math.PI * 2;
      x = parent.x + Math.cos(angle) * 92;
      y = parent.y + Math.sin(angle) * 92;
      deltaX = x - parent.x;
      deltaY = y - parent.y;
      distance = Math.max(1, Math.hypot(deltaX, deltaY));
    }

    const normalX = -deltaY / distance;
    const normalY = deltaX / distance;
    const arcDirection = hashUnit(`${parentId}-cluster-arc`) > 0.5 ? 1 : -1;
    const middleX = (parent.x + x) / 2 + normalX * 16 * arcDirection;
    const middleY = (parent.y + y) / 2 + normalY * 16 * arcDirection;
    const firstAlternative = alternatives[0];
    if (!firstAlternative) return [];

    return [
      {
        id: `step-cluster-${parentId}`,
        parentId,
        depth: firstAlternative.depth,
        count: alternatives.length,
        probabilityMass,
        entropy: distributionEntropy(siblings),
        x,
        y,
        path: `M ${parent.x} ${parent.y} Q ${middleX} ${middleY}, ${x} ${y}`,
        lineage: lineageById.get(firstAlternative.id) ?? 0,
      },
    ];
  });
}
