import { Check, CircleDot } from 'lucide-react';

import {
  distributionDescription,
  distributionEntropy,
} from '@/lib/graph/interpretability';
import { percent, tokenLabel } from '@/lib/graph/probability';
import type { PathNode } from '@/lib/graph/types';

export function SelectedStepDistribution({
  step,
  choices,
  selectedId,
  visibleMass,
  temperature,
}: {
  step: number;
  choices: PathNode[];
  selectedId?: string;
  visibleMass?: number;
  temperature: number;
}) {
  const rankedChoices = [...choices].sort(
    (left, right) => right.conditionalProbability - left.conditionalProbability,
  );
  const entropy = distributionEntropy(rankedChoices);
  const hiddenMass =
    visibleMass === undefined ? undefined : Math.max(0, 1 - visibleMass);

  return (
    <aside
      className="step-distribution"
      aria-label={`Token distribution at step ${step}`}
    >
      <div className="step-distribution-heading">
        <span className="step-icon" aria-hidden="true">
          <CircleDot />
        </span>
        <div>
          <span className="step-kicker">Step {step}</span>
          <h3>{distributionDescription(rankedChoices)}</h3>
        </div>
      </div>

      <div className="distribution-summary">
        <span>
          Entropy <strong>{entropy.toFixed(2)} bits</strong>
        </span>
        {temperature !== 1 && <span>T {temperature.toFixed(1)} preview</span>}
      </div>

      {rankedChoices.length === 0 ? (
        <p className="distribution-empty">
          Expand this point to inspect its next-token alternatives.
        </p>
      ) : (
        <ol className="choice-list">
          {rankedChoices.map((choice, index) => {
            const selected = choice.id === selectedId;
            return (
              <li className={selected ? 'selected' : ''} key={choice.id}>
                <span className="choice-rank">{index + 1}</span>
                <span className="choice-main">
                  <span className="choice-label">
                    <code>{tokenLabel(choice.token)}</code>
                    {selected && (
                      <span className="chosen-badge">
                        <Check aria-hidden="true" /> chosen
                      </span>
                    )}
                  </span>
                  <span className="choice-meter" aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.max(
                          1,
                          choice.conditionalProbability * 100,
                        )}%`,
                      }}
                    />
                  </span>
                </span>
                <span className="choice-value">
                  {percent(choice.conditionalProbability)}
                </span>
              </li>
            );
          })}
          {hiddenMass !== undefined && hiddenMass > 0.0001 && (
            <li className="hidden-choice">
              <span className="choice-rank">···</span>
              <span className="choice-main">
                <span className="choice-label">
                  <code>hidden vocabulary</code>
                </span>
                <span className="choice-meter" aria-hidden="true">
                  <i style={{ width: `${Math.max(1, hiddenMass * 100)}%` }} />
                </span>
              </span>
              <span className="choice-value">{percent(hiddenMass)}</span>
            </li>
          )}
        </ol>
      )}

      <p className="distribution-note">
        Bars use absolute probability. Entropy compares the visible choices.
      </p>
    </aside>
  );
}
