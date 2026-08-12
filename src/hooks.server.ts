import { redirect, type Handle } from '@sveltejs/kit';

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.startsWith('localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  );
}

export const handle: Handle = async ({ event, resolve }) => {
  // ignore loopback (API clients use 127.0.0.1, not only localhost)
  if (isLoopback(event.url.hostname)) {
    return resolve(event);
  }

  // force https
  if (!event.url.protocol.startsWith('https:')) {
    const target = new URL(event.url);
    target.protocol = 'https:';
    return redirect(308, target);
  }

  // ignore Railway generated domains
  if (event.url.hostname.endsWith('.up.railway.app')) {
    return resolve(event);
  }

  // force www
  if (!event.url.hostname.startsWith('www.')) {
    const target = new URL(event.url);
    target.hostname = 'www.' + target.hostname;
    return redirect(308, target);
  }

  return resolve(event);
};
