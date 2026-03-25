import { notify } from './notifier';

// Save and restore env vars around each test
const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  jest.resetAllMocks();
});

afterEach(() => {
  process.env = originalEnv;
});

describe('notify', () => {
  it('is a no-op when NTFY_URL is not set', async () => {
    delete process.env.NTFY_URL;
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(notify({ title: 'Test', message: 'Hello' })).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs to the correct URL with correct headers when NTFY_URL is set', async () => {
    process.env.NTFY_URL = 'http://localhost:8080';
    process.env.NTFY_TOPIC = 'my-topic';

    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);

    await notify({ title: 'Done', message: 'Job finished', priority: 'high' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('http://localhost:8080/my-topic');
    expect(init.method).toBe('POST');
    expect(init.headers['Title']).toBe('Done');
    expect(init.headers['Priority']).toBe('high');
    expect(init.headers['Content-Type']).toBe('text/plain');
    expect(init.body).toBe('Job finished');
  });

  it('uses default topic when NTFY_TOPIC is not set', async () => {
    process.env.NTFY_URL = 'http://localhost:8080';
    delete process.env.NTFY_TOPIC;

    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);

    await notify({ title: 'Test', message: 'Hello' });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/yoto-splitter');
  });

  it('uses default priority when priority is not specified', async () => {
    process.env.NTFY_URL = 'http://localhost:8080';

    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);

    await notify({ title: 'Test', message: 'Hello' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers['Priority']).toBe('default');
  });

  it('does not throw if fetch rejects (logs error, returns cleanly)', async () => {
    process.env.NTFY_URL = 'http://localhost:8080';

    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(notify({ title: 'Test', message: 'Hello' })).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Notifier] Failed to send ntfy notification:',
      expect.any(Error),
    );
  });
});
