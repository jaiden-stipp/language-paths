'use client';

import { ChevronDown, GitBranch } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { percent } from '@/lib/graph/probability';

export function SelectedBranch({
  context,
  generatedText,
  cumulativeProbability,
  expanded,
  onToggle,
}: {
  context: string;
  generatedText: string;
  cumulativeProbability?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`branch-preview${expanded ? ' expanded' : ''}`}
      aria-live="polite"
    >
      <div className="branch-preview-summary">
        <GitBranch aria-hidden="true" />
        <span className="preview-label">Selected branch</span>
        <span className="preview-text">
          <span className="preview-context">{context}</span>
          {generatedText && (
            <span className="preview-generation">{generatedText}</span>
          )}
        </span>
        {cumulativeProbability !== undefined && (
          <span className="preview-probability">
            cumulative {percent(cumulativeProbability)}
          </span>
        )}
        <Button
          variant="ghost"
          size="xs"
          className="branch-preview-toggle"
          aria-expanded={expanded}
          aria-controls="selected-branch-full-text"
          onClick={onToggle}
        >
          {expanded ? 'Hide full text' : 'Show full text'}
          <ChevronDown aria-hidden="true" />
        </Button>
      </div>
      <div
        id="selected-branch-full-text"
        className="branch-preview-details"
        aria-hidden={!expanded}
      >
        <div className="branch-preview-details-inner">
          <pre aria-label="Full selected branch text">
            <span className="full-text-context">{context}</span>
            {generatedText && (
              <span className="full-text-generation">{generatedText}</span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
