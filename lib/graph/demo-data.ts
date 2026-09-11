import { distributionSnapshot } from '@/lib/graph/probability';
import type { PathNode } from '@/lib/graph/types';

export const DEFAULT_PROMPT = 'Language is a map of';

export function createDemoNodes(): PathNode[] {
  const root: PathNode = {
    id: 'root',
    parentId: null,
    depth: 0,
    token: 'CURRENT CONTEXT',
    tokenId: null,
    conditionalProbability: 1,
    cumulativeProbability: 1,
    expanded: true,
  };
  const seeds: Array<{
    id: string;
    parentId: string;
    token: string;
    probability: number;
    tokenId: number;
  }> = [
    {
      id: 'demo-meaning',
      parentId: 'root',
      token: ' meaning',
      probability: 0.34,
      tokenId: 6210,
    },
    {
      id: 'demo-the',
      parentId: 'root',
      token: ' the',
      probability: 0.23,
      tokenId: 279,
    },
    {
      id: 'demo-human',
      parentId: 'root',
      token: ' human',
      probability: 0.12,
      tokenId: 3820,
    },
    {
      id: 'demo-possible',
      parentId: 'root',
      token: ' possible',
      probability: 0.08,
      tokenId: 3304,
    },
    {
      id: 'demo-ideas',
      parentId: 'root',
      token: ' ideas',
      probability: 0.05,
      tokenId: 6847,
    },
    {
      id: 'demo-understand',
      parentId: 'demo-meaning',
      token: ' understand',
      probability: 0.042,
      tokenId: 2568,
    },
    {
      id: 'demo-interpret',
      parentId: 'demo-meaning',
      token: ' interpret',
      probability: 0.033,
      tokenId: 7412,
    },
    {
      id: 'demo-context',
      parentId: 'demo-meaning',
      token: ' context',
      probability: 0.026,
      tokenId: 1967,
    },
    {
      id: 'demo-a',
      parentId: 'demo-the',
      token: ' a',
      probability: 0.041,
      tokenId: 264,
    },
    {
      id: 'demo-this',
      parentId: 'demo-the',
      token: ' this',
      probability: 0.027,
      tokenId: 420,
    },
    {
      id: 'demo-an',
      parentId: 'demo-the',
      token: ' an',
      probability: 0.019,
      tokenId: 459,
    },
    {
      id: 'demo-and',
      parentId: 'demo-human',
      token: ' and',
      probability: 0.22,
      tokenId: 323,
    },
    {
      id: 'demo-meaning-2',
      parentId: 'demo-human',
      token: ' meaning',
      probability: 0.074,
      tokenId: 6210,
    },
    {
      id: 'demo-itself',
      parentId: 'demo-possible',
      token: ' itself',
      probability: 0.09,
      tokenId: 4335,
    },
    {
      id: 'demo-context-2',
      parentId: 'demo-possible',
      token: ' context',
      probability: 0.046,
      tokenId: 1967,
    },
    {
      id: 'demo-solution',
      parentId: 'demo-ideas',
      token: ' solution',
      probability: 0.028,
      tokenId: 16509,
    },
    {
      id: 'demo-approach',
      parentId: 'demo-ideas',
      token: ' approach',
      probability: 0.021,
      tokenId: 5603,
    },
    {
      id: 'demo-and-2',
      parentId: 'demo-ideas',
      token: ' and',
      probability: 0.067,
      tokenId: 323,
    },
    {
      id: 'demo-the-2',
      parentId: 'demo-and',
      token: ' the',
      probability: 0.068,
      tokenId: 279,
    },
    {
      id: 'demo-or',
      parentId: 'demo-and',
      token: ' or',
      probability: 0.024,
      tokenId: 477,
    },
    {
      id: 'demo-that',
      parentId: 'demo-itself',
      token: ' that',
      probability: 0.14,
      tokenId: 430,
    },
    {
      id: 'demo-etc',
      parentId: 'demo-itself',
      token: ' etc',
      probability: 0.031,
      tokenId: 6087,
    },
  ];
  const parentsWithChildren = new Set(seeds.map((seed) => seed.parentId));
  const result = [root];

  for (const seed of seeds) {
    const parent = result.find((node) => node.id === seed.parentId);
    if (!parent) continue;
    result.push({
      id: seed.id,
      parentId: seed.parentId,
      depth: parent.depth + 1,
      token: seed.token,
      tokenId: seed.tokenId,
      conditionalProbability: seed.probability,
      cumulativeProbability: parent.cumulativeProbability * seed.probability,
      expanded: parentsWithChildren.has(seed.id),
    });
  }

  return result.map((node) => {
    const childNodes = result.filter(
      (candidate) => candidate.parentId === node.id,
    );
    if (!childNodes.length) return node;
    return {
      ...node,
      ...distributionSnapshot(
        childNodes.map((child) => ({
          id: child.tokenId ?? -1,
          token: child.token,
          probability: child.conditionalProbability,
        })),
      ),
    };
  });
}

export const demoNodes = createDemoNodes();
