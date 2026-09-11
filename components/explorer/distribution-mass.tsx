import { percent } from '@/lib/graph/probability';

export function DistributionMass({
  visibleMass,
  temperature,
}: {
  visibleMass?: number;
  temperature: number;
}) {
  const hiddenMass =
    visibleMass === undefined ? undefined : Math.max(0, 1 - visibleMass);
  return (
    <div className="distribution-mass" aria-live="polite">
      <span className="mass-label">Selected node coverage</span>
      {visibleMass === undefined ? (
        <span className="mass-empty">
          Expand this node to measure its hidden probability tail.
        </span>
      ) : (
        <>
          <span className="mass-meter" aria-hidden="true">
            <i style={{ width: `${visibleMass * 100}%` }} />
          </span>
          <span className="mass-value shown">shown {percent(visibleMass)}</span>
          <span className="mass-value hidden">
            hidden {percent(hiddenMass ?? 0)}
          </span>
        </>
      )}
      {temperature !== 1 && (
        <span className="temperature-badge">
          T {temperature.toFixed(1)} preview
        </span>
      )}
    </div>
  );
}
