'use client';

import { ChevronRight, Route } from 'lucide-react';

import { percent, tokenLabel } from '@/lib/graph/probability';
import type { PathNode } from '@/lib/graph/types';

export function GenerationSpine({
  path,
  selectedId,
  onSelect,
}: {
  path: PathNode[];
  selectedId: string;
  onSelect: (nodeId: string) => void;
}) {
  const generatedCount = Math.max(0, path.length - 1);

  return (
    <section className="generation-spine" aria-label="Selected generation path">
      <div className="generation-spine-heading">
        <span>
          <Route aria-hidden="true" />
          Generation spine
        </span>
        <small>{generatedCount} generated tokens</small>
      </div>
      <div className="generation-spine-scroll">
        {path.map((node, index) => (
          <div className="spine-step" key={node.id}>
            {index > 0 && <ChevronRight aria-hidden="true" />}
            <button
              type="button"
              className={selectedId === node.id ? 'selected' : ''}
              aria-current={selectedId === node.id ? 'step' : undefined}
              onClick={() => onSelect(node.id)}
              title={
                node.id === 'root'
                  ? 'Original context'
                  : `Step ${node.depth}: ${tokenLabel(node.token)}, ${percent(
                      node.conditionalProbability,
                    )}`
              }
            >
              <span className="spine-token">
                {node.id === 'root' ? 'Context' : tokenLabel(node.token)}
              </span>
              <span className="spine-probability">
                {node.id === 'root'
                  ? 'start'
                  : `${node.depth} · ${percent(node.conditionalProbability)}`}
              </span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
