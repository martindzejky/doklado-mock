import { redirect, type Handle } from '@sveltejs/kit';

function stripBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

function isLoopback(hostname: string): boolean {
  const host = stripBrackets(hostname);
  return (
    host === 'localhost' ||
    host.startsWith('localhost') ||
    host === '127.0.0.1' ||
    host === '::1'
  );
}

function isApiPath(pathname: string): boolean {
  return (
    pathname === '/v1' ||
    pathname.startsWith('/v1/') ||
    pathname === '/v2' ||
    pathname.startsWith('/v2/') ||
    pathname === '/__mock' ||
    pathname.startsWith('/__mock/')
  );
}

export const handle: Handle = async ({ event, resolve }) => {
  // Doklado and __mock clients (including Docker service DNS) must not be
  // bounced to HTTPS or www. The inspector UI still uses the template policy.
  if (isApiPath(event.url.pathname)) {
    return resolve(event);
  }

  // ignore loopback (API clients use 127.0.0.1 / [::1], not only localhost)
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
