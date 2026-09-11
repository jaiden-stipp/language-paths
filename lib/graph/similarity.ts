import type {
  DistributionLink,
  DistributionPoint,
  PathNode,
  PositionedNode,
  SimilarityRelation,
} from '@/lib/graph/types';

export const SIMILARITY_THRESHOLD = 0.56;
export const MAX_VISIBLE_SIMILARITY_LINKS = 28;
export const MAX_LAYOUT_SIMILARITY_LINKS = 36;

export function distributionSimilarity(
  first: DistributionPoint[],
  second: DistributionPoint[],
) {
  const secondByToken = new Map(
    second.map((point) => [point.tokenId, point.probability]),
  );
  let dotProduct = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;
  let sharedTokens = 0;

  for (const point of first) {
    firstMagnitude += point.probability * point.probability;
    const match = secondByToken.get(point.tokenId);
    if (match !== undefined) {
      dotProduct += point.probability * match;
      sharedTokens += 1;
    }
  }
  for (const point of second) {
    secondMagnitude += point.probability * point.probability;
  }

  const denominator = Math.sqrt(firstMagnitude * secondMagnitude);
  return {
    similarity:
      denominator > 0
        ? Math.round((dotProduct / denominator) * 10000) / 10000
        : 0,
    sharedTokens,
  };
}

export function createSimilarityRelations(nodes: PathNode[]) {
  const expandedNodes = nodes.filter(
    (node) => (node.distribution?.length ?? 0) > 0,
  );
  const relations: SimilarityRelation[] = [];

  for (
    let sourceIndex = 0;
    sourceIndex < expandedNodes.length;
    sourceIndex += 1
  ) {
    for (
      let targetIndex = sourceIndex + 1;
      targetIndex < expandedNodes.length;
      targetIndex += 1
    ) {
      const source = expandedNodes[sourceIndex];
      const target = expandedNodes[targetIndex];
      const comparison = distributionSimilarity(
        source.distribution ?? [],
        target.distribution ?? [],
      );
      if (
        comparison.sharedTokens === 0 ||
        comparison.similarity < SIMILARITY_THRESHOLD
      ) {
        continue;
      }
      relations.push({
        id: [source.id, target.id].sort().join('--'),
        sourceId: source.id,
        targetId: target.id,
        strength: comparison.similarity,
        sharedTokens: comparison.sharedTokens,
      });
    }
  }

  return relations.sort(
    (a, b) =>
      b.strength - a.strength || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function createDistributionLinks(
  positionedNodes: PositionedNode[],
  relations: SimilarityRelation[],
) {
  const byId = new Map(positionedNodes.map((node) => [node.id, node]));
  return relations
    .slice(0, MAX_VISIBLE_SIMILARITY_LINKS)
    .flatMap((relation): DistributionLink[] => {
      const source = byId.get(relation.sourceId);
      const target = byId.get(relation.targetId);
      if (!source || !target) return [];
      return [
        {
          ...relation,
          source,
          target,
          fresh: Boolean(source.fresh || target.fresh),
        },
      ];
    });
}
