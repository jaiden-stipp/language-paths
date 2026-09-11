import { describe, expect, it } from 'vitest';

import {
  modelNameFromProperties,
  normalizeEndpoint,
  parseTokenStep,
} from '@/lib/model/llama';

describe('llama.cpp response parsing', () => {
  it('parses token choices and preserves a sampled token outside the visible list', () => {
    const result = parseTokenStep({
      completion_probabilities: [
        {
          id: 9,
          token: ' sampled',
          prob: 0.1,
          top_probs: [
            { id: 1, token: ' one', prob: 0.7 },
            { id: 2, bytes: [32, 116, 119, 111], logprob: Math.log(0.2) },
          ],
        },
      ],
      stop_type: 'limit',
    });
    expect(result.options.map((choice) => choice.id)).toEqual([1, 2, 9]);
    expect(result.options[1]?.token).toBe(' two');
    expect(result.sampled.id).toBe(9);
  });

  it('uses the matching visible choice when llama.cpp omits sampled probability', () => {
    const result = parseTokenStep({
      completion_probabilities: [
        {
          id: 2,
          token: ' two',
          top_probs: [
            { id: 1, token: ' one', prob: 0.7 },
            { id: 2, token: ' two', prob: 0.2 },
          ],
        },
      ],
    });
    expect(result.sampled).toEqual(result.options[1]);
  });

  it('rejects missing and malformed probability data', () => {
    expect(() => parseTokenStep({})).toThrow(/without token probabilities/i);
    expect(() =>
      parseTokenStep({ probs: [{ top_probs: [{ id: 'bad', prob: 1 }] }] }),
    ).toThrow(/token ID/i);
  });

  it('normalizes endpoints and model names safely', () => {
    expect(normalizeEndpoint('http://127.0.0.1:8080/')).toBe(
      'http://127.0.0.1:8080',
    );
    expect(() => normalizeEndpoint('file:///model')).toThrow(/http/i);
    expect(
      modelNameFromProperties({
        default_generation_settings: { model: 'C:\\models\\small.gguf' },
      }),
    ).toBe('small.gguf');
    expect(
      modelNameFromProperties({ model_alias: { name: 'bad' } }),
    ).toBeUndefined();
  });
});
