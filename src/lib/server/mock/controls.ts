import { loadConfig } from '$lib/server/config/load';
import { jsonResponse } from '$lib/server/doklado/envelope';
import { issueInvoice } from '$lib/server/doklado/issue';
import { issueInvoiceDataSchema } from '$lib/server/doklado/schemas';
import { store, type Fault } from '$lib/server/state/store';
import { z } from 'zod';
import { SEED_INVOICE } from './seed-fixture';

const seedSchema = z.object({
  now: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: 'Invalid now',
    })
    .optional(),
  series: z
    .array(
      z.object({
        organizationId: z.string(),
        exportAbbreviation: z.string(),
        nextCounter: z.number().int().positive(),
      }),
    )
    .optional(),
  invoices: z.array(issueInvoiceDataSchema).optional(),
});

const faultSchema = z.object({
  path: z.string(),
  clear: z.boolean().optional(),
  remaining: z.number().int().positive().nullable().optional(),
  latencyMs: z.number().int().nonnegative().max(30_000).optional(),
  httpStatus: z.number().int().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
  afterSuccess: z.boolean().optional(),
});

async function readJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const text = await request.text();
  if (!text) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export async function handleMockReset(): Promise<Response> {
  store.reset(loadConfig());
  return jsonResponse({ success: true });
}

export async function handleMockSeed(request: Request): Promise<Response> {
  const json = await readJson(request);
  if (!json.ok) {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
  }
  const parsed = seedSchema.safeParse(json.value);
  if (!parsed.success) {
    return jsonResponse({ success: false, error: parsed.error.message }, 400);
  }
  const body = parsed.data;
  if (body.now) store.frozenNow = new Date(body.now);
  if (body.series) {
    for (const entry of body.series) {
      const org = store.findOrg(entry.organizationId);
      const series = org
        ? store.seriesByAbbreviation(org, entry.exportAbbreviation)
        : undefined;
      if (series) series.nextCounter = entry.nextCounter;
    }
    store.emit('seed');
  }
  if (body.invoices) {
    for (const invoice of body.invoices) {
      const response = issueInvoice(invoice);
      const payload = (await response.json()) as { success: boolean };
      if (!payload.success) return response;
    }
  } else if (!body.series) {
    const response = issueInvoice(SEED_INVOICE);
    const payload = (await response.json()) as { success: boolean };
    if (!payload.success) return response;
  }
  return jsonResponse({ success: true, state: store.snapshot() });
}

export async function handleMockFault(request: Request): Promise<Response> {
  const json = await readJson(request);
  if (!json.ok) {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
  }
  const parsed = faultSchema.safeParse(json.value);
  if (!parsed.success) {
    return jsonResponse({ success: false, error: parsed.error.message }, 400);
  }
  const body = parsed.data;
  store.faults = store.faults.filter((fault) => fault.path !== body.path);
  if (!body.clear) {
    const fault: Fault = {
      path: body.path,
      remaining: body.remaining === undefined ? null : body.remaining,
      latencyMs: body.latencyMs,
      httpStatus: body.httpStatus,
      code: body.code,
      message: body.message,
      afterSuccess: body.afterSuccess,
    };
    store.faults.push(fault);
  }
  store.emit('fault');
  return jsonResponse({ success: true, faults: store.faults });
}

export function handleMockState(): Response {
  return jsonResponse({ success: true, ...store.snapshot() });
}

export function handleMockEvents(request: Request): Response {
  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };
      send({ type: 'hello' });
      unsubscribe = store.subscribe((event) => send(event));
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        controller.close();
      });
    },
    cancel() {
      unsubscribe();
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}
