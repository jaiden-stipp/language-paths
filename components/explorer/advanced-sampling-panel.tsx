'use client';

import { ChevronDown, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

type AdvancedSamplingPanelProps = {
  temperature: number;
  samplingTemperature: number;
  topK: number;
  topP: number;
  minP: number;
  repeatPenalty: number;
  previewDisabled: boolean;
  generationDisabled: boolean;
  onTemperatureChange: (value: number) => void;
  onTemperatureCommit: (value: number) => void;
  onSamplingTemperatureChange: (value: number) => void;
  onTopKChange: (value: number) => void;
  onTopPChange: (value: number) => void;
  onMinPChange: (value: number) => void;
  onRepeatPenaltyChange: (value: number) => void;
};

function sliderValue(value: number | readonly number[]) {
  return typeof value === 'number' ? value : (value[0] ?? 1);
}

export function AdvancedSamplingPanel({
  temperature,
  samplingTemperature,
  topK,
  topP,
  minP,
  repeatPenalty,
  previewDisabled,
  generationDisabled,
  onTemperatureChange,
  onTemperatureCommit,
  onSamplingTemperatureChange,
  onTopKChange,
  onTopPChange,
  onMinPChange,
  onRepeatPenaltyChange,
}: AdvancedSamplingPanelProps) {
  return (
    <section className="advanced-panel">
      <Collapsible>
        <CollapsibleTrigger className="advanced-trigger">
          <span className="advanced-trigger-title">
            <SlidersHorizontal aria-hidden="true" />
            Advanced
          </span>
          <span className="advanced-trigger-summary">
            preview T{temperature.toFixed(1)} · k{topK} · p{topP.toFixed(2)}
          </span>
          <ChevronDown className="advanced-chevron" aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="advanced-content">
          <div className="advanced-content-inner">
            <div className="advanced-group">
              <div className="advanced-group-label">Visualization</div>
              <div className="slider-label">
                <span>Temperature preview</span>
                <strong>T {temperature.toFixed(1)}</strong>
              </div>
              <Slider
                aria-label="Temperature preview"
                min={0.2}
                max={2}
                step={0.1}
                value={[temperature]}
                onValueChange={(value) =>
                  onTemperatureChange(sliderValue(value))
                }
                onValueCommitted={(value) =>
                  onTemperatureCommit(sliderValue(value))
                }
                disabled={previewDisabled}
              />
              <p className="field-help">
                Rescales visible probabilities without changing the model.
              </p>
            </div>

            <div className="advanced-group">
              <div className="advanced-group-label">Generation</div>
              <div className="slider-label">
                <span>Sampling temperature</span>
                <strong>T {samplingTemperature.toFixed(1)}</strong>
              </div>
              <Slider
                aria-label="Sampling temperature"
                min={0.1}
                max={2}
                step={0.1}
                value={[samplingTemperature]}
                onValueChange={(value) =>
                  onSamplingTemperatureChange(sliderValue(value))
                }
                disabled={generationDisabled}
              />
              <p className="field-help">
                Applied to future model requests. Lower is steadier; higher is
                more varied.
              </p>

              <div className="sampling-filter-grid">
                <label className="sampling-filter-field" htmlFor="top-k">
                  <span className="sampling-filter-label">
                    <span>Top-k</span>
                    <span>0 = all</span>
                  </span>
                  <Input
                    id="top-k"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={200}
                    step={1}
                    value={topK}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      if (Number.isFinite(value)) {
                        onTopKChange(
                          Math.max(0, Math.min(200, Math.floor(value))),
                        );
                      }
                    }}
                    disabled={generationDisabled}
                  />
                </label>
                <label className="sampling-filter-field" htmlFor="top-p">
                  <span className="sampling-filter-label">
                    <span>Top-p</span>
                    <span>1 = all</span>
                  </span>
                  <Input
                    id="top-p"
                    type="number"
                    inputMode="decimal"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={topP}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      if (Number.isFinite(value)) {
                        onTopPChange(
                          Math.max(
                            0.05,
                            Math.min(1, Math.round(value * 100) / 100),
                          ),
                        );
                      }
                    }}
                    disabled={generationDisabled}
                  />
                </label>
                <label className="sampling-filter-field" htmlFor="min-p">
                  <span className="sampling-filter-label">
                    <span>Min-p</span>
                    <span>0 = off</span>
                  </span>
                  <Input
                    id="min-p"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={0.5}
                    step={0.01}
                    value={minP}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      if (Number.isFinite(value)) {
                        onMinPChange(
                          Math.max(
                            0,
                            Math.min(0.5, Math.round(value * 100) / 100),
                          ),
                        );
                      }
                    }}
                    disabled={generationDisabled}
                  />
                </label>
                <label
                  className="sampling-filter-field"
                  htmlFor="repeat-penalty"
                >
                  <span className="sampling-filter-label">
                    <span>Repeat penalty</span>
                    <span>1 = off</span>
                  </span>
                  <Input
                    id="repeat-penalty"
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={1.5}
                    step={0.01}
                    value={repeatPenalty}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      if (Number.isFinite(value)) {
                        onRepeatPenaltyChange(
                          Math.max(
                            1,
                            Math.min(1.5, Math.round(value * 100) / 100),
                          ),
                        );
                      }
                    }}
                    disabled={generationDisabled}
                  />
                </label>
              </div>
              <p className="field-help">
                Filters are combined. Min-p removes tokens far below the best
                option; repeat penalty discourages loops.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={generationDisabled}
                onClick={() => {
                  onSamplingTemperatureChange(1);
                  onTopKChange(40);
                  onTopPChange(0.95);
                  onMinPChange(0);
                  onRepeatPenaltyChange(1);
                }}
              >
                Restore generation defaults
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
