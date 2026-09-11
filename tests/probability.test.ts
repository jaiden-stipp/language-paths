import { describe, expect, it } from 'vitest';

import {
  applyTemperaturePreview,
  chooseWalkToken,
  distributionSnapshot,
  percent,
  probabilityVisualScale,
  tokenLabel,
  widthForNode,
} from '@/lib/graph/probability';
import type { PathNode, TokenChoice } from '@/lib/graph/types';

const options: TokenChoice[] = [
  { id: 1, token: ' a', probability: 0.6 },
  { id: 2, token: ' b', probability: 0.3 },
  { id: 3, token: ' c', probability: 0.1 },
];

describe('sampling strategies', () => {
  it('preserves the server sample for weighted random', () => {
    expect(chooseWalkToken(options, options[1], 'weighted-random')).toBe(
      options[1],
    );
  });

  it('selects the most and least likely displayed choices', () => {
    expect(chooseWalkToken(options, options[1], 'most-likely').id).toBe(1);
    expect(chooseWalkToken(options, options[1], 'least-likely').id).toBe(3);
  });

  it('supports deterministic uniform random selection for tests', () => {
    expect(
      chooseWalkToken(options, options[0], 'uniform-random', () => 0.99).id,
    ).toBe(3);
  });
});

describe('probability views', () => {
  it('creates a strong but bounded visual hierarchy', () => {
    const nodeAt = (probability: number): PathNode => ({
      id: `node-${probability}`,
      parentId: 'root',
      depth: 1,
      token: ' token',
      tokenId: 1,
      conditionalProbability: probability,
      cumulativeProbability: probability,
      expanded: false,
    });

    expect(probabilityVisualScale(0.5)).toBeGreaterThan(
      probabilityVisualScale(0.1),
    );
    expect(probabilityVisualScale(0.1)).toBeGreaterThan(
      probabilityVisualScale(0.01),
    );
    expect(
      widthForNode(nodeAt(0.5)) - widthForNode(nodeAt(0.01)),
    ).toBeGreaterThan(25);
    expect(widthForNode(nodeAt(1))).toBeLessThanOrEqual(84);
    expect(widthForNode(nodeAt(0))).toBeGreaterThanOrEqual(30);
  });

  it('deduplicates tokens and reports visible and hidden mass', () => {
    const snapshot = distributionSnapshot([
      ...options,
      { id: 2, token: ' b', probability: 0.2 },
    ]);
    expect(snapshot.distribution).toHaveLength(3);
    expect(snapshot.visibleProbabilityMass).toBeCloseTo(1);
    expect(1 - snapshot.visibleProbabilityMass).toBeCloseTo(0);
  });

  it('preserves measured visible mass while sharpening temperature', () => {
    const root: PathNode = {
      id: 'root',
      parentId: null,
      depth: 0,
      token: 'CONTEXT',
      tokenId: null,
      conditionalProbability: 1,
      cumulativeProbability: 1,
      expanded: true,
      visibleProbabilityMass: 0.8,
    };
    const nodes = [
      root,
      ...options.map(
        (option, index): PathNode => ({
          id: `child-${index}`,
          parentId: 'root',
          depth: 1,
          token: option.token,
          tokenId: option.id,
          conditionalProbability: option.probability * 0.8,
          cumulativeProbability: option.probability * 0.8,
          expanded: false,
        }),
      ),
    ];
    const preview = applyTemperaturePreview(nodes, 0.5).slice(1);
    expect(
      preview.reduce((sum, node) => sum + node.conditionalProbability, 0),
    ).toBeCloseTo(0.8);
    expect(preview[0]?.conditionalProbability).toBeGreaterThan(
      nodes[1]?.conditionalProbability ?? 0,
    );
  });
});

describe('token formatting', () => {
  it('makes whitespace boundaries visible', () => {
    expect(tokenLabel(' a\n\t')).toBe('␠a↵⇥');
  });

  it('uses extra precision for small probabilities', () => {
    expect(percent(0.31)).toBe('31.0%');
    expect(percent(0.009)).toBe('0.90%');
    expect(percent(0.0001)).toBe('<0.10%');
  });
});
