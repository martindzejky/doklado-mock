import { isRedirect, type Handle, type RequestEvent } from '@sveltejs/kit';
import { describe, expect, test } from 'vitest';
import { handle } from './hooks.server';

type Dispatch =
  | { kind: 'resolve'; status: number }
  | { kind: 'redirect'; status: number; location: string };

async function dispatch(href: string): Promise<Dispatch> {
  const event = { url: new URL(href) } as RequestEvent;
  const resolve = (async () =>
    new Response('ok')) as Parameters<Handle>[0]['resolve'];
  try {
    const response = await handle({ event, resolve });
    return { kind: 'resolve', status: response.status };
  } catch (error) {
    if (isRedirect(error)) {
      return {
        kind: 'redirect',
        status: error.status,
        location: error.location,
      };
    }
    throw error;
  }
}

describe('hooks.server handle', () => {
  test('API requests on the Docker service hostname skip HTTPS redirects', async () => {
    await expect(
      dispatch('http://doklado-mock:3000/v1/documents/invoice-issue'),
    ).resolves.toEqual({ kind: 'resolve', status: 200 });
    await expect(
      dispatch('http://doklado-mock:3000/v2/documents'),
    ).resolves.toEqual({ kind: 'resolve', status: 200 });
    await expect(
      dispatch('http://doklado-mock:3000/__mock/state'),
    ).resolves.toEqual({ kind: 'resolve', status: 200 });
  });

  test('inspector on the Docker service hostname still forces HTTPS', async () => {
    await expect(dispatch('http://doklado-mock:3000/')).resolves.toEqual({
      kind: 'redirect',
      status: 308,
      location: 'https://doklado-mock:3000/',
    });
  });

  test('IPv6 localhost skips redirects for API and inspector', async () => {
    await expect(
      dispatch('http://[::1]:3000/v1/documents/invoice-issue'),
    ).resolves.toEqual({ kind: 'resolve', status: 200 });
    await expect(dispatch('http://[::1]:3000/')).resolves.toEqual({
      kind: 'resolve',
      status: 200,
    });
    expect(new URL('http://[::1]:3000/').hostname).toBe('[::1]');
  });
});
