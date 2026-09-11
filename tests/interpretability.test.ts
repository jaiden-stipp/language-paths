import { describe, expect, it } from 'vitest';

import {
  createStepClusters,
  distributionDescription,
  distributionEntropy,
  semanticZoomLevel,
} from '@/lib/graph/interpretability';
import type { PositionedNode } from '@/lib/graph/types';

function positionedNode(
  id: string,
  parentId: string | null,
  probability: number,
  x: number,
  y: number,
): PositionedNode {
  return {
    id,
    parentId,
    depth: parentId ? 1 : 0,
    token: id,
    tokenId: parentId ? id.length : null,
    conditionalProbability: probability,
    cumulativeProbability: probability,
    expanded: id === 'root',
    x,
    y,
  };
}

describe('interpretability views', () => {
  it('switches semantic detail at stable zoom thresholds', () => {
    expect(semanticZoomLevel(0.2)).toBe('overview');
    expect(semanticZoomLevel(0.5)).toBe('focus');
    expect(semanticZoomLevel(1)).toBe('detail');
  });

  it('describes concentrated and uncertain visible distributions', () => {
    const concentrated = [0.9, 0.05, 0.03, 0.02].map(
      (conditionalProbability) => ({ conditionalProbability }),
    );
    const uniform = [0.25, 0.25, 0.25, 0.25].map((conditionalProbability) => ({
      conditionalProbability,
    }));
    expect(distributionEntropy(uniform)).toBeCloseTo(2);
    expect(distributionDescription(concentrated)).toBe('one clear favorite');
    expect(distributionDescription(uniform)).toBe(
      'many similarly likely continuations',
    );
  });

  it('combines off-path siblings into a probability-mass step cluster', () => {
    const nodes = [
      positionedNode('root', null, 1, 0, 0),
      positionedNode('chosen', 'root', 0.5, 100, 0),
      positionedNode('alternative-a', 'root', 0.3, -80, 60),
      positionedNode('alternative-b', 'root', 0.1, -90, -60),
    ];
    const clusters = createStepClusters(
      nodes,
      new Set(['root', 'chosen']),
      new Map([
        ['root', -1],
        ['chosen', 0],
        ['alternative-a', 1],
        ['alternative-b', 2],
      ]),
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      parentId: 'root',
      depth: 1,
      count: 2,
      lineage: 1,
    });
    expect(clusters[0]?.probabilityMass).toBeCloseTo(0.4);
    expect(clusters[0]?.entropy).toBeGreaterThan(1);
  });
});
