'use client';

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  CircleHelp,
  FastForward,
  LoaderCircle,
  Network,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { AdvancedSamplingPanel } from '@/components/explorer/advanced-sampling-panel';
import { DistributionMass } from '@/components/explorer/distribution-mass';
import { GenerationSpine } from '@/components/explorer/generation-spine';
import { GraphViewport } from '@/components/explorer/graph-viewport';
import { PanelResizer } from '@/components/explorer/panel-resizer';
import { SelectedBranch } from '@/components/explorer/selected-branch';
import { SelectedStepDistribution } from '@/components/explorer/selected-step-distribution';
import { useGraphCamera } from '@/hooks/use-graph-camera';
import { useGraphLayout } from '@/hooks/use-graph-layout';
import { useModelRequest } from '@/hooks/use-model-request';
import { usePathPlayback } from '@/hooks/use-path-playback';
import { DEFAULT_PROMPT, demoNodes } from '@/lib/graph/demo-data';
import {
  branchPath,
  clampZoom,
  createLineageMap,
  stableHash,
} from '@/lib/graph/geometry';
import {
  applyTemperaturePreview,
  chooseWalkToken,
  distributionSnapshot,
  tokenLabel,
  walkStrategyDescription,
  walkStrategyLabels,
} from '@/lib/graph/probability';
import { createRenderModel } from '@/lib/graph/render-model';
import {
  createDistributionLinks,
  createSimilarityRelations,
} from '@/lib/graph/similarity';
import {
  createChildNode,
  createGraphSnapshot,
  getPathNodes,
  getPathText,
  getPathTokenIds,
  GraphBuilder,
  graphReducer,
  snapshotNodes,
} from '@/lib/graph/store';
import type {
  ConnectionState,
  PathNode,
  WalkStrategy,
} from '@/lib/graph/types';
import { modelNameFromProperties, normalizeEndpoint } from '@/lib/model/llama';

type ModelContextHost = Document & {
  modelContext?: {
    registerTool: (
      tool: {
        name: string;
        title: string;
        description: string;
        inputSchema: Record<string, unknown>;
        annotations: {
          readOnlyHint: boolean;
          untrustedContentHint: boolean;
        };
        execute: (input: unknown) => unknown;
      },
      options?: { signal?: AbortSignal },
    ) => void | Promise<void>;
  };
};

type ActivityState = 'idle' | 'exploring' | 'walking' | 'playing';

type ActivityAction =
  | { type: 'start-exploring' }
  | { type: 'start-walking' }
  | { type: 'start-playing' }
  | { type: 'stop' };

function activityReducer(
  state: ActivityState,
  action: ActivityAction,
): ActivityState {
  if (action.type === 'stop') return 'idle';
  if (state !== 'idle') return state;
  if (action.type === 'start-exploring') return 'exploring';
  if (action.type === 'start-walking') return 'walking';
  return 'playing';
}

export default function Home() {
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:8080');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [treeContext, setTreeContext] = useState(DEFAULT_PROMPT);
  const [branchWidth, setBranchWidth] = useState(5);
  const [walkSteps, setWalkSteps] = useState(6);
  const [walkStrategy, setWalkStrategy] =
    useState<WalkStrategy>('weighted-random');
  const [temperature, setTemperature] = useState(1);
  const [layoutTemperature, setLayoutTemperature] = useState(1);
  const [samplingTemperature, setSamplingTemperature] = useState(1);
  const [topK, setTopK] = useState(40);
  const [topP, setTopP] = useState(0.95);
  const [minP, setMinP] = useState(0);
  const [repeatPenalty, setRepeatPenalty] = useState(1);
  const samplingSettings = useMemo(
    () => ({
      branchWidth,
      temperature: samplingTemperature,
      topK,
      topP,
      minP,
      repeatPenalty,
    }),
    [branchWidth, minP, repeatPenalty, samplingTemperature, topK, topP],
  );
  const { cancelRequests, requestTokenStep } = useModelRequest(
    endpoint,
    samplingSettings,
  );
  const [graphState, dispatchGraph] = useReducer(
    graphReducer,
    demoNodes,
    createGraphSnapshot,
  );
  const nodes = useMemo(() => snapshotNodes(graphState), [graphState]);
  const [selectedId, setSelectedId] = useState('demo-human');
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [modelName, setModelName] = useState('demo data');
  const [notice, setNotice] = useState(
    'Demo graph — connect llama.cpp to inspect a real model.',
  );
  const [activity, dispatchActivity] = useReducer(activityReducer, 'idle');
  const exploring = activity === 'exploring';
  const walking = activity === 'walking';
  const playingBack = activity === 'playing';
  const handlePlaybackChange = useCallback((playing: boolean) => {
    dispatchActivity({ type: playing ? 'start-playing' : 'stop' });
  }, []);
  const {
    index: playbackIndex,
    path: playbackPath,
    reset: resetPlayback,
    toggle: togglePlayback,
  } = usePathPlayback({
    playing: playingBack,
    onPlayingChange: handlePlaybackChange,
    onSelect: setSelectedId,
  });
  const [branchPreviewExpanded, setBranchPreviewExpanded] = useState(false);
  const [controlPanelWidth, setControlPanelWidth] = useState(320);
  const [inspectorPanelWidth, setInspectorPanelWidth] = useState(290);
  const [graphWorkspaceExpanded, setGraphWorkspaceExpanded] = useState(false);
  const [spinePathIds, setSpinePathIds] = useState<string[]>([
    'root',
    'demo-human',
  ]);
  const requestId = useRef(0);
  const previousCanvasSize = useRef({ width: 0, height: 0 });
  const baseNodes = useRef<PathNode[]>(demoNodes.map((node) => ({ ...node })));
  const baseContext = useRef(DEFAULT_PROMPT);
  const fitNextLayout = useRef(false);
  const {
    commitCamera,
    handlePointerDown,
    handlePointerEnd,
    handlePointerMove,
    handleWheel,
    viewportRef,
    zoom,
    zoomAroundPoint,
    zoomRef,
  } = useGraphCamera();

  const adoptSpinePath = useCallback((nextPath: string[]) => {
    setSpinePathIds((current) => {
      const nextIsEarlierOnCurrentPath =
        nextPath.length < current.length &&
        nextPath.every((id, index) => current[index] === id);
      if (nextIsEarlierOnCurrentPath) return current;
      return nextPath;
    });
  }, []);

  const toggleGraphWorkspace = useCallback(() => {
    setGraphWorkspaceExpanded((expanded) => !expanded);
  }, []);

  useEffect(() => {
    if (!graphWorkspaceExpanded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGraphWorkspaceExpanded(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [graphWorkspaceExpanded]);

  const selectGraphNode = (nodeId: string) => {
    setSelectedId(nodeId);
    adoptSpinePath(getPathNodes(graphState, nodeId).map((node) => node.id));
  };

  const checkConnection = useCallback(async () => {
    setConnection('checking');
    try {
      const normalizedEndpoint = normalizeEndpoint(endpoint);
      const response = await fetch(`${normalizedEndpoint}/health`, {
        signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) throw new Error('Server is not ready');
      setConnection('online');
      setNotice('Local model connected. Enter a context and start exploring.');

      try {
        const properties = await fetch(`${normalizedEndpoint}/props`, {
          signal: AbortSignal.timeout(3500),
        });
        if (properties.ok) {
          const model = modelNameFromProperties(await properties.json());
          if (model) setModelName(model);
        }
      } catch {
        setModelName('llama.cpp model');
      }
    } catch {
      setConnection('offline');
      setModelName('demo data');
      setNotice('No model detected. The example graph is still interactive.');
    }
  }, [endpoint]);

  useEffect(() => {
    const savedEndpoint = window.localStorage.getItem(
      'language-paths-endpoint',
    );
    if (savedEndpoint) queueMicrotask(() => setEndpoint(savedEndpoint));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(checkConnection, 150);
    return () => window.clearTimeout(timer);
  }, [checkConnection]);

  useEffect(() => {
    const modelContext = (document as ModelContextHost).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(
      modelContext.registerTool(
        {
          name: 'configure_language_explorer',
          title: 'Configure language explorer',
          description:
            'Set the visible starting context and number of next-token branches in Language Paths.',
          inputSchema: {
            type: 'object',
            properties: {
              context: { type: 'string', minLength: 1 },
              branches: { type: 'integer', minimum: 2, maximum: 8 },
            },
            required: ['context'],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: false,
          },
          execute(input) {
            if (!input || typeof input !== 'object') {
              throw new Error('Expected a context and optional branch count.');
            }
            const values = input as { context?: unknown; branches?: unknown };
            if (typeof values.context !== 'string' || !values.context.trim()) {
              throw new Error('Context must be a non-empty string.');
            }
            if (
              values.branches !== undefined &&
              (!Number.isInteger(values.branches) ||
                Number(values.branches) < 2 ||
                Number(values.branches) > 8)
            ) {
              throw new Error('Branches must be an integer from 2 to 8.');
            }

            setPrompt(values.context);
            if (values.branches !== undefined) {
              setBranchWidth(Number(values.branches));
            }
            setNotice(
              'Context configured. Start exploring when the local model is connected.',
            );
            return {
              context: values.context,
              branches:
                values.branches === undefined
                  ? branchWidth
                  : Number(values.branches),
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [branchWidth]);

  const expandNode = async (nodeId: string) => {
    if (playingBack) dispatchActivity({ type: 'stop' });
    const target = graphState.nodesById.get(nodeId);
    if (!target || target.expanded || target.loading) {
      selectGraphNode(nodeId);
      return;
    }
    if (target.id.startsWith('demo-')) {
      selectGraphNode(nodeId);
      setNotice(
        'This branch is illustrative. Connect a model and explore from context for live paths.',
      );
      return;
    }
    if (connection !== 'online') {
      selectGraphNode(nodeId);
      setNotice(
        'Start llama.cpp, then use Check connection to explore this branch.',
      );
      return;
    }

    selectGraphNode(nodeId);
    dispatchGraph({
      type: 'patch',
      id: nodeId,
      patch: { loading: true, error: undefined },
    });

    try {
      const { options } = await requestTokenStep(
        getPathTokenIds(graphState, target.id),
        treeContext,
      );
      const snapshot = distributionSnapshot(options);
      const stamp = ++requestId.current;
      const children = options.map((option, index) =>
        createChildNode(target, option, stamp, index),
      );

      dispatchGraph({
        type: 'expand',
        id: nodeId,
        patch: {
          ...snapshot,
          loading: false,
          expanded: true,
        },
        children,
      });
      setNotice(
        `${children.length} next-token paths revealed from “${tokenLabel(target.token)}”.`,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      dispatchGraph({
        type: 'patch',
        id: nodeId,
        patch: {
          loading: false,
          error: error instanceof Error ? error.message : 'Request failed',
        },
      });
      setNotice(
        error instanceof Error ? error.message : 'The model request failed.',
      );
    }
  };

  const startExploration = async () => {
    if (!prompt.trim()) {
      setNotice('Enter some context first.');
      return;
    }
    if (connection !== 'online') {
      setNotice('Connect a running llama.cpp model before exploring.');
      return;
    }

    cancelRequests();
    dispatchActivity({ type: 'start-exploring' });
    resetPlayback();
    setTreeContext(prompt);
    const root: PathNode = {
      id: 'root',
      parentId: null,
      depth: 0,
      token: 'CURRENT CONTEXT',
      tokenId: null,
      conditionalProbability: 1,
      cumulativeProbability: 1,
      expanded: false,
      loading: true,
    };
    dispatchGraph({ type: 'replace', nodes: [root] });
    setSelectedId('root');
    setSpinePathIds(['root']);

    try {
      const { options } = await requestTokenStep([], prompt);
      const snapshot = distributionSnapshot(options);
      const stamp = ++requestId.current;
      const children = options.map((option, index) =>
        createChildNode(root, option, stamp, index),
      );
      const baseGraph = [
        { ...root, ...snapshot, expanded: true, loading: false },
        ...children,
      ];
      baseNodes.current = baseGraph.map((node) => ({
        ...node,
        fresh: false,
      }));
      baseContext.current = prompt;
      fitNextLayout.current = true;
      dispatchGraph({ type: 'replace', nodes: baseGraph });
      setNotice('Choose any token node to reveal what can follow it.');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        dispatchGraph({
          type: 'replace',
          nodes: [
            { ...root, loading: false, error: 'Could not read probabilities' },
          ],
        });
        setNotice(
          error instanceof Error ? error.message : 'The model request failed.',
        );
      }
    } finally {
      dispatchActivity({ type: 'stop' });
    }
  };

  const walkSelectedPath = async () => {
    const builder = new GraphBuilder(graphState);
    const startNode = builder.get(selectedId) ?? builder.get('root');
    if (!startNode) return;
    if (connection !== 'online') {
      setNotice(
        'Connect a running llama.cpp model before starting a step-through.',
      );
      return;
    }
    if (nodes.some((node) => node.id.startsWith('demo-'))) {
      setNotice(
        'Start a live graph with Explore from context before stepping through a path.',
      );
      return;
    }

    dispatchActivity({ type: 'start-walking' });
    let cursor = startNode;
    let completed = 0;
    let stopType = 'limit';
    const renderEvery =
      walkSteps >= 80 ? 10 : walkSteps >= 32 ? 5 : walkSteps >= 16 ? 2 : 1;
    const pauseBetweenSteps = walkSteps <= 16 ? 320 : walkSteps <= 40 ? 100 : 0;

    try {
      for (let step = 0; step < walkSteps; step += 1) {
        builder.patch(cursor.id, { loading: true, error: undefined });
        if (step % renderEvery === 0) {
          dispatchGraph({
            type: 'replace-snapshot',
            snapshot: builder.snapshot(),
          });
        }
        setNotice(
          `${walkStrategyLabels[walkStrategy]} · step ${step + 1} of ${walkSteps}…`,
        );

        const stepResult = await requestTokenStep(
          builder.getPathTokenIds(cursor.id),
          treeContext,
        );
        const { options, sampled } = stepResult;
        const snapshot = distributionSnapshot(options);
        const chosen = chooseWalkToken(options, sampled, walkStrategy);
        stopType = chosen.id === sampled.id ? stepResult.stopType : 'limit';
        const stamp = ++requestId.current;
        const existingChildren = new Map(
          builder
            .getChildren(cursor.id)
            .filter((node) => node.tokenId !== null)
            .map((node) => [node.tokenId, node]),
        );
        const stepChildren = options.map(
          (option, index) =>
            existingChildren.get(option.id) ??
            createChildNode(cursor, option, stamp, index),
        );

        builder.patch(cursor.id, {
          ...snapshot,
          loading: false,
          expanded: true,
        });
        builder.append(stepChildren);
        const chosenChild = stepChildren.find(
          (node) => node.tokenId === chosen.id,
        );
        if (!chosenChild) {
          throw new Error('The selected token was not returned by the model.');
        }

        cursor = chosenChild;
        completed = step + 1;
        const shouldRender =
          completed % renderEvery === 0 ||
          completed === walkSteps ||
          stopType !== 'limit';
        if (shouldRender) {
          dispatchGraph({
            type: 'replace-snapshot',
            snapshot: builder.snapshot(),
          });
          setSelectedId(chosenChild.id);
          adoptSpinePath(
            getPathNodes(builder.snapshot(), chosenChild.id).map(
              (node) => node.id,
            ),
          );
        }
        setNotice(
          `Step ${completed} of ${walkSteps}: ${walkStrategyLabels[
            walkStrategy
          ].toLowerCase()} chose “${tokenLabel(chosenChild.token)}”.`,
        );

        if (stopType !== 'limit') break;
        if (step < walkSteps - 1 && pauseBetweenSteps > 0) {
          await new Promise<void>((resolve) =>
            window.setTimeout(resolve, pauseBetweenSteps),
          );
        }
      }

      fitNextLayout.current = true;
      dispatchGraph({ type: 'replace-snapshot', snapshot: builder.snapshot() });
      setSelectedId(cursor.id);
      adoptSpinePath(
        getPathNodes(builder.snapshot(), cursor.id).map((node) => node.id),
      );
      setNotice(
        stopType !== 'limit'
          ? `The model finished naturally after ${completed} steps.`
          : `${walkStrategyLabels[walkStrategy]} completed ${completed} steps. Alternatives remain visible at every branch.`,
      );
    } catch (error) {
      builder.patch(cursor.id, { loading: false });
      dispatchGraph({ type: 'replace-snapshot', snapshot: builder.snapshot() });
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setNotice(
          completed > 0
            ? `The walk stopped after ${completed} steps. ${
                error instanceof Error
                  ? error.message
                  : 'The model request failed.'
              }`
            : error instanceof Error
              ? error.message
              : 'The model request failed.',
        );
      }
    } finally {
      dispatchActivity({ type: 'stop' });
    }
  };

  const resetToBaseContext = () => {
    cancelRequests();
    dispatchActivity({ type: 'stop' });
    resetPlayback();
    setTemperature(1);
    setLayoutTemperature(1);
    setPrompt(baseContext.current);
    setTreeContext(baseContext.current);
    dispatchGraph({
      type: 'replace',
      nodes: baseNodes.current.map((node) => ({
        ...node,
        loading: false,
        fresh: false,
        error: undefined,
      })),
    });
    setSelectedId('root');
    setSpinePathIds(['root']);
    fitNextLayout.current = true;
    setNotice('Graph reset to the original base context.');
  };

  const visualNodes = useMemo(
    () => applyTemperaturePreview(nodes, temperature),
    [nodes, temperature],
  );
  const layoutNodes = useMemo(
    () => applyTemperaturePreview(nodes, layoutTemperature),
    [layoutTemperature, nodes],
  );
  const similarityRelations = useMemo(
    () => createSimilarityRelations(nodes),
    [nodes],
  );
  const layoutSelectedPath = useMemo(
    () => new Set(spinePathIds),
    [spinePathIds],
  );
  const { layout: calculatedLayout, spawnOrigins } = useGraphLayout(
    layoutNodes,
    similarityRelations,
    layoutSelectedPath,
  );
  const visualNodeById = useMemo(
    () => new Map(visualNodes.map((node) => [node.id, node])),
    [visualNodes],
  );
  const layout = useMemo(
    () => ({
      ...calculatedLayout,
      nodes: calculatedLayout.nodes.map((node) => ({
        ...node,
        ...visualNodeById.get(node.id),
      })),
    }),
    [calculatedLayout, visualNodeById],
  );
  const nodeById = graphState.nodesById;
  const positionById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes],
  );
  const focusGraphNode = useCallback(
    (nodeId: string) => {
      setSelectedId(nodeId);
      const viewport = viewportRef.current;
      const position = positionById.get(nodeId);
      if (!viewport || !position) return;
      const nextZoom = clampZoom(Math.max(0.86, zoomRef.current));
      commitCamera(
        nextZoom,
        position.x * nextZoom - viewport.clientWidth / 2,
        position.y * nextZoom - viewport.clientHeight / 2,
      );
    },
    [commitCamera, positionById, viewportRef, zoomRef],
  );
  const lineageById = useMemo(() => createLineageMap(nodes), [nodes]);
  const similarityLinks = useMemo(
    () => createDistributionLinks(layout.nodes, similarityRelations),
    [layout.nodes, similarityRelations],
  );
  const fitGraph = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const inset = 72;
    const nextZoom = clampZoom(
      Math.min(
        1,
        (viewport.clientWidth - inset) / layout.width,
        (viewport.clientHeight - inset) / layout.height,
      ),
    );
    commitCamera(
      nextZoom,
      (layout.width * nextZoom - viewport.clientWidth) / 2,
      (layout.height * nextZoom - viewport.clientHeight) / 2,
    );
  }, [commitCamera, layout.height, layout.width, viewportRef]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const previousSize = previousCanvasSize.current;

    if (viewport) {
      if (previousSize.width === 0) {
        viewport.scrollLeft = Math.max(
          0,
          (layout.width * zoomRef.current - viewport.clientWidth) / 2,
        );
        viewport.scrollTop = Math.max(
          0,
          (layout.height * zoomRef.current - viewport.clientHeight) / 2,
        );
      } else {
        viewport.scrollLeft +=
          ((layout.width - previousSize.width) * zoomRef.current) / 2;
        viewport.scrollTop +=
          ((layout.height - previousSize.height) * zoomRef.current) / 2;
      }
    }

    previousCanvasSize.current = { width: layout.width, height: layout.height };
    if (fitNextLayout.current) {
      fitNextLayout.current = false;
      fitGraph();
    }
  }, [fitGraph, layout, viewportRef, zoomRef]);

  const selectedNode = nodeById.get(selectedId) ?? nodeById.get('root');
  const selectedVisibleMass = selectedNode?.visibleProbabilityMass;
  const spinePathNodes = useMemo(
    () =>
      spinePathIds.flatMap((id) => {
        const node = visualNodeById.get(id);
        return node ? [node] : [];
      }),
    [spinePathIds, visualNodeById],
  );
  const spineTipId = spinePathNodes.at(-1)?.id ?? selectedId;
  const spineTipNode = nodeById.get(spineTipId);
  const selectedPathText = useMemo(
    () => getPathText(graphState, spineTipId),
    [graphState, spineTipId],
  );
  const selectedPath = useMemo(
    () => new Set(spinePathNodes.map((node) => node.id)),
    [spinePathNodes],
  );
  const decisionParentId = selectedNode?.parentId ?? selectedNode?.id;
  const decisionParent = decisionParentId
    ? visualNodeById.get(decisionParentId)
    : undefined;
  const decisionChoices = useMemo(
    () =>
      (decisionParentId
        ? (graphState.childrenByParent.get(decisionParentId) ?? [])
        : []
      ).flatMap((id) => {
        const node = visualNodeById.get(id);
        return node ? [node] : [];
      }),
    [decisionParentId, graphState.childrenByParent, visualNodeById],
  );
  const decisionSelectedId = selectedNode?.parentId
    ? selectedNode.id
    : undefined;
  const decisionStep = selectedNode?.parentId ? selectedNode.depth : 1;
  const togglePathPlayback = () => {
    togglePlayback(spinePathNodes.map((node) => node.id));
  };
  const renderModel = useMemo(
    () =>
      createRenderModel({
        nodes: layout.nodes,
        similarityLinks,
        selectedPath,
        lineageById,
        spawnOrigins,
      }),
    [layout.nodes, lineageById, selectedPath, similarityLinks, spawnOrigins],
  );
  const playbackSegment = useMemo(() => {
    if (!playingBack || playbackPath.length < 2) return null;
    const sourceId = playbackPath[playbackIndex];
    const targetId = playbackPath[playbackIndex + 1];
    if (!sourceId || !targetId) return null;
    const source = positionById.get(sourceId);
    const target = positionById.get(targetId);
    if (!source || !target || target.parentId !== source.id) return null;
    return {
      id: `playback-route-${stableHash(`${sourceId}-${targetId}`)}`,
      path: branchPath(source, target),
      lineage: lineageById.get(target.id) ?? 0,
    };
  }, [lineageById, playbackIndex, playbackPath, playingBack, positionById]);
  const deepest = Math.max(...nodes.map((node) => node.depth), 0);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Network />
          </span>
          <div>
            <h1>Language Paths</h1>
            <p>Inspect the model’s next-token possibility graph</p>
          </div>
        </div>
        <div className={`connection-pill ${connection}`}>
          {connection === 'checking' ? (
            <LoaderCircle className="spin" aria-hidden="true" />
          ) : (
            <span className="status-dot" aria-hidden="true" />
          )}
          <span>
            {connection === 'online'
              ? modelName
              : connection === 'checking'
                ? 'Checking model'
                : 'Demo mode'}
          </span>
        </div>
      </header>

      <div
        className="workspace"
        style={
          {
            '--control-panel-width': `${controlPanelWidth}px`,
          } as CSSProperties
        }
      >
        <aside className="control-panel">
          <section>
            <div className="section-heading">
              <span>Model connection</span>
              <Server aria-hidden="true" />
            </div>
            <label className="field-label" htmlFor="endpoint">
              llama.cpp endpoint
            </label>
            <div className="connection-row">
              <Input
                id="endpoint"
                value={endpoint}
                spellCheck={false}
                onChange={(event) => {
                  setEndpoint(event.target.value);
                  window.localStorage.setItem(
                    'language-paths-endpoint',
                    event.target.value,
                  );
                }}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Check connection"
                onClick={checkConnection}
              >
                <RefreshCw
                  className={connection === 'checking' ? 'spin' : ''}
                />
              </Button>
            </div>
            {connection === 'offline' && (
              <div className="setup-note">
                <p>
                  From this project folder, start the included local launcher:
                </p>
                <code>.\scripts\start-model.ps1</code>
              </div>
            )}
          </section>

          <section>
            <div className="section-heading">
              <span>Starting context</span>
              <Sparkles aria-hidden="true" />
            </div>
            <label className="field-label" htmlFor="prompt">
              Prompt or unfinished sentence
            </label>
            <Textarea
              id="prompt"
              value={prompt}
              rows={5}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </section>

          <section>
            <div className="slider-label">
              <span>Branches per node</span>
              <strong>{branchWidth}</strong>
            </div>
            <Slider
              aria-label="Branches per node"
              min={2}
              max={8}
              step={1}
              value={[branchWidth]}
              onValueChange={(value) =>
                setBranchWidth(typeof value === 'number' ? value : value[0])
              }
            />
            <p className="field-help">
              More branches expose more probability mass but make the graph grow
              quickly.
            </p>
          </section>

          <AdvancedSamplingPanel
            temperature={temperature}
            samplingTemperature={samplingTemperature}
            topK={topK}
            topP={topP}
            minP={minP}
            repeatPenalty={repeatPenalty}
            previewDisabled={walking || playingBack}
            generationDisabled={walking || playingBack || exploring}
            onTemperatureChange={setTemperature}
            onTemperatureCommit={setLayoutTemperature}
            onSamplingTemperatureChange={setSamplingTemperature}
            onTopKChange={setTopK}
            onTopPChange={setTopP}
            onMinPChange={setMinP}
            onRepeatPenaltyChange={setRepeatPenalty}
          />

          <section className="walk-controls">
            <div className="walk-strategy-field">
              <span className="field-label" id="walk-strategy-label">
                Step-through strategy
              </span>
              <Select
                value={walkStrategy}
                onValueChange={(value) => {
                  if (value) setWalkStrategy(value as WalkStrategy);
                }}
                disabled={walking || playingBack}
              >
                <SelectTrigger
                  className="walk-strategy-trigger"
                  aria-labelledby="walk-strategy-label"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="weighted-random">
                    Weighted random
                  </SelectItem>
                  <SelectItem value="most-likely">Most likely</SelectItem>
                  <SelectItem value="least-likely">
                    Least likely shown
                  </SelectItem>
                  <SelectItem value="uniform-random">Uniform random</SelectItem>
                </SelectContent>
              </Select>
              <p className="field-help strategy-help">
                {walkStrategyDescription(walkStrategy, branchWidth)}
              </p>
            </div>
            <div className="expansion-count-field">
              <label className="field-label" htmlFor="expansion-count">
                Tokens to expand
              </label>
              <div className="expansion-count-input">
                <Input
                  id="expansion-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={250}
                  step={1}
                  value={walkSteps}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(nextValue)) {
                      setWalkSteps(
                        Math.max(1, Math.min(250, Math.floor(nextValue))),
                      );
                    }
                  }}
                  disabled={walking || playingBack}
                />
                <span>tokens</span>
              </div>
            </div>
            <p className="field-help">
              Add up to 250 chosen tokens from the selected node, preserving
              alternatives at every step.
            </p>
            <Button
              variant="secondary"
              onClick={walkSelectedPath}
              disabled={
                walking || playingBack || exploring || connection !== 'online'
              }
            >
              {walking ? <LoaderCircle className="spin" /> : <FastForward />}
              {walking ? 'Expanding graph…' : 'Expand graph'}
            </Button>
            <div className="playback-controls">
              <Button
                variant="outline"
                onClick={togglePathPlayback}
                disabled={
                  walking ||
                  exploring ||
                  (!playingBack &&
                    playbackIndex >= playbackPath.length - 1 &&
                    spinePathNodes.length < 2)
                }
              >
                {playingBack ? <Pause /> : <Play />}
                {playingBack
                  ? 'Pause playback'
                  : playbackPath.length > 1 &&
                      playbackIndex > 0 &&
                      playbackIndex < playbackPath.length - 1
                    ? 'Resume playback'
                    : playbackPath.length > 1 &&
                        playbackIndex >= playbackPath.length - 1
                      ? 'Replay selected path'
                      : 'Play selected path'}
              </Button>
              {playbackPath.length > 1 && (
                <span>
                  {Math.min(playbackIndex + 1, playbackPath.length)} /{' '}
                  {playbackPath.length}
                </span>
              )}
            </div>
          </section>

          <div className="primary-actions">
            <Button
              size="lg"
              onClick={startExploration}
              disabled={
                exploring || walking || playingBack || connection !== 'online'
              }
            >
              {exploring ? <LoaderCircle className="spin" /> : <Play />}
              Explore from context
            </Button>
            <Button
              variant="ghost"
              onClick={resetToBaseContext}
              disabled={walking}
            >
              <RotateCcw />
              Reset to base context
            </Button>
          </div>

          <div className="legend" aria-label="Graph legend">
            <div>
              <span className="lineage-swatches" aria-hidden="true">
                <i className="rank-1" />
                <i className="rank-2" />
                <i className="rank-3" />
                <i className="rank-4" />
                <i className="rank-5" />
                <i className="rank-6" />
              </span>
              Root-token lineage
            </div>
            <div>
              <span className="legend-line probability" />
              Probability weight
            </div>
            <div>
              <span className="legend-line convergence" />
              Similar distributions
            </div>
            <p>
              Lineage color leads the selected path and remains as a small cue
              elsewhere. More likely tokens are larger and use heavier edges.
            </p>
          </div>
        </aside>

        <PanelResizer
          label="Resize control panel"
          value={controlPanelWidth}
          minimum={260}
          maximum={480}
          defaultValue={320}
          onResize={setControlPanelWidth}
        />

        <section className="graph-panel" aria-label="Token possibility graph">
          <div className="graph-toolbar">
            <div>
              <div className="eyebrow">Live probability landscape</div>
              <h2>Language connectome</h2>
            </div>
            <div className="graph-stats" aria-label="Graph statistics">
              <span>{nodes.length - 1} token nodes</span>
              <span>{deepest} levels deep</span>
              <span>{similarityLinks.length} similar distributions</span>
            </div>
          </div>

          <SelectedBranch
            context={treeContext}
            generatedText={selectedPathText}
            cumulativeProbability={
              spineTipNode && spineTipNode.id !== 'root'
                ? spineTipNode.cumulativeProbability
                : undefined
            }
            expanded={branchPreviewExpanded}
            onToggle={() => setBranchPreviewExpanded((expanded) => !expanded)}
          />

          <GenerationSpine
            path={spinePathNodes}
            selectedId={selectedId}
            onSelect={focusGraphNode}
          />

          <DistributionMass
            visibleMass={selectedVisibleMass}
            temperature={temperature}
          />

          <div
            className={`graph-exploration ${
              graphWorkspaceExpanded ? 'graph-workspace-expanded' : ''
            }`}
            style={
              {
                '--inspector-panel-width': `${inspectorPanelWidth}px`,
              } as CSSProperties
            }
          >
            <GraphViewport
              layout={layout}
              renderModel={renderModel}
              zoom={zoom}
              zoomRef={zoomRef}
              viewportRef={viewportRef}
              selectedId={selectedId}
              temperature={temperature}
              walking={walking}
              playingBack={playingBack}
              playbackIndex={playbackIndex}
              playbackSegment={playbackSegment}
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerEnd={handlePointerEnd}
              onZoom={zoomAroundPoint}
              onFit={fitGraph}
              onFocusNode={focusGraphNode}
              workspaceExpanded={graphWorkspaceExpanded}
              onToggleWorkspace={toggleGraphWorkspace}
              onExpand={(nodeId) => {
                void expandNode(nodeId);
              }}
            />
            <PanelResizer
              label="Resize selected-step inspector"
              value={inspectorPanelWidth}
              minimum={240}
              maximum={520}
              defaultValue={290}
              direction={-1}
              onResize={setInspectorPanelWidth}
            />
            <SelectedStepDistribution
              step={decisionStep}
              choices={decisionChoices}
              selectedId={decisionSelectedId}
              visibleMass={decisionParent?.visibleProbabilityMass}
              temperature={temperature}
            />
          </div>

          <div className="graph-footer">
            <p aria-live="polite">{notice}</p>
            <div className="precision-note">
              <CircleHelp aria-hidden="true" />
              Cross-links compare visible next-token distributions, not internal
              model states.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
