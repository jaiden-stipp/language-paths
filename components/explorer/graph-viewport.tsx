'use client';

import type {
  CSSProperties,
  PointerEventHandler,
  RefObject,
  WheelEventHandler,
} from 'react';
import { useMemo } from 'react';
import { LoaderCircle, Maximize2, Move, ZoomIn, ZoomOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MAX_ZOOM, MIN_ZOOM } from '@/lib/graph/geometry';
import { semanticZoomLevel } from '@/lib/graph/interpretability';
import { percent, tokenLabel } from '@/lib/graph/probability';
import { createRenderModel } from '@/lib/graph/render-model';
import type { LayoutResult } from '@/lib/graph/types';

type GraphViewportProps = {
  layout: LayoutResult;
  renderModel: ReturnType<typeof createRenderModel>;
  zoom: number;
  zoomRef: RefObject<number>;
  viewportRef: RefObject<HTMLDivElement | null>;
  selectedId: string;
  temperature: number;
  walking: boolean;
  playingBack: boolean;
  playbackIndex: number;
  playbackSegment: { id: string; path: string; lineage: number } | null;
  onWheel: WheelEventHandler<HTMLDivElement>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerEnd: PointerEventHandler<HTMLDivElement>;
  onZoom: (zoom: number) => void;
  onFit: () => void;
  onExpand: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
};

export function GraphViewport({
  layout,
  renderModel,
  zoom,
  zoomRef,
  viewportRef,
  selectedId,
  temperature,
  walking,
  playingBack,
  playbackIndex,
  playbackSegment,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  onZoom,
  onFit,
  onExpand,
  onFocusNode,
}: GraphViewportProps) {
  const semanticLevel = semanticZoomLevel(zoom);
  const visibleNodeModels = useMemo(() => {
    if (semanticLevel === 'detail') return renderModel.nodeModels;
    if (semanticLevel === 'overview') {
      return renderModel.nodeModels.filter((model) => model.onPath);
    }
    return renderModel.nodeModels.filter(
      (model) =>
        model.onPath || (model.directAlternative && model.alternativeRank <= 3),
    );
  }, [renderModel.nodeModels, semanticLevel]);
  const visibleNodeIds = useMemo(
    () => new Set(visibleNodeModels.map((model) => model.node.id)),
    [visibleNodeModels],
  );
  const visibleInactiveEdges = useMemo(() => {
    if (semanticLevel === 'overview') return [];
    if (semanticLevel === 'detail') return renderModel.inactiveEdges;
    return renderModel.inactiveEdges.filter(
      (edge) =>
        visibleNodeIds.has(edge.node.id) &&
        Boolean(edge.node.parentId && visibleNodeIds.has(edge.node.parentId)),
    );
  }, [renderModel.inactiveEdges, semanticLevel, visibleNodeIds]);
  const visibleConvergenceEdges = useMemo(() => {
    if (semanticLevel === 'overview') return [];
    if (semanticLevel === 'detail') return renderModel.convergenceEdges;
    return renderModel.convergenceEdges.filter(
      (edge) =>
        edge.isNearby &&
        visibleNodeIds.has(edge.source.id) &&
        visibleNodeIds.has(edge.target.id),
    );
  }, [renderModel.convergenceEdges, semanticLevel, visibleNodeIds]);
  const semanticLabel =
    semanticLevel === 'overview'
      ? 'Overview · step clusters'
      : semanticLevel === 'focus'
        ? 'Focus · top alternatives'
        : 'Detail · all tokens';

  return (
    <div className="tree-stage">
      <div className="camera-hint" aria-hidden="true">
        <Move />
        Drag to pan · wheel or pinch to zoom
      </div>
      <div className="camera-controls" aria-label="Graph view controls">
        <Button
          variant="outline"
          size="icon"
          aria-label="Zoom out"
          onClick={() => onZoom(zoomRef.current / 1.25)}
          disabled={zoom <= MIN_ZOOM}
        >
          <ZoomOut />
        </Button>
        <Button
          variant="outline"
          className="zoom-readout"
          aria-label={`Reset zoom from ${Math.round(zoom * 100)} percent`}
          onClick={() => onZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Zoom in"
          onClick={() => onZoom(zoomRef.current * 1.25)}
          disabled={zoom >= MAX_ZOOM}
        >
          <ZoomIn />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Fit graph in view"
          onClick={onFit}
        >
          <Maximize2 />
        </Button>
      </div>
      <div className={`semantic-zoom-indicator ${semanticLevel}`}>
        {semanticLabel}
      </div>

      <div
        className="tree-viewport"
        ref={viewportRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div
          className="tree-zoom-space"
          style={{
            width: layout.width * zoom,
            height: layout.height * zoom,
          }}
        >
          <div
            className={`tree-canvas semantic-${semanticLevel} ${zoom < 0.18 ? 'detail-minimal' : zoom < 0.38 ? 'detail-low' : 'detail-full'}`}
            style={
              {
                width: layout.width,
                height: layout.height,
                transform: `scale(${zoom})`,
                '--semantic-zoom': zoom,
              } as CSSProperties & { '--semantic-zoom': number }
            }
          >
            <svg
              className="edge-layer"
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              aria-labelledby="graph-edge-title graph-edge-description"
            >
              <title id="graph-edge-title">Token graph connections</title>
              <desc id="graph-edge-description">
                Causal token branches and next-token distribution similarity
                links.
              </desc>
              <defs>
                <marker
                  id="selected-path-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="9"
                  markerHeight="9"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--foreground)" />
                </marker>
              </defs>
              {visibleConvergenceEdges.map((edge) => (
                <path
                  key={`convergence-${edge.id}`}
                  className={`convergence-edge ${edge.isNearby ? 'nearby' : ''} ${
                    edge.isDimmed ? 'dimmed' : ''
                  } ${edge.fresh ? 'fresh' : ''}`}
                  d={edge.path}
                  pathLength={1}
                  style={
                    {
                      d: `path("${edge.path}")`,
                      opacity: edge.opacity,
                      strokeWidth: edge.strokeWidth,
                    } as CSSProperties & { d: string }
                  }
                >
                  <title>Similar visible next-token distributions</title>
                </path>
              ))}

              {visibleInactiveEdges.map((edge) => (
                <path
                  key={`edge-${edge.node.id}`}
                  className={`tree-edge ${edge.isNearby ? 'nearby' : ''} ${
                    edge.isDimmed ? 'dimmed' : ''
                  } ${edge.node.fresh ? 'fresh' : ''}`}
                  d={edge.path}
                  pathLength={1}
                  style={
                    {
                      d: `path("${edge.path}")`,
                      strokeWidth: edge.strokeWidth,
                      opacity: edge.opacity,
                      '--lineage-color': `var(--lineage-${edge.lineage})`,
                    } as CSSProperties & {
                      d: string;
                      '--lineage-color': string;
                    }
                  }
                />
              ))}

              {semanticLevel === 'overview' &&
                renderModel.stepClusters.map((cluster) => (
                  <path
                    key={`${cluster.id}-edge`}
                    className="step-cluster-edge"
                    d={cluster.path}
                    style={
                      {
                        '--lineage-color': `var(--lineage-${cluster.lineage})`,
                        strokeWidth: Math.min(
                          12,
                          (1.2 + Math.sqrt(cluster.probabilityMass) * 2.8) /
                            Math.max(zoom, 0.08),
                        ),
                      } as CSSProperties & { '--lineage-color': string }
                    }
                  />
                ))}

              {renderModel.selectedEdges.map((edge) => (
                <g
                  key={`selected-edge-${edge.node.id}`}
                  className={`selected-path-segment ${
                    edge.node.fresh ? 'fresh' : ''
                  }`}
                  style={
                    {
                      d: `path("${edge.path}")`,
                      '--lineage-color': `var(--lineage-${edge.lineage})`,
                    } as CSSProperties & {
                      d: string;
                      '--lineage-color': string;
                    }
                  }
                >
                  <path
                    className="selected-path-knockout"
                    d={edge.path}
                    pathLength={1}
                    strokeWidth={edge.coreWidth + 10}
                  />
                  <path
                    className="selected-path-halo"
                    d={edge.path}
                    pathLength={1}
                    strokeWidth={edge.coreWidth + 5}
                  />
                  <path
                    id={edge.routeId}
                    className="selected-path-core"
                    d={edge.path}
                    pathLength={1}
                    strokeWidth={edge.coreWidth}
                    markerEnd="url(#selected-path-arrow)"
                  />
                  {edge.chevronOffsets.map((offset) => (
                    <text
                      key={`${edge.node.id}-chevron-${offset}`}
                      className="selected-path-chevron"
                      textAnchor="middle"
                      aria-hidden="true"
                    >
                      <textPath
                        href={`#${edge.routeId}`}
                        startOffset={`${offset}%`}
                      >
                        ›
                      </textPath>
                    </text>
                  ))}
                </g>
              ))}

              {playbackSegment && (
                <g
                  key={`${playbackSegment.id}-${playbackIndex}`}
                  className="playback-route"
                  style={
                    {
                      '--lineage-color': `var(--lineage-${playbackSegment.lineage})`,
                    } as CSSProperties & {
                      '--lineage-color': string;
                    }
                  }
                  aria-hidden="true"
                >
                  <path
                    id={playbackSegment.id}
                    className="playback-route-guide"
                    d={playbackSegment.path}
                  />
                  <circle className="playback-route-pulse" r="5">
                    <animateMotion
                      dur="600ms"
                      fill="freeze"
                      calcMode="spline"
                      keyTimes="0;1"
                      keySplines="0.2 0.8 0.2 1"
                    >
                      <mpath href={`#${playbackSegment.id}`} />
                    </animateMotion>
                  </circle>
                </g>
              )}
            </svg>

            {visibleNodeModels.map((model) => {
              const { node, spawnPoint, lineage, probabilityScale } = model;
              const nodeStyle = {
                left: node.x,
                top: node.y,
                width: model.width,
                height: model.height,
                '--spawn-x': `${spawnPoint.x - node.x}px`,
                '--spawn-y': `${spawnPoint.y - node.y}px`,
                '--lineage-color':
                  node.id === 'root'
                    ? 'var(--lineage-1)'
                    : `var(--lineage-${lineage})`,
                '--node-font-size': `${0.68 + probabilityScale * 0.24}rem`,
                '--node-border-width': `${0.7 + probabilityScale * 1.5}px`,
                '--node-border-strength': `${Math.round(
                  12 + probabilityScale * 76,
                )}%`,
                '--node-fill-strength': `${Math.round(
                  2 + probabilityScale * 18,
                )}%`,
                '--node-glow-strength': `${Math.round(
                  2 + probabilityScale * 28,
                )}%`,
                '--node-glow-radius': `${Math.round(
                  3 + probabilityScale * 20,
                )}px`,
                '--node-dimmed-opacity': model.dimmedOpacity,
                '--node-nearby-opacity': model.nearbyOpacity,
              } as CSSProperties & {
                '--spawn-x': string;
                '--spawn-y': string;
                '--lineage-color': string;
                '--node-font-size': string;
                '--node-border-width': string;
                '--node-border-strength': string;
                '--node-fill-strength': string;
                '--node-glow-strength': string;
                '--node-glow-radius': string;
                '--node-dimmed-opacity': number;
                '--node-nearby-opacity': number;
              };

              return (
                <button
                  type="button"
                  key={node.id}
                  className={`token-node ${node.id === 'root' ? 'root-node' : ''} ${
                    selectedId === node.id ? 'selected' : ''
                  } ${model.onPath ? 'on-path' : ''} ${
                    model.nearby ? 'nearby' : ''
                  } ${model.convergencePeer ? 'convergence-peer' : ''} ${
                    !model.onPath && !model.nearby ? 'dimmed' : ''
                  } ${
                    node.id !== 'root' && node.conditionalProbability < 0.01
                      ? 'low-priority'
                      : ''
                  } ${node.fresh ? 'fresh' : ''}`}
                  style={nodeStyle}
                  onClick={() => onExpand(node.id)}
                  disabled={walking || playingBack}
                  title={
                    node.id === 'root'
                      ? 'Original base context'
                      : `${tokenLabel(node.token)} · ${percent(
                          node.conditionalProbability,
                        )}${
                          temperature !== 1
                            ? ` · temperature ${temperature.toFixed(1)} preview`
                            : ''
                        }`
                  }
                  aria-label={
                    node.id === 'root'
                      ? 'Current context'
                      : `${tokenLabel(node.token)}, ${percent(
                          node.conditionalProbability,
                        )} ${
                          temperature !== 1
                            ? `preview probability at temperature ${temperature.toFixed(1)}`
                            : 'conditional probability'
                        }${
                          node.expanded
                            ? ', branch expanded'
                            : ', expand branch'
                        }`
                  }
                >
                  <span className="node-token">
                    {node.loading ? (
                      <LoaderCircle className="spin" aria-hidden="true" />
                    ) : node.id === 'root' ? (
                      'CONTEXT'
                    ) : (
                      tokenLabel(node.token)
                    )}
                  </span>
                  <span className="node-meta">
                    {node.id === 'root'
                      ? 'prompt'
                      : percent(node.conditionalProbability)}
                  </span>
                </button>
              );
            })}

            {semanticLevel === 'overview' &&
              renderModel.stepClusters.map((cluster) => {
                const clusterSize =
                  78 + Math.sqrt(cluster.probabilityMass) * 34;
                return (
                  <button
                    type="button"
                    key={cluster.id}
                    className="step-cluster"
                    style={
                      {
                        left: cluster.x,
                        top: cluster.y,
                        width: clusterSize,
                        height: clusterSize,
                        '--lineage-color': `var(--lineage-${cluster.lineage})`,
                        '--cluster-inverse-scale': 1 / Math.max(zoom, 0.08),
                      } as CSSProperties & {
                        '--lineage-color': string;
                        '--cluster-inverse-scale': number;
                      }
                    }
                    onClick={() => onFocusNode(cluster.parentId)}
                    title={`Step ${cluster.depth}: ${cluster.count} other alternatives with ${percent(
                      cluster.probabilityMass,
                    )} probability mass. Click to inspect.`}
                  >
                    <strong>Step {cluster.depth}</strong>
                    <span>{cluster.count} alternatives</span>
                    <small>H {cluster.entropy.toFixed(1)}</small>
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
