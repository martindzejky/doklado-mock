import { store } from '$lib/server/state/store';
import { jsonResponse } from './envelope';
import {
  APP_INCORRECT_INPUT_DATA,
  bareError,
  malformedJson,
  messageError,
  missingApiKey,
  wrongApiKey,
} from './errors';

export type DokladoRun = (
  data: unknown,
) =>
  | Response
  | { response: Response; unknownFields?: string[] }
  | Promise<Response | { response: Response; unknownFields?: string[] }>;

function pathnameOf(request: Request): string {
  return new URL(request.url).pathname;
}

function codeOf(body: unknown): string {
  if (body && typeof body === 'object') {
    const record = body as { code?: unknown; error?: unknown };
    if (typeof record.code === 'string') return record.code;
    if (typeof record.error === 'string') return record.error;
  }
  return '';
}

async function loggedBody(response: Response): Promise<unknown> {
  const clone = response.clone();
  const type = clone.headers.get('content-type') ?? '';
  if (type.includes('json')) {
    try {
      return await clone.json();
    } catch {
      return await clone.text();
    }
  }
  return clone.text();
}

function unwrap(
  result: Response | { response: Response; unknownFields?: string[] },
): { response: Response; unknownFields: string[] } {
  if (result instanceof Response) {
    return { response: result, unknownFields: [] };
  }
  return {
    response: result.response,
    unknownFields: result.unknownFields ?? [],
  };
}

export async function withDoklado(
  request: Request,
  run: DokladoRun,
): Promise<Response> {
  const started = performance.now();
  const path = pathnameOf(request);
  let requestBody: unknown;
  let unknownFields: string[] = [];
  let response: Response;

  const fault = store.consumeFault(path);
  const latencyMs = fault?.latencyMs;
  if (latencyMs) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(latencyMs, 30_000)),
    );
  }

  if (fault?.httpStatus) {
    response = jsonResponse(
      fault.code
        ? {
            success: false,
            code: fault.code,
            ...(fault.message ? { message: fault.message } : {}),
          }
        : { error: 'fault' },
      fault.httpStatus,
    );
  } else if (fault?.code) {
    response = fault.message
      ? messageError(fault.message, fault.code)
      : bareError(fault.code);
  } else {
    const apiKey = request.headers.get('api_key');
    if (apiKey === null || apiKey === '') {
      response = missingApiKey();
    } else if (!store.config.apiKeys.includes(apiKey)) {
      response = wrongApiKey();
    } else {
      const text = await request.text();
      // BEHAVIOUR.md Errors: empty body is bare APP_INCORRECT_INPUT_DATA, not HTML 400.
      if (text.trim() === '') {
        response = bareError(APP_INCORRECT_INPUT_DATA);
      } else {
        try {
          requestBody = JSON.parse(text);
        } catch (error) {
          response = malformedJson(error);
          const responseBody = await loggedBody(response);
          store.log({
            method: request.method,
            path,
            status: response.status,
            code: codeOf(responseBody),
            durationMs: Math.round(performance.now() - started),
            requestBody,
            responseBody,
            unknownFields,
          });
          return response;
        }

        if (
          requestBody === null ||
          typeof requestBody !== 'object' ||
          Array.isArray(requestBody) ||
          !('data' in requestBody)
        ) {
          response = bareError(APP_INCORRECT_INPUT_DATA);
        } else {
          const result = unwrap(
            await run((requestBody as { data: unknown }).data),
          );
          response = result.response;
          unknownFields = result.unknownFields;
        }
      }
    }
  }

  const responseBody = await loggedBody(response);
  store.log({
    method: request.method,
    path,
    status: response.status,
    code: codeOf(responseBody),
    durationMs: Math.round(performance.now() - started),
    requestBody,
    responseBody,
    unknownFields,
  });
  return response;
}

export async function withCatchAll(request: Request): Promise<Response> {
  const started = performance.now();
  const path = pathnameOf(request);
  let requestBody: unknown;

  const apiKey = request.headers.get('api_key');
  let response: Response;
  if (apiKey === null || apiKey === '') {
    response = missingApiKey();
  } else if (!store.config.apiKeys.includes(apiKey)) {
    response = wrongApiKey();
  } else {
    response = missingApiKey();
  }

  const text = await request.clone().text();
  if (text) {
    try {
      requestBody = JSON.parse(text);
    } catch {
      requestBody = text;
    }
  }

  const responseBody = await loggedBody(response);
  store.log({
    method: request.method,
    path,
    status: response.status,
    code: codeOf(responseBody),
    durationMs: Math.round(performance.now() - started),
    requestBody,
    responseBody,
    unknownFields: [],
  });
  return response;
}
