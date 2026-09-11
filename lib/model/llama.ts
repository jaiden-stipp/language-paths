import type { TokenChoice, TokenStep } from '@/lib/graph/types';

type LlamaProbability = {
  id: number;
  token?: string;
  prob?: number;
  logprob?: number;
  bytes?: number[];
};

export type SamplingSettings = {
  branchWidth: number;
  temperature: number;
  topK: number;
  topP: number;
  minP: number;
  repeatPenalty: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function parseBytes(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  if (
    !value.every(
      (byte) =>
        Number.isInteger(byte) && Number(byte) >= 0 && Number(byte) <= 255,
    )
  ) {
    throw new Error('The model returned invalid token bytes.');
  }
  return value.map(Number);
}

function parseProbability(value: unknown): LlamaProbability {
  if (!isRecord(value) || !Number.isInteger(value.id)) {
    throw new Error(
      'The model returned a token probability without a valid token ID.',
    );
  }
  const probability = finiteNumber(value.prob);
  const logProbability = finiteNumber(value.logprob);
  if (probability === undefined && logProbability === undefined) {
    throw new Error('The model returned a token without a probability.');
  }
  return {
    id: Number(value.id),
    token: typeof value.token === 'string' ? value.token : undefined,
    prob: probability,
    logprob: logProbability,
    bytes: parseBytes(value.bytes),
  };
}

function normalizeChoice(choice: LlamaProbability): TokenChoice {
  const rawProbability =
    choice.prob ?? Math.exp(choice.logprob ?? Number.NEGATIVE_INFINITY);
  if (!Number.isFinite(rawProbability) || rawProbability < 0) {
    throw new Error('The model returned an invalid token probability.');
  }
  return {
    id: choice.id,
    token:
      choice.token ??
      (choice.bytes
        ? new TextDecoder().decode(new Uint8Array(choice.bytes))
        : ''),
    probability: Math.min(1, rawProbability),
  };
}

export function parseTokenStep(payload: unknown): TokenStep {
  if (!isRecord(payload))
    throw new Error('The model returned an invalid response.');
  const rawRows = payload.completion_probabilities ?? payload.probs;
  if (!Array.isArray(rawRows) || !isRecord(rawRows[0])) {
    throw new Error(
      'The model responded without token probabilities. Use a recent llama.cpp server and its /completion endpoint.',
    );
  }
  const first = rawRows[0];
  const rawChoices = first.top_probs ?? first.top_logprobs;
  if (!Array.isArray(rawChoices) || rawChoices.length === 0) {
    throw new Error(
      'The model responded without token probabilities. Use a recent llama.cpp server and its /completion endpoint.',
    );
  }

  const options = rawChoices.map((choice) =>
    normalizeChoice(parseProbability(choice)),
  );
  const sampledId = Number.isInteger(first.id) ? Number(first.id) : undefined;
  const listedSample =
    sampledId === undefined
      ? undefined
      : options.find((option) => option.id === sampledId);
  const sampled =
    listedSample ??
    (sampledId !== undefined &&
    (finiteNumber(first.prob) !== undefined ||
      finiteNumber(first.logprob) !== undefined)
      ? normalizeChoice(
          parseProbability({
            id: sampledId,
            token: first.token,
            prob: first.prob,
            logprob: first.logprob,
            bytes: first.bytes,
          }),
        )
      : options[0]);
  if (!sampled) throw new Error('The model did not return a sampled token.');
  if (!options.some((option) => option.id === sampled.id))
    options.push(sampled);

  return {
    options,
    sampled,
    stopType:
      typeof payload.stop_type === 'string' ? payload.stop_type : 'limit',
  };
}

export function normalizeEndpoint(value: string) {
  const candidate = value.trim().replace(/\/$/, '');
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Enter a valid llama.cpp server URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The llama.cpp endpoint must use http:// or https://.');
  }
  return url.toString().replace(/\/$/, '');
}

export function modelNameFromProperties(payload: unknown) {
  if (!isRecord(payload)) return undefined;
  const generationSettings = isRecord(payload.default_generation_settings)
    ? payload.default_generation_settings
    : undefined;
  const candidates = [
    payload.model_alias,
    payload.model_path,
    generationSettings?.model,
  ];
  const model = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0,
  );
  return model?.split(/[\\/]/).pop();
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function requestTokenStep({
  endpoint,
  pathTokenIds,
  contextText,
  settings,
  signal,
  timeoutMs = 30_000,
}: {
  endpoint: string;
  pathTokenIds: number[];
  contextText: string;
  settings: SamplingSettings;
  signal?: AbortSignal;
  timeoutMs?: number;
}) {
  let response: Response;
  try {
    response = await fetch(`${normalizeEndpoint(endpoint)}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: combinedSignal(signal, timeoutMs),
      body: JSON.stringify({
        prompt: pathTokenIds.length
          ? [contextText, ...pathTokenIds]
          : contextText,
        n_predict: 1,
        n_probs: settings.branchWidth,
        post_sampling_probs: true,
        temperature: settings.temperature,
        top_k: settings.topK,
        top_p: settings.topP,
        min_p: settings.minP,
        repeat_penalty: settings.repeatPenalty,
        cache_prompt: true,
        return_tokens: true,
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error;
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error(
        `The local model did not answer within ${Math.round(timeoutMs / 1000)} seconds.`,
      );
    }
    throw new Error(
      'Could not reach the llama.cpp completion endpoint. Check the server and browser CORS settings.',
    );
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Model request failed (${response.status})`);
  }
  return parseTokenStep(await response.json());
}
