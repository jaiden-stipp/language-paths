'use client';

import { useCallback, useEffect, useRef } from 'react';

import {
  requestTokenStep as fetchTokenStep,
  type SamplingSettings,
} from '@/lib/model/llama';

export function useModelRequest(
  endpoint: string,
  samplingSettings: SamplingSettings,
) {
  const requestEpoch = useRef(0);
  const requestControllers = useRef(new Set<AbortController>());

  const cancelRequests = useCallback(() => {
    requestEpoch.current += 1;
    for (const controller of requestControllers.current) controller.abort();
    requestControllers.current.clear();
  }, []);

  useEffect(() => cancelRequests, [cancelRequests]);

  const requestTokenStep = async (
    pathTokenIds: number[],
    contextText: string,
  ) => {
    const controller = new AbortController();
    const epoch = requestEpoch.current;
    requestControllers.current.add(controller);
    try {
      const result = await fetchTokenStep({
        endpoint,
        pathTokenIds,
        contextText,
        settings: samplingSettings,
        signal: controller.signal,
      });
      if (epoch !== requestEpoch.current) {
        throw new DOMException('Request superseded', 'AbortError');
      }
      return result;
    } finally {
      requestControllers.current.delete(controller);
    }
  };

  return { cancelRequests, requestTokenStep };
}
