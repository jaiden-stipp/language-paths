'use client';

import type {
  CSSProperties,
  PointerEventHandler,
  RefObject,
  WheelEventHandler,
} from 'react';
import { LoaderCircle, Maximize2, Move, ZoomIn, ZoomOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MAX_ZOOM, MIN_ZOOM } from '@/lib/graph/geometry';
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
}: GraphViewportProps) {
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
            className={`tree-canvas ${zoom < 0.18 ? 'detail-minimal' : zoom < 0.38 ? 'detail-low' : 'detail-full'}`}
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${zoom})`,
            }}
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
              {renderModel.convergenceEdges.map((edge) => (
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

              {renderModel.inactiveEdges.map((edge) => (
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

            {renderModel.nodeModels.map((model) => {
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
                '--node-font-size': `${0.75 + probabilityScale * 0.09}rem`,
                '--node-border-strength': `${Math.round(
                  28 + probabilityScale * 38,
                )}%`,
                '--node-fill-strength': `${Math.round(
                  5 + probabilityScale * 8,
                )}%`,
                '--node-glow-strength': `${Math.round(
                  5 + probabilityScale * 13,
                )}%`,
                '--node-glow-radius': `${Math.round(
                  5 + probabilityScale * 11,
                )}px`,
              } as CSSProperties & {
                '--spawn-x': string;
                '--spawn-y': string;
                '--lineage-color': string;
                '--node-font-size': string;
                '--node-border-strength': string;
                '--node-fill-strength': string;
                '--node-glow-strength': string;
                '--node-glow-radius': string;
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
          </div>
        </div>
      </div>
    </div>
  );
}
