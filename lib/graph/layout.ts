import { hashUnit, SIDE_MARGIN } from '@/lib/graph/geometry';
import { heightForNode, widthForNode } from '@/lib/graph/probability';
import { MAX_LAYOUT_SIMILARITY_LINKS } from '@/lib/graph/similarity';
import type {
  LayoutResult,
  PathNode,
  Point,
  SimilarityRelation,
} from '@/lib/graph/types';

type ForceBody = {
  node: PathNode;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  width: number;
  height: number;
};

export function createLayout(
  nodes: PathNode[],
  similarityRelations: SimilarityRelation[] = [],
  previousPositions: Map<string, Point> = new Map(),
): LayoutResult {
  if (nodes.length === 0) return { nodes: [], width: 700, height: 520 };

  const children = new Map<string, PathNode[]>();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort(
      (a, b) => b.conditionalProbability - a.conditionalProbability,
    );
  }

  const oldRoot = previousPositions.get('root');
  const previousRelative = new Map<string, Point>();
  if (oldRoot) {
    for (const [id, position] of previousPositions) {
      previousRelative.set(id, {
        x: position.x - oldRoot.x,
        y: position.y - oldRoot.y,
      });
    }
  }

  const seededPositions = new Map<string, Point>();
  seededPositions.set('root', { x: 0, y: 0 });
  const queue = [byId.get('root')].filter((node): node is PathNode =>
    Boolean(node),
  );
  while (queue.length) {
    const parent = queue.shift();
    if (!parent) continue;
    const parentPosition = seededPositions.get(parent.id) ?? { x: 0, y: 0 };
    const siblings = children.get(parent.id) ?? [];
    const parentAngle =
      parent.id === 'root'
        ? -Math.PI / 2
        : Math.atan2(parentPosition.y, parentPosition.x);

    siblings.forEach((child, index) => {
      const oldPosition = previousRelative.get(child.id);
      if (oldPosition) {
        seededPositions.set(child.id, oldPosition);
        queue.push(child);
        return;
      }
      const siblingOffset =
        siblings.length > 1 ? (index / (siblings.length - 1) - 0.5) * 1.4 : 0;
      const noise = (hashUnit(child.id) - 0.5) * 0.48;
      const angle =
        parent.id === 'root'
          ? -Math.PI / 2 + (index / Math.max(1, siblings.length)) * Math.PI * 2
          : parentAngle + siblingOffset + noise;
      const probabilityScale = Math.pow(
        Math.max(0.0001, Math.min(1, child.conditionalProbability)),
        0.3,
      );
      const distance =
        parent.id === 'root'
          ? 150 + (1 - probabilityScale) * 24
          : 96 + (1 - probabilityScale) * 28;
      seededPositions.set(child.id, {
        x: parentPosition.x + Math.cos(angle) * distance,
        y: parentPosition.y + Math.sin(angle) * distance,
      });
      queue.push(child);
    });
  }

  const rootChildAnchors = new Map(
    (children.get('root') ?? []).flatMap((child) => {
      const position = seededPositions.get(child.id);
      if (!position) return [];
      const distance = Math.max(1, Math.hypot(position.x, position.y));
      const bounded = Math.min(184, distance);
      return [
        [
          child.id,
          {
            x: (position.x / distance) * bounded,
            y: (position.y / distance) * bounded,
          },
        ] as const,
      ];
    }),
  );

  const bodies: ForceBody[] = nodes.map((node) => {
    const seed = seededPositions.get(node.id) ?? {
      x: (hashUnit(`${node.id}-x`) - 0.5) * 240,
      y: (hashUnit(`${node.id}-y`) - 0.5) * 240,
    };
    return {
      node,
      x: seed.x,
      y: seed.y,
      velocityX: 0,
      velocityY: 0,
      width: widthForNode(node),
      height: heightForNode(node),
    };
  });
  const bodyIndex = new Map(bodies.map((body, index) => [body.node.id, index]));
  const parentLinks = bodies.flatMap((body, index) => {
    if (!body.node.parentId) return [];
    const parentIndex = bodyIndex.get(body.node.parentId);
    return parentIndex === undefined
      ? []
      : [{ source: parentIndex, target: index }];
  });
  const similarityAttractions = similarityRelations
    .slice(0, MAX_LAYOUT_SIMILARITY_LINKS)
    .flatMap((relation) => {
      const source = bodyIndex.get(relation.sourceId);
      const target = bodyIndex.get(relation.targetId);
      return source === undefined || target === undefined
        ? []
        : [{ source, target, strength: relation.strength }];
    });

  const incremental = previousRelative.size > 1;
  const iterations = incremental
    ? Math.min(120, 72 + Math.ceil(Math.sqrt(bodies.length) * 3))
    : Math.min(220, 140 + Math.ceil(Math.sqrt(bodies.length) * 6));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const forceX = Array.from({ length: bodies.length }, () => 0);
    const forceY = Array.from({ length: bodies.length }, () => 0);
    const collisionCellSize = 120;
    const collisionCells = new Map<string, number[]>();
    const cellPositions = bodies.map((body, index) => {
      const cellX = Math.floor(body.x / collisionCellSize);
      const cellY = Math.floor(body.y / collisionCellSize);
      const key = `${cellX}:${cellY}`;
      const occupants = collisionCells.get(key) ?? [];
      occupants.push(index);
      collisionCells.set(key, occupants);
      return { cellX, cellY };
    });

    for (let left = 0; left < bodies.length; left += 1) {
      const cellPosition = cellPositions[left];
      if (!cellPosition) continue;
      const nearbyBodies: number[] = [];
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          nearbyBodies.push(
            ...(collisionCells.get(
              `${cellPosition.cellX + offsetX}:${cellPosition.cellY + offsetY}`,
            ) ?? []),
          );
        }
      }

      for (const right of nearbyBodies) {
        if (right <= left) continue;
        const first = bodies[left];
        const second = bodies[right];
        if (!first || !second) continue;
        let deltaX = second.x - first.x;
        let deltaY = second.y - first.y;
        let distanceSquared = deltaX * deltaX + deltaY * deltaY;
        if (distanceSquared < 0.01) {
          const angle =
            hashUnit(`${first.node.id}-${second.node.id}`) * Math.PI * 2;
          deltaX = Math.cos(angle);
          deltaY = Math.sin(angle);
          distanceSquared = 1;
        }
        const distance = Math.sqrt(distanceSquared);
        const directionX = deltaX / distance;
        const directionY = deltaY / distance;
        const firstRadius = Math.max(first.height / 2, first.width * 0.4);
        const secondRadius = Math.max(second.height / 2, second.width * 0.4);
        const collisionDistance = firstRadius + secondRadius + 18;
        const repulsion = Math.min(0.9, 2400 / distanceSquared);
        const collision =
          distance < collisionDistance
            ? (collisionDistance - distance) * 0.065
            : 0;
        const force = repulsion + collision;
        forceX[left] = (forceX[left] ?? 0) - directionX * force;
        forceY[left] = (forceY[left] ?? 0) - directionY * force;
        forceX[right] = (forceX[right] ?? 0) + directionX * force;
        forceY[right] = (forceY[right] ?? 0) + directionY * force;
      }
    }

    for (const link of parentLinks) {
      const source = bodies[link.source];
      const target = bodies[link.target];
      if (!source || !target) continue;
      const deltaX = target.x - source.x;
      const deltaY = target.y - source.y;
      const distance = Math.max(1, Math.hypot(deltaX, deltaY));
      const probabilityScale = Math.pow(
        Math.max(0.0001, target.node.conditionalProbability),
        0.3,
      );
      const desiredDistance = 88 + (1 - probabilityScale) * 34;
      const force = (distance - desiredDistance) * 0.032;
      const directionX = deltaX / distance;
      const directionY = deltaY / distance;
      forceX[link.source] = (forceX[link.source] ?? 0) + directionX * force;
      forceY[link.source] = (forceY[link.source] ?? 0) + directionY * force;
      forceX[link.target] = (forceX[link.target] ?? 0) - directionX * force;
      forceY[link.target] = (forceY[link.target] ?? 0) - directionY * force;
    }

    for (const link of similarityAttractions) {
      const source = bodies[link.source];
      const target = bodies[link.target];
      if (!source || !target) continue;
      const deltaX = target.x - source.x;
      const deltaY = target.y - source.y;
      const distance = Math.max(1, Math.hypot(deltaX, deltaY));
      const force = (distance - 150) * 0.004 * link.strength;
      const directionX = deltaX / distance;
      const directionY = deltaY / distance;
      forceX[link.source] = (forceX[link.source] ?? 0) + directionX * force;
      forceY[link.source] = (forceY[link.source] ?? 0) + directionY * force;
      forceX[link.target] = (forceX[link.target] ?? 0) - directionX * force;
      forceY[link.target] = (forceY[link.target] ?? 0) - directionY * force;
    }

    bodies.forEach((body, index) => {
      if (body.node.id === 'root') {
        body.x = 0;
        body.y = 0;
        body.velocityX = 0;
        body.velocityY = 0;
        return;
      }
      const rootChildAnchor = rootChildAnchors.get(body.node.id);
      if (rootChildAnchor) {
        forceX[index] =
          (forceX[index] ?? 0) + (rootChildAnchor.x - body.x) * 0.18;
        forceY[index] =
          (forceY[index] ?? 0) + (rootChildAnchor.y - body.y) * 0.18;
      }
      forceX[index] = (forceX[index] ?? 0) - body.x * 0.0012;
      forceY[index] = (forceY[index] ?? 0) - body.y * 0.0012;
      body.velocityX = (body.velocityX + (forceX[index] ?? 0)) * 0.76;
      body.velocityY = (body.velocityY + (forceY[index] ?? 0)) * 0.76;
      const speed = Math.max(1, Math.hypot(body.velocityX, body.velocityY));
      if (speed > 12) {
        body.velocityX = (body.velocityX / speed) * 12;
        body.velocityY = (body.velocityY / speed) * 12;
      }
      body.x += body.velocityX;
      body.y += body.velocityY;
      if (rootChildAnchor) {
        const driftX = body.x - rootChildAnchor.x;
        const driftY = body.y - rootChildAnchor.y;
        const drift = Math.hypot(driftX, driftY);
        if (drift > 30) {
          body.x = rootChildAnchor.x + (driftX / drift) * 30;
          body.y = rootChildAnchor.y + (driftY / drift) * 30;
          body.velocityX *= 0.35;
          body.velocityY *= 0.35;
        }
      }
    });
  }

  const leftEdge = Math.min(...bodies.map((body) => body.x - body.width / 2));
  const rightEdge = Math.max(...bodies.map((body) => body.x + body.width / 2));
  const topEdge = Math.min(...bodies.map((body) => body.y - body.height / 2));
  const bottomEdge = Math.max(
    ...bodies.map((body) => body.y + body.height / 2),
  );
  const contentWidth = Math.max(1, rightEdge - leftEdge);
  const contentHeight = Math.max(1, bottomEdge - topEdge);
  const width = Math.max(700, contentWidth + SIDE_MARGIN * 2);
  const height = Math.max(520, contentHeight + SIDE_MARGIN * 2);
  const offsetX = (width - contentWidth) / 2 - leftEdge;
  const offsetY = (height - contentHeight) / 2 - topEdge;
  const positioned = bodies.map((body) => ({
    ...body.node,
    x: Math.round((body.x + offsetX) * 1000) / 1000,
    y: Math.round((body.y + offsetY) * 1000) / 1000,
  }));
  return {
    nodes: positioned,
    width: Math.round(width * 1000) / 1000,
    height: Math.round(height * 1000) / 1000,
  };
}
