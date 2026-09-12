import { describe, expect, it } from 'vitest';

import { demoNodes } from '@/lib/graph/demo-data';
import { createLineageMap } from '@/lib/graph/geometry';
import { createLayout } from '@/lib/graph/layout';
import { createRenderModel } from '@/lib/graph/render-model';
import {
  createDistributionLinks,
  createSimilarityRelations,
} from '@/lib/graph/similarity';
import type { PathNode } from '@/lib/graph/types';

describe('graph layout', () => {
  it('is deterministic and keeps first-token nodes close to the root', () => {
    const relations = createSimilarityRelations(demoNodes);
    const first = createLayout(demoNodes, relations);
    const second = createLayout(demoNodes, relations);
    expect(second).toEqual(first);
    const byId = new Map(first.nodes.map((node) => [node.id, node]));
    const root = byId.get('root');
    expect(root).toBeDefined();
    if (!root) return;
    for (const node of first.nodes.filter(
      (candidate) => candidate.parentId === 'root',
    )) {
      expect(Math.hypot(node.x - root.x, node.y - root.y)).toBeLessThanOrEqual(
        215,
      );
    }
  });

  it('reuses one similarity graph for forces, links, and render records', () => {
    const relations = createSimilarityRelations(demoNodes);
    const layout = createLayout(demoNodes, relations);
    const links = createDistributionLinks(layout.nodes, relations);
    const selectedPath = new Set(['root', 'demo-human', 'demo-and']);
    const model = createRenderModel({
      nodes: layout.nodes,
      similarityLinks: links,
      selectedPath,
      lineageById: createLineageMap(demoNodes),
      spawnOrigins: new Map(),
    });
    expect(model.selectedEdges.map((edge) => edge.node.id)).toEqual([
      'demo-human',
      'demo-and',
    ]);
    expect(model.nodeModels).toHaveLength(layout.nodes.length);
    expect(model.stepClusters.length).toBeGreaterThan(0);
    expect(
      model.nodeModels.some(
        (entry) => entry.directAlternative && entry.alternativeRank > 0,
      ),
    ).toBe(true);
    const highProbability = model.nodeModels.find(
      (entry) => entry.node.id === 'demo-meaning',
    );
    const lowProbability = model.nodeModels.find(
      (entry) => entry.node.id === 'demo-context',
    );
    expect(highProbability?.dimmedOpacity).toBeGreaterThan(
      lowProbability?.dimmedOpacity ?? 1,
    );
    expect(highProbability?.nearbyOpacity).toBeGreaterThan(
      lowProbability?.nearbyOpacity ?? 1,
    );
  });

  it('keeps alternatives local while the selected route curves gradually', () => {
    const nodes: PathNode[] = [
      {
        id: 'root',
        parentId: null,
        depth: 0,
        token: 'context',
        tokenId: null,
        conditionalProbability: 1,
        cumulativeProbability: 1,
        expanded: true,
      },
    ];
    const selectedPath = new Set(['root']);
    let parentId = 'root';
    for (let step = 0; step < 18; step += 1) {
      for (let alternative = 0; alternative < 5; alternative += 1) {
        const id = `organic-${step}-${alternative}`;
        nodes.push({
          id,
          parentId,
          depth: step + 1,
          token: id,
          tokenId: step * 5 + alternative,
          conditionalProbability: 0.42 / (alternative + 1),
          cumulativeProbability: 0.42 ** (step + 1),
          expanded: alternative === 0,
        });
        if (alternative === 0) selectedPath.add(id);
      }
      parentId = `organic-${step}-0`;
    }

    const layout = createLayout(nodes, [], new Map(), selectedPath);
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    const alternativeDistances = layout.nodes.flatMap((node) => {
      if (!node.parentId || selectedPath.has(node.id)) return [];
      const parent = byId.get(node.parentId);
      return parent ? [Math.hypot(node.x - parent.x, node.y - parent.y)] : [];
    });
    expect(Math.max(...alternativeDistances)).toBeLessThan(220);

    const turns: number[] = [];
    for (let step = 2; step < 18; step += 1) {
      const grandparent = byId.get(`organic-${step - 2}-0`);
      const parent = byId.get(`organic-${step - 1}-0`);
      const child = byId.get(`organic-${step}-0`);
      if (!grandparent || !parent || !child) continue;
      const incoming = Math.atan2(
        parent.y - grandparent.y,
        parent.x - grandparent.x,
      );
      const outgoing = Math.atan2(child.y - parent.y, child.x - parent.x);
      turns.push(
        Math.abs(
          Math.atan2(
            Math.sin(outgoing - incoming),
            Math.cos(outgoing - incoming),
          ),
        ),
      );
    }
    expect(turns.some((turn) => turn > 0.025)).toBe(true);
    expect(
      turns.reduce((sum, turn) => sum + turn, 0) / turns.length,
    ).toBeLessThan(0.8);
  });

  it.each([1, 100, 250])(
    'lays out a %i-step, eight-alternative expansion off the UI thread',
    (steps) => {
      const nodes: PathNode[] = [
        {
          id: 'root',
          parentId: null,
          depth: 0,
          token: 'CURRENT CONTEXT',
          tokenId: null,
          conditionalProbability: 1,
          cumulativeProbability: 1,
          expanded: true,
        },
      ];
      let parentId = 'root';
      let cumulativeProbability = 1;
      for (let step = 0; step < steps; step += 1) {
        for (let alternative = 0; alternative < 8; alternative += 1) {
          const probability = 0.32 / (alternative + 1);
          nodes.push({
            id: `perf-${step}-${alternative}`,
            parentId,
            depth: step + 1,
            token: ` ${step}:${alternative}`,
            tokenId: 20_000 + step * 8 + alternative,
            conditionalProbability: probability,
            cumulativeProbability: cumulativeProbability * probability,
            expanded: alternative === 0 && step < steps - 1,
          });
        }
        parentId = `perf-${step}-0`;
        cumulativeProbability *= 0.32;
      }

      const start = performance.now();
      const initial = createLayout(nodes, []);
      const previous = new Map(
        initial.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
      );
      createLayout(nodes, [], previous);
      expect(performance.now() - start).toBeLessThan(10_000);
    },
    15_000,
  );
});
