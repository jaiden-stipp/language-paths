import type { PathNode, TokenChoice, WalkStrategy } from '@/lib/graph/types';

export const walkStrategyLabels: Record<WalkStrategy, string> = {
  'weighted-random': 'Weighted random',
  'most-likely': 'Most likely',
  'least-likely': 'Least likely shown',
  'uniform-random': 'Uniform random',
};

export function chooseWalkToken(
  options: TokenChoice[],
  sampled: TokenChoice,
  strategy: WalkStrategy,
  random: () => number = Math.random,
) {
  if (!options.length || strategy === 'weighted-random') return sampled;
  if (strategy === 'uniform-random') {
    return options[Math.floor(random() * options.length)] ?? sampled;
  }

  let selected = options[0] ?? sampled;
  for (const option of options.slice(1)) {
    const shouldReplace =
      strategy === 'most-likely'
        ? option.probability > selected.probability
        : option.probability < selected.probability;
    if (shouldReplace) selected = option;
  }
  return selected;
}

export function walkStrategyDescription(
  strategy: WalkStrategy,
  branchWidth: number,
) {
  switch (strategy) {
    case 'most-likely':
      return 'Always follow the highest-probability next token.';
    case 'least-likely':
      return `Follow the weakest option among the ${branchWidth} requested alternatives.`;
    case 'uniform-random':
      return 'Give every displayed alternative an equal chance, regardless of probability.';
    default:
      return 'Sample according to the model probabilities—the usual generation behavior.';
  }
}

export function distributionSnapshot(options: TokenChoice[]) {
  const unique = new Map<number, number>();
  for (const option of options) {
    const probability = Number.isFinite(option.probability)
      ? Math.max(0, Math.min(1, option.probability))
      : 0;
    unique.set(option.id, Math.max(unique.get(option.id) ?? 0, probability));
  }
  const distribution = [...unique].map(([tokenId, probability]) => ({
    tokenId,
    probability,
  }));
  const visibleProbabilityMass = Math.min(
    1,
    distribution.reduce((total, point) => total + point.probability, 0),
  );
  return { distribution, visibleProbabilityMass };
}

export function tokenLabel(token: string) {
  if (!token) return '∅';
  return token.replaceAll(' ', '␠').replaceAll('\n', '↵').replaceAll('\t', '⇥');
}

export function percent(value: number) {
  if (value >= 0.1) return `${(value * 100).toFixed(1)}%`;
  if (value >= 0.001) return `${(value * 100).toFixed(2)}%`;
  return '<0.10%';
}

export function probabilityVisualScale(value: number) {
  const clamped = Math.max(0.0001, Math.min(1, value));
  const logarithmicPosition = Math.max(
    0,
    Math.min(1, (Math.log10(clamped) + 4) / 4),
  );
  return Math.pow(logarithmicPosition, 1.75);
}

export function applyTemperaturePreview(
  nodes: PathNode[],
  temperature: number,
) {
  if (Math.abs(temperature - 1) < 0.001) return nodes;
  const children = new Map<string, PathNode[]>();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }

  const previewProbability = new Map<string, number>();
  for (const siblings of children.values()) {
    const weights = siblings.map((node) =>
      Math.pow(Math.max(1e-9, node.conditionalProbability), 1 / temperature),
    );
    const weightTotal = weights.reduce((total, weight) => total + weight, 0);
    const originalMass = siblings.reduce(
      (total, node) => total + node.conditionalProbability,
      0,
    );
    const parentId = siblings[0]?.parentId;
    const parent = parentId ? byId.get(parentId) : undefined;
    const visibleMass = Math.min(
      1,
      parent?.visibleProbabilityMass ?? originalMass,
    );
    siblings.forEach((node, index) => {
      previewProbability.set(
        node.id,
        weightTotal > 0
          ? ((weights[index] ?? 0) / weightTotal) * visibleMass
          : 0,
      );
    });
  }

  return nodes.map((node) => ({
    ...node,
    conditionalProbability:
      previewProbability.get(node.id) ?? node.conditionalProbability,
  }));
}

export function widthForNode(node: PathNode) {
  if (node.id === 'root') return 88;
  return (
    Math.round(
      (30 + probabilityVisualScale(node.conditionalProbability) * 54) * 1000,
    ) / 1000
  );
}

export function heightForNode(node: PathNode) {
  return widthForNode(node);
}
