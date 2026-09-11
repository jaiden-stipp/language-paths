import { describe, expect, it } from 'vitest';

import {
  createSimilarityRelations,
  distributionSimilarity,
} from '@/lib/graph/similarity';
import type { PathNode } from '@/lib/graph/types';

describe('distribution similarity', () => {
  it('uses cosine similarity and reports shared tokens', () => {
    const result = distributionSimilarity(
      [
        { tokenId: 1, probability: 0.8 },
        { tokenId: 2, probability: 0.2 },
      ],
      [
        { tokenId: 1, probability: 0.4 },
        { tokenId: 3, probability: 0.6 },
      ],
    );
    expect(result.sharedTokens).toBe(1);
    expect(result.similarity).toBeGreaterThan(0.5);
    expect(result.similarity).toBeLessThan(1);
  });

  it('builds each qualifying relation once in stable order', () => {
    const makeNode = (
      id: string,
      distribution: PathNode['distribution'],
    ): PathNode => ({
      id,
      parentId: 'root',
      depth: 1,
      token: id,
      tokenId: id.charCodeAt(0),
      conditionalProbability: 0.2,
      cumulativeProbability: 0.2,
      expanded: true,
      distribution,
    });
    const relations = createSimilarityRelations([
      makeNode('a', [{ tokenId: 1, probability: 0.7 }]),
      makeNode('b', [{ tokenId: 1, probability: 0.6 }]),
      makeNode('c', [{ tokenId: 2, probability: 0.9 }]),
    ]);
    expect(relations).toHaveLength(1);
    expect(relations[0]?.id).toBe('a--b');
    expect(relations[0]?.strength).toBe(1);
  });
});
