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

const TAU = Math.PI * 2;

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function alternativeOffset(index: number) {
  const lane = Math.floor(index / 2) + 1;
  const side = index % 2 === 0 ? -1 : 1;
  return side * Math.min(0.78, 0.16 + lane * 0.17);
}

function previousLayoutImbalance(positions: Map<string, Point>) {
  const points = [...positions.entries()]
    .filter(([id]) => id !== 'root')
    .map(([, point]) => point);
  if (points.length < 4) return 0;
  const minimumX = Math.min(...points.map((point) => point.x));
  const maximumX = Math.max(...points.map((point) => point.x));
  const minimumY = Math.min(...points.map((point) => point.y));
  const maximumY = Math.max(...points.map((point) => point.y));
  const positiveX = Math.max(1, maximumX);
  const negativeX = Math.max(1, -minimumX);
  const positiveY = Math.max(1, maximumY);
  const negativeY = Math.max(1, -minimumY);
  const horizontal =
    Math.abs(positiveX - negativeX) / Math.max(positiveX + negativeX, 1);
  const vertical =
    Math.abs(positiveY - negativeY) / Math.max(positiveY + negativeY, 1);
  const radii = points
    .map((point) => Math.hypot(point.x, point.y))
    .sort((left, right) => left - right);
  const outerRadius = radii[Math.floor(radii.length * 0.8)] ?? 1;
  const interiorShare =
    radii.filter((radius) => radius < outerRadius * 0.34).length / radii.length;
  const hollowCenter = clamp((0.16 - interiorShare) / 0.16, 0, 1);
  return clamp(Math.max(horizontal, vertical, hollowCenter * 0.72), 0, 1);
}

export function createLayout(
  nodes: PathNode[],
  similarityRelations: SimilarityRelation[] = [],
  previousPositions: Map<string, Point> = new Map(),
  selectedPath: Set<string> = new Set(['root']),
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
  const seededHeadings = new Map<string, number>();
  const seededCurvature = new Map<string, number>();
  seededPositions.set('root', { x: 0, y: 0 });
  const queue = [byId.get('root')].filter((node): node is PathNode =>
    Boolean(node),
  );
  while (queue.length) {
    const parent = queue.shift();
    if (!parent) continue;
    const parentPosition = seededPositions.get(parent.id) ?? { x: 0, y: 0 };
    const siblings = children.get(parent.id) ?? [];
    const parentHeading = seededHeadings.get(parent.id) ?? -Math.PI / 2;
    const parentCurvature = seededCurvature.get(parent.id) ?? 0;
    const selectedChildIndex = siblings.findIndex((child) =>
      selectedPath.has(child.id),
    );
    let alternativeIndex = 0;

    siblings.forEach((child, index) => {
      const followsSelectedPath = selectedPath.has(child.id);
      const childAlternativeIndex =
        parent.id !== 'root' && selectedChildIndex >= 0 && !followsSelectedPath
          ? alternativeIndex++
          : -1;
      const oldPosition = previousRelative.get(child.id);
      if (oldPosition) {
        seededPositions.set(child.id, oldPosition);
        const oldHeading = Math.atan2(
          oldPosition.y - parentPosition.y,
          oldPosition.x - parentPosition.x,
        );
        seededHeadings.set(child.id, oldHeading);
        seededCurvature.set(
          child.id,
          clamp(normalizeAngle(oldHeading - parentHeading), -0.14, 0.14),
        );
        queue.push(child);
        return;
      }
      const siblingOffset =
        parent.id === 'root'
          ? (index / Math.max(1, siblings.length)) * TAU
          : selectedChildIndex >= 0
            ? followsSelectedPath
              ? 0
              : alternativeOffset(childAlternativeIndex)
            : siblings.length > 1
              ? (index / (siblings.length - 1) - 0.5) * 1.08
              : 0;
      const curvatureNoise = (hashUnit(`${child.id}-curve`) - 0.5) * 0.055;
      const curvature = clamp(
        parentCurvature * 0.82 + curvatureNoise,
        -0.12,
        0.12,
      );
      const headingNoise = (hashUnit(child.id) - 0.5) * 0.18;
      const angle =
        parent.id === 'root'
          ? -Math.PI / 2 + siblingOffset
          : parentHeading + curvature + siblingOffset + headingNoise;
      const probabilityScale = Math.pow(
        Math.max(0.0001, Math.min(1, child.conditionalProbability)),
        0.3,
      );
      const distance =
        parent.id === 'root'
          ? 116 + (1 - probabilityScale) * 22
          : 96 + (1 - probabilityScale) * 28;
      seededPositions.set(child.id, {
        x: parentPosition.x + Math.cos(angle) * distance,
        y: parentPosition.y + Math.sin(angle) * distance,
      });
      seededHeadings.set(child.id, angle);
      seededCurvature.set(child.id, curvature);
      queue.push(child);
    });
  }

  const rootChildAnchors = new Map(
    (children.get('root') ?? []).flatMap((child) => {
      const position = seededPositions.get(child.id);
      if (!position) return [];
      const distance = Math.max(1, Math.hypot(position.x, position.y));
      const bounded = Math.min(142, distance);
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
  const localAlternativeOffsets = new Map<string, Point>();
  for (const body of bodies) {
    const parentId = body.node.parentId;
    if (
      !parentId ||
      !selectedPath.has(parentId) ||
      selectedPath.has(body.node.id)
    )
      continue;
    const parentPosition = seededPositions.get(parentId);
    const childPosition = seededPositions.get(body.node.id);
    if (!parentPosition || !childPosition) continue;
    localAlternativeOffsets.set(body.node.id, {
      x: childPosition.x - parentPosition.x,
      y: childPosition.y - parentPosition.y,
    });
  }

  const incremental = previousRelative.size > 1;
  const imbalance = incremental ? previousLayoutImbalance(previousRelative) : 0;
  const iterations = incremental
    ? Math.min(
        180,
        84 +
          Math.ceil(Math.sqrt(bodies.length) * 3) +
          Math.round(imbalance * 56),
      )
    : Math.min(220, 140 + Math.ceil(Math.sqrt(bodies.length) * 6));
  const stabilityStrength = incremental ? 0.017 - imbalance * 0.011 : 0;
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
          (forceX[index] ?? 0) + (rootChildAnchor.x - body.x) * 0.052;
        forceY[index] =
          (forceY[index] ?? 0) + (rootChildAnchor.y - body.y) * 0.052;
      }
      const localOffset = localAlternativeOffsets.get(body.node.id);
      const parentIndex = body.node.parentId
        ? bodyIndex.get(body.node.parentId)
        : undefined;
      const parentBody =
        parentIndex === undefined ? undefined : bodies[parentIndex];
      if (localOffset && parentBody) {
        forceX[index] =
          (forceX[index] ?? 0) +
          (parentBody.x + localOffset.x - body.x) * 0.012;
        forceY[index] =
          (forceY[index] ?? 0) +
          (parentBody.y + localOffset.y - body.y) * 0.012;
      }
      const previous = previousRelative.get(body.node.id);
      if (previous && stabilityStrength > 0) {
        forceX[index] =
          (forceX[index] ?? 0) + (previous.x - body.x) * stabilityStrength;
        forceY[index] =
          (forceY[index] ?? 0) + (previous.y - body.y) * stabilityStrength;
      }
      const offPath = !selectedPath.has(body.node.id);
      const centerStrength = offPath ? 0.00145 : 0;
      forceX[index] = (forceX[index] ?? 0) - body.x * centerStrength;
      forceY[index] = (forceY[index] ?? 0) - body.y * centerStrength;
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
        if (drift > 82) {
          body.x = rootChildAnchor.x + (driftX / drift) * 82;
          body.y = rootChildAnchor.y + (driftY / drift) * 82;
          body.velocityX *= 0.58;
          body.velocityY *= 0.58;
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
