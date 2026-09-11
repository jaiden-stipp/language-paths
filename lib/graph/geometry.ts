import { widthForNode } from '@/lib/graph/probability';
import type { PathNode, PositionedNode } from '@/lib/graph/types';

export const SIDE_MARGIN = 48;
export const LINEAGE_COUNT = 6;
export const MIN_ZOOM = 0.06;
export const MAX_ZOOM = 2.4;

export function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hashUnit(value: string) {
  return stableHash(value) / 4294967295;
}

export function createLineageMap(nodes: PathNode[]) {
  const lineageById = new Map<string, number>();
  const children = new Map<string, PathNode[]>();

  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }

  const rootChildren = [...(children.get('root') ?? [])].sort(
    (a, b) => b.conditionalProbability - a.conditionalProbability,
  );
  lineageById.set('root', -1);

  rootChildren.forEach((rootChild, index) => {
    const lineage = index % LINEAGE_COUNT;
    const stack = [rootChild];
    while (stack.length) {
      const current = stack.pop();
      if (!current) continue;
      lineageById.set(current.id, lineage);
      stack.push(...(children.get(current.id) ?? []));
    }
  });

  return lineageById;
}

export function convergencePath(
  source: PositionedNode,
  target: PositionedNode,
  index: number,
) {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const normalX = -deltaY / distance;
  const normalY = deltaX / distance;
  const direction = index % 2 === 0 ? 1 : -1;
  const arc = Math.min(112, Math.max(42, distance * 0.16)) * direction;
  const middleX = (source.x + target.x) / 2 + normalX * arc;
  const middleY = (source.y + target.y) / 2 + normalY * arc;
  return `M ${source.x} ${source.y} Q ${middleX} ${middleY}, ${target.x} ${target.y}`;
}

export function branchPath(source: PositionedNode, target: PositionedNode) {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const directionX = deltaX / distance;
  const directionY = deltaY / distance;
  const normalX = -deltaY / distance;
  const normalY = deltaX / distance;
  const direction = stableHash(target.id) % 2 === 0 ? 1 : -1;
  const arc = Math.min(24, distance * 0.1) * direction;
  const sourceRadius = widthForNode(source) / 2 + 2;
  const targetRadius = widthForNode(target) / 2 + 5;
  const startX = source.x + directionX * sourceRadius;
  const startY = source.y + directionY * sourceRadius;
  const endX = target.x - directionX * targetRadius;
  const endY = target.y - directionY * targetRadius;
  const middleX = (startX + endX) / 2 + normalX * arc;
  const middleY = (startY + endY) / 2 + normalY * arc;
  return `M ${startX} ${startY} Q ${middleX} ${middleY}, ${endX} ${endY}`;
}
