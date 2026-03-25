import { useEffect, useState } from 'react';
import { api } from '../api/client';

export interface SSEState {
  chapterIndex: number | null;
  chapterTitle: string | null;
  chapterPercent: number;
  overallPercent: number;
  chaptersComplete: number;
  totalChapters: number;
  status: 'connecting' | 'streaming' | 'complete' | 'error' | 'idle';
  error: string | null;
}

const initialState: SSEState = {
  chapterIndex: null,
  chapterTitle: null,
  chapterPercent: 0,
  overallPercent: 0,
  chaptersComplete: 0,
  totalChapters: 0,
  status: 'idle',
  error: null,
};

export function useSSE(jobId: string | null): SSEState {
  const [state, setState] = useState<SSEState>(initialState);
  useEffect(() => {
    if (!jobId) {
      setState(initialState);
      return;
    }

    setState({ ...initialState, status: 'connecting' });

    const es = new EventSource(api.eventsUrl(jobId));

    es.addEventListener('open', () => {
      setState((s) => ({ ...s, status: 'streaming' }));
    });

    es.addEventListener('progress', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setState((s) => ({
        ...s,
        status: 'streaming',
        chapterIndex: data.chapterIndex ?? s.chapterIndex,
        chapterTitle: data.chapterTitle ?? s.chapterTitle,
        chapterPercent: data.chapterPercent ?? s.chapterPercent,
      }));
    });

    es.addEventListener('overall-progress', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setState((s) => ({
        ...s,
        overallPercent: data.overallPercent ?? s.overallPercent,
        totalChapters: data.totalChapters ?? s.totalChapters,
      }));
    });

    es.addEventListener('chapter-complete', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setState((s) => ({
        ...s,
        chaptersComplete: data.chaptersComplete ?? s.chaptersComplete + 1,
        // Reset per-chapter progress so the next chapter starts from 0
        chapterPercent: 0,
      }));
    });

    es.addEventListener('complete', () => {
      setState((s) => ({
        ...s,
        status: 'complete',
        overallPercent: 100,
      }));
      es.close();
    });

    es.addEventListener('error', (e) => {
      // EventSource fires error on close too; only update if not already complete
      setState((s) => {
        if (s.status === 'complete') return s;
        // Check if this is a real error vs connection close
        if (es.readyState === EventSource.CLOSED) {
          return { ...s, status: 'error', error: 'Connection lost' };
        }
        // Could be a MessageEvent with error data
        const msg = e instanceof MessageEvent ? JSON.parse(e.data)?.message : null;
        return { ...s, status: 'error', error: msg ?? 'Connection error' };
      });
    });

    return () => {
      es.close();
    };
  }, [jobId]);

  return state;
}
