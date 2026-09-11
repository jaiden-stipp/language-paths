import { branchPath, convergencePath, stableHash } from '@/lib/graph/geometry';
import {
  heightForNode,
  probabilityVisualScale,
  widthForNode,
} from '@/lib/graph/probability';
import type {
  DistributionLink,
  Point,
  PositionedNode,
} from '@/lib/graph/types';

export function createRenderModel({
  nodes,
  similarityLinks,
  selectedPath,
  lineageById,
  spawnOrigins,
}: {
  nodes: PositionedNode[];
  similarityLinks: DistributionLink[];
  selectedPath: Set<string>;
  lineageById: Map<string, number>;
  spawnOrigins: Map<string, Point>;
}) {
  const positionById = new Map(nodes.map((node) => [node.id, node]));
  const nearbyIds = new Set<string>();
  const convergencePeerIds = new Set<string>();
  for (const node of nodes) {
    if (
      node.parentId &&
      selectedPath.has(node.parentId) &&
      !selectedPath.has(node.id)
    ) {
      nearbyIds.add(node.id);
    }
  }
  for (const link of similarityLinks) {
    if (selectedPath.has(link.source.id)) {
      nearbyIds.add(link.target.id);
      convergencePeerIds.add(link.target.id);
    }
    if (selectedPath.has(link.target.id)) {
      nearbyIds.add(link.source.id);
      convergencePeerIds.add(link.source.id);
    }
  }
  const hasSelectedBranch = selectedPath.size > 1;

  const convergenceEdges = similarityLinks.map((link, index) => {
    const isNearby =
      selectedPath.has(link.source.id) ||
      selectedPath.has(link.target.id) ||
      nearbyIds.has(link.source.id) ||
      nearbyIds.has(link.target.id);
    return {
      ...link,
      path: convergencePath(link.source, link.target, index),
      isNearby,
      isDimmed: hasSelectedBranch && !isNearby,
      opacity: 0.12 + link.strength * 0.24,
      strokeWidth: 0.7 + link.strength * 0.8,
    };
  });

  const inactiveEdges: Array<{
    node: PositionedNode;
    path: string;
    lineage: number;
    isNearby: boolean;
    isDimmed: boolean;
    strokeWidth: number;
    opacity: number;
  }> = [];
  const selectedEdges: Array<{
    node: PositionedNode;
    parent: PositionedNode;
    path: string;
    lineage: number;
    coreWidth: number;
    chevronOffsets: number[];
    routeId: string;
  }> = [];

  for (const node of nodes) {
    if (!node.parentId) continue;
    const parent = positionById.get(node.parentId);
    if (!parent) continue;
    const path = branchPath(parent, node);
    const lineage = lineageById.get(node.id) ?? 0;
    const probabilityScale = probabilityVisualScale(
      node.conditionalProbability,
    );
    const baseWidth = 0.4 + Math.pow(probabilityScale, 1.35) * 6.2;
    const isAncestry =
      selectedPath.has(node.id) && selectedPath.has(node.parentId);
    if (!isAncestry) {
      const isNearby =
        selectedPath.has(node.parentId) && nearbyIds.has(node.id);
      inactiveEdges.push({
        node,
        path,
        lineage,
        isNearby,
        isDimmed: hasSelectedBranch && !isNearby,
        strokeWidth: baseWidth,
        opacity: 0.2 + probabilityScale * 0.62,
      });
      continue;
    }

    const distance = Math.hypot(node.x - parent.x, node.y - parent.y);
    selectedEdges.push({
      node,
      parent,
      path,
      lineage,
      coreWidth: baseWidth * 1.65,
      chevronOffsets:
        distance >= 230
          ? [25, 50, 75]
          : distance >= 145
            ? [35, 68]
            : distance >= 96
              ? [52]
              : [],
      routeId: `selected-route-${stableHash(node.id)}`,
    });
  }

  const nodeModels = nodes.map((node) => {
    const currentParent = node.parentId
      ? positionById.get(node.parentId)
      : undefined;
    const oldParent = node.parentId
      ? spawnOrigins.get(node.parentId)
      : undefined;
    const probabilityScale = probabilityVisualScale(
      node.conditionalProbability,
    );
    return {
      node,
      spawnPoint: oldParent ?? currentParent ?? node,
      lineage: lineageById.get(node.id) ?? 0,
      probabilityScale,
      dimmedOpacity: 0.12 + Math.pow(probabilityScale, 1.2) * 0.36,
      nearbyOpacity: 0.64 + Math.pow(probabilityScale, 0.8) * 0.34,
      width: widthForNode(node),
      height: heightForNode(node),
      onPath: selectedPath.has(node.id),
      nearby: nearbyIds.has(node.id),
      convergencePeer: convergencePeerIds.has(node.id),
    };
  });

  return {
    convergenceEdges,
    inactiveEdges,
    selectedEdges,
    nodeModels,
    nearbyIds,
  };
}
