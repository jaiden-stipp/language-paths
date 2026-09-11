import type { GraphSnapshot, PathNode, TokenChoice } from '@/lib/graph/types';

export type GraphAction =
  | { type: 'replace'; nodes: PathNode[] }
  | { type: 'replace-snapshot'; snapshot: GraphSnapshot }
  | { type: 'patch'; id: string; patch: Partial<PathNode> }
  | { type: 'append'; nodes: PathNode[] }
  | {
      type: 'expand';
      id: string;
      patch: Partial<PathNode>;
      children: PathNode[];
    };

export function createGraphSnapshot(nodes: PathNode[]): GraphSnapshot {
  const nodesById = new Map<string, PathNode>();
  const childrenByParent = new Map<string, string[]>();
  const order: string[] = [];

  for (const node of nodes) {
    if (nodesById.has(node.id)) continue;
    nodesById.set(node.id, node);
    order.push(node.id);
    if (node.parentId) {
      const children = childrenByParent.get(node.parentId) ?? [];
      children.push(node.id);
      childrenByParent.set(node.parentId, children);
    }
  }
  return { nodesById, childrenByParent, order };
}

export function graphReducer(state: GraphSnapshot, action: GraphAction) {
  if (action.type === 'replace') return createGraphSnapshot(action.nodes);
  if (action.type === 'replace-snapshot') return action.snapshot;

  const nodesById = new Map(state.nodesById);
  const childrenByParent = new Map(state.childrenByParent);
  const order = [...state.order];

  if (action.type === 'patch') {
    const node = nodesById.get(action.id);
    if (!node) return state;
    nodesById.set(action.id, { ...node, ...action.patch });
    return { nodesById, childrenByParent, order };
  }

  if (action.type === 'expand') {
    const node = nodesById.get(action.id);
    if (node) nodesById.set(action.id, { ...node, ...action.patch });
  }

  const appended = action.type === 'expand' ? action.children : action.nodes;
  for (const node of appended) {
    if (nodesById.has(node.id)) continue;
    nodesById.set(node.id, node);
    order.push(node.id);
    if (node.parentId) {
      const children = [...(childrenByParent.get(node.parentId) ?? [])];
      children.push(node.id);
      childrenByParent.set(node.parentId, children);
    }
  }
  return { nodesById, childrenByParent, order };
}

export function snapshotNodes(snapshot: GraphSnapshot) {
  return snapshot.order.flatMap((id) => {
    const node = snapshot.nodesById.get(id);
    return node ? [node] : [];
  });
}

export class GraphBuilder {
  private readonly nodesById: Map<string, PathNode>;
  private readonly childrenByParent: Map<string, string[]>;
  private readonly order: string[];

  constructor(snapshot: GraphSnapshot) {
    this.nodesById = new Map(snapshot.nodesById);
    this.childrenByParent = new Map(
      [...snapshot.childrenByParent].map(([id, children]) => [
        id,
        [...children],
      ]),
    );
    this.order = [...snapshot.order];
  }

  get(id: string) {
    return this.nodesById.get(id);
  }

  getChildren(parentId: string) {
    return (this.childrenByParent.get(parentId) ?? []).flatMap((id) => {
      const node = this.nodesById.get(id);
      return node ? [node] : [];
    });
  }

  getPathTokenIds(nodeId: string) {
    const ids: number[] = [];
    const visited = new Set<string>();
    let cursor = this.nodesById.get(nodeId);
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      if (cursor.tokenId !== null) ids.unshift(cursor.tokenId);
      cursor = cursor.parentId
        ? this.nodesById.get(cursor.parentId)
        : undefined;
    }
    return ids;
  }

  patch(id: string, patch: Partial<PathNode>) {
    const node = this.nodesById.get(id);
    if (node) this.nodesById.set(id, { ...node, ...patch });
  }

  append(nodes: PathNode[]) {
    for (const node of nodes) {
      if (this.nodesById.has(node.id)) continue;
      this.nodesById.set(node.id, node);
      this.order.push(node.id);
      if (node.parentId) {
        const children = this.childrenByParent.get(node.parentId) ?? [];
        children.push(node.id);
        this.childrenByParent.set(node.parentId, children);
      }
    }
  }

  snapshot(): GraphSnapshot {
    return {
      nodesById: new Map(this.nodesById),
      childrenByParent: new Map(
        [...this.childrenByParent].map(([id, children]) => [id, [...children]]),
      ),
      order: [...this.order],
    };
  }
}

export function getPathNodes(snapshot: GraphSnapshot, nodeId: string) {
  const path: PathNode[] = [];
  const visited = new Set<string>();
  let cursor = snapshot.nodesById.get(nodeId);
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    path.unshift(cursor);
    cursor = cursor.parentId
      ? snapshot.nodesById.get(cursor.parentId)
      : undefined;
  }
  return path;
}

export function getPathTokenIds(snapshot: GraphSnapshot, nodeId: string) {
  return getPathNodes(snapshot, nodeId).flatMap((node) =>
    node.tokenId === null ? [] : [node.tokenId],
  );
}

export function getPathText(snapshot: GraphSnapshot, nodeId: string) {
  return getPathNodes(snapshot, nodeId)
    .map((node) => (node.id === 'root' ? '' : node.token))
    .join('');
}

export function createChildNode(
  parent: PathNode,
  option: TokenChoice,
  stamp: number,
  index: number,
): PathNode {
  return {
    id: `${parent.id}-${stamp}-${option.id}-${index}`,
    parentId: parent.id,
    depth: parent.depth + 1,
    token: option.token,
    tokenId: option.id,
    conditionalProbability: option.probability,
    cumulativeProbability: parent.cumulativeProbability * option.probability,
    expanded: false,
    fresh: true,
  };
}
