export interface NotifyOptions {
  title: string;
  message: string;
  priority?: 'low' | 'default' | 'high';
}

export async function notify(options: NotifyOptions): Promise<void> {
  const ntfyUrl = process.env.NTFY_URL;
  if (!ntfyUrl) return;

  const topic = process.env.NTFY_TOPIC ?? 'yoto-splitter';
  const url = `${ntfyUrl}/${topic}`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Title': options.title,
        'Priority': options.priority ?? 'default',
        'Content-Type': 'text/plain',
      },
      body: options.message,
    });
  } catch (err) {
    console.error('[Notifier] Failed to send ntfy notification:', err);
  }
}
