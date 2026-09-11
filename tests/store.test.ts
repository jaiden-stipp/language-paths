import { describe, expect, it } from 'vitest';

import { demoNodes } from '@/lib/graph/demo-data';
import {
  createChildNode,
  createGraphSnapshot,
  getPathNodes,
  getPathText,
  getPathTokenIds,
  GraphBuilder,
  graphReducer,
} from '@/lib/graph/store';

describe('indexed graph storage', () => {
  it('reconstructs text and exact token IDs from parent links', () => {
    const snapshot = createGraphSnapshot(demoNodes);
    expect(getPathNodes(snapshot, 'demo-the-2').map((node) => node.id)).toEqual(
      ['root', 'demo-human', 'demo-and', 'demo-the-2'],
    );
    expect(getPathTokenIds(snapshot, 'demo-the-2')).toEqual([3820, 323, 279]);
    expect(getPathText(snapshot, 'demo-the-2')).toBe(' human and the');
  });

  it('patches and appends without scanning the complete graph', () => {
    const initial = createGraphSnapshot(demoNodes);
    const builder = new GraphBuilder(initial);
    const parent = builder.get('demo-that');
    expect(parent).toBeDefined();
    if (!parent) return;
    const child = createChildNode(
      parent,
      { id: 100, token: ' test', probability: 0.5 },
      1,
      0,
    );
    builder.patch(parent.id, { expanded: true });
    builder.append([child]);
    const result = builder.snapshot();
    expect(result.nodesById.get(parent.id)?.expanded).toBe(true);
    expect(result.childrenByParent.get(parent.id)).toContain(child.id);
  });

  it('restores an immutable base graph through the reducer', () => {
    const initial = createGraphSnapshot(demoNodes);
    const changed = graphReducer(initial, {
      type: 'patch',
      id: 'root',
      patch: { loading: true },
    });
    const restored = graphReducer(changed, {
      type: 'replace',
      nodes: demoNodes.map((node) => ({ ...node, loading: false })),
    });
    expect(restored.nodesById.get('root')?.loading).toBe(false);
    expect(initial.nodesById.get('root')?.loading).toBeUndefined();
  });
});
