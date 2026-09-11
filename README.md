# Language Paths

Language Paths is a local, interactive visualization of an autoregressive model's next-token possibility graph. Each node is an exact model token. Its outgoing branches are the top next-token choices returned by the model, and clicking a token expands that alternate continuation into the surrounding network.

The interface runs in your browser and talks directly to a local [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md). Prompts and model results stay on the configured machine.

## 1. Start a local model

On Windows, install llama.cpp:

```powershell
winget install --id ggml.llamacpp --exact
```

Then use the included launcher. It finds WinGet's executable even when WinGet has not added llama.cpp to `PATH`. The first run downloads roughly 250 MB:

```powershell
cd C:\Users\Orb1t\Claude\Projects\language-paths
.\scripts\start-model.ps1
```

You can pass another compatible GGUF repository with `-Model`. The server listens at `http://127.0.0.1:8080` by default.

```powershell
.\scripts\start-model.ps1 -Model 'your-name/your-model-GGUF:Q4_K_M'
```

## 2. Start the visualization

In another terminal:

```powershell
cd C:\Users\Orb1t\Claude\Projects\language-paths
npm ci
npm run dev
```

Open `http://localhost:3000`, wait for the connection indicator to show the local model, enter an unfinished sentence or prompt, and choose **Explore from context**.

## Reading the graph

- A node's percentage is the probability of that token given the complete path before it.
- Edge thickness represents the same conditional probability.
- The selected path is highlighted from the original context to the selected token.
- The generation spine presents that selected output in chronological order; selecting a spine token recenters its graph neighborhood without discarding the longer route.
- Alternatives branching directly from that path stay visible; unrelated regions recede until selected or hovered.
- Semantic zoom changes the representation instead of merely shrinking it: the overview groups each step's alternatives by probability mass, the focus view reveals the top three alternatives, and the detail view restores every visible token and connection.
- The selected-step panel ranks the active decision's visible alternatives, marks the chosen token, and reports entropy plus hidden vocabulary mass.
- Drag the divider beside the controls or selected-step inspector to resize either panel. Arrow keys resize a focused divider, Shift makes larger adjustments, and double-click restores its default width.
- The expand control in the graph camera toolbar promotes the graph and inspector to a full-window workspace; press Escape or use the restore control to return.
- Selected-node coverage separates the probability mass represented by visible branches from the model's hidden vocabulary tail.
- Dashed cross-links connect expanded nodes whose visible next-token distributions have high cosine similarity; they do not claim the model reached the same internal state.
- Temperature preview instantly sharpens or flattens the visible sibling probabilities while preserving their measured total mass.
- Path playback replays the selected ancestry without requesting new tokens.
- `cumulative` is the product of all token probabilities along that branch.
- Spaces, newlines, and tabs are rendered as `␠`, `↵`, and `⇥` so token boundaries stay visible.
- Clicking an unopened node asks the model for that node's next-token choices.
- The organic placement keeps related branches near their parents; spatial position itself is not a semantic measurement.
- The step-through strategy can use normal probability-weighted sampling, always choose the most likely token, choose the least likely displayed token, or pick uniformly among displayed alternatives.
- Automatic expansion accepts 1–250 tokens and grows one chosen route while retaining the alternatives revealed at every step.
- Reset to base context removes later expansion and restores the original root plus its first-token choices without another model request.

The graph intentionally shows only the top 2–8 choices per node. The model's full vocabulary is usually tens of thousands of tokens, so rendering every outgoing edge would be technically possible but visually unusable. Temperature preview is therefore a relative preview over those visible alternatives rather than a recomputation of the entire vocabulary.

## Implementation note

The browser calls llama.cpp's native `/completion` endpoint with `n_probs` and `post_sampling_probs`. It sends the chosen path back as exact token IDs, rather than reconstructing the path from visible text, so alternative branches preserve the model's real tokenization.

Model requests have a 30-second timeout and are cancelled when the graph is reset, replaced, or unmounted. Malformed probability responses are rejected instead of being rendered as misleading nodes.

## Architecture

- `app/page.tsx` coordinates exploration state and the main workspace.
- `components/explorer` contains the graph viewport, chronological generation spine, selected-step distribution inspector, and focused control/readout components.
- `lib/model` validates the llama.cpp boundary and owns completion requests.
- `lib/graph` contains indexed graph storage, probability transforms, similarity, layout, geometry, and cached render-model construction.
- `workers/layout.worker.ts` runs the force simulation away from the browser's main thread. New topology reuses the previous coordinates, so existing regions move less while new alternatives settle around their parent.

The graph stores parent relationships rather than copying every ancestor token and full text onto every node. Exact token paths and visible branch text are reconstructed from the indexed graph only when they are needed.

At distant zoom levels, the viewport replaces off-path token clouds with one readable cluster per generation step. Medium zoom shows the selected route and its top alternatives; close zoom returns every visible token, percentage, and connection. This preserves chronological and probabilistic structure without asking the browser to draw illegible detail.

## Validation

Run the complete local verification pipeline:

```powershell
npm run check
```

Individual commands are also available:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

The regression suite covers llama.cpp response validation, sampling strategies, hidden probability mass, temperature previews, semantic-zoom thresholds and clusters, entropy summaries, exact path reconstruction, lineage assignment, distribution similarity, deterministic layout, selected-route rendering, reset behavior, and first-token tethering. A medium graph layout test guards against accidental algorithmic regressions without imposing hardware-specific animation timing.

The interface supports up to 250 automatic steps and up to eight alternatives per expanded node. Very large graphs still create substantial DOM and SVG output; the force simulation is off-thread, but browser rendering cost will depend on zoom level and hardware.
