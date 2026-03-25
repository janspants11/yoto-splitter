const BASE = '/api';

function generateUUID(): string {
  // crypto.randomUUID() requires a secure context (HTTPS/localhost).
  // Fall back to a manual v4 UUID for plain-HTTP LAN access.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getSessionId(): string {
  const stored = localStorage.getItem('yoto-session-id');
  if (stored) return stored;
  const sessionId = generateUUID();
  localStorage.setItem('yoto-session-id', sessionId);
  return sessionId;
}

function sessionHeaders(): { 'X-Session-ID': string } {
  return { 'X-Session-ID': getSessionId() };
}

function get<T>(path: string): Promise<T> {
  return fetch(`${BASE}${path}`, { headers: sessionHeaders() }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });
}

function post<T>(path: string, body: object): Promise<T> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify(body),
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });
}

function deleteWithSession<T>(path: string): Promise<T> {
  return fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: sessionHeaders(),
  }).then((r) => {
    if (!r.ok && r.status !== 204) throw new Error('Delete failed');
    return r.status === 204 ? (undefined as T) : r.json();
  });
}

export interface Chapter {
  index: number;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
}

export interface SizeEstimate {
  bitrate: number;
  estimatedBytes: number;
  estimatedMB: number;
  fitsYoto: boolean;
}

export interface UploadResponse {
  jobId: string;
  filename: string;
  chapters: Chapter[];
  format: {
    totalDuration: number;
    totalSize: number;
    originalBitrate: number;
  };
  estimates: SizeEstimate[];
}

export interface Job {
  id: string;
  filename: string;
  status: string;
  bitrate?: number;
  totalDuration?: number;
  chapterCount?: number;
  outputSize?: number;
  zipPath?: string;
  createdAt: string;
  errorMessage?: string;
}

export interface TestEncodeResult {
  chapterIndex: number;
  actualSizeBytes: number;
  actualMB: number;
  bitrate: number;
}

/** Upload with XHR for real progress tracking */
function uploadWithProgress(
  file: File,
  onProgress?: (percent: number) => void,
): { promise: Promise<UploadResponse>; abort: () => void } {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<UploadResponse>((resolve, reject) => {
    xhr.open('POST', `${BASE}/upload`);
    xhr.setRequestHeader('X-Session-ID', getSessionId());

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });

  return { promise, abort: () => xhr.abort() };
}

export const api = {
  uploadFile: (
    file: File,
    onProgress?: (percent: number) => void,
  ): { promise: Promise<UploadResponse>; abort: () => void } =>
    uploadWithProgress(file, onProgress),

  getJobs: (): Promise<Job[]> => get('/jobs'),

  getJob: (id: string): Promise<Job> => get(`/jobs/${id}`),

  convertJob: (
    id: string,
    bitrate: number,
  ): Promise<{ queued: boolean; position: number }> =>
    post(`/jobs/${id}/convert`, { bitrate }),

  testEncode: (id: string, bitrate: number): Promise<TestEncodeResult> =>
    post(`/jobs/${id}/test-encode`, { bitrate }),

  cancelJob: (id: string): Promise<void> =>
    post(`/jobs/${id}/cancel`, {}),

  deleteJob: (id: string): Promise<void> =>
    deleteWithSession(`/jobs/${id}`),

  downloadUrl: (id: string): string => `${BASE}/download/${id}?sessionId=${getSessionId()}`,

  eventsUrl: (id: string): string => `${BASE}/events/${id}?sessionId=${getSessionId()}`,

  /**
   * Ask the server whether the session has any active (queued/processing) jobs.
   * Returns { inProgress: true, jobCount: N } if so, or { deleted: true, jobCount: N } if none
   * (the server cleans up immediately when there's nothing in-flight).
   */
  checkAndClearSession: (): Promise<{ inProgress?: boolean; deleted?: boolean; jobCount: number }> =>
    deleteWithSession(`/sessions/${getSessionId()}`),

  /**
   * Force-clear the session regardless of in-progress jobs.
   * Used after the user confirms the browser "Leave site?" prompt.
   */
  forceDeleteSession: (): Promise<{ deleted: boolean; jobCount: number }> =>
    deleteWithSession(`/sessions/${getSessionId()}?force=true`),

  /**
   * Fire-and-forget session cleanup via sendBeacon (safe to call from beforeunload).
   * Uses the POST /sessions/:id/close alias because sendBeacon only supports POST.
   * Returns true if the beacon was queued successfully.
   */
  beaconDeleteSession: (): boolean => {
    const sid = getSessionId();
    const url = `${BASE}/sessions/${sid}/close?sessionId=${sid}`;
    return navigator.sendBeacon(url);
  },
};
