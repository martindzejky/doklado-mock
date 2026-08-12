import { redirect, type Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // ignore localhost
  if (event.url.hostname.startsWith('localhost')) {
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
