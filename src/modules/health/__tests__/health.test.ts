/**
 * Health endpoints. The deploy script calls GET /ready after every release
 * and rolls back if it does not return 200, so these must stay correct.
 *
 * MySQL and Redis are mocked: no real connection is opened.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/db/pool.js', () => ({
  ping: vi.fn(),
}));
vi.mock('../../../shared/redis/client.js', () => ({
  pingRedis: vi.fn(),
}));

const { ping } = await import('../../../shared/db/pool.js');
const { pingRedis } = await import('../../../shared/redis/client.js');
const { requestId } = await import('../../../shared/http/middleware/requestId.js');
const { runReadinessChecks } = await import('../controller.js');
const { default: healthModule } = await import('../index.js');

const pingDbMock = vi.mocked(ping);
const pingRedisMock = vi.mocked(pingRedis);

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(requestId);
  app.use('/', healthModule.mount());
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

afterEach(() => {
  vi.useRealTimers();
  pingDbMock.mockReset();
  pingRedisMock.mockReset();
});

describe('GET /health (liveness)', () => {
  it('returns 200 without checking MySQL or Redis', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = (await res.json()) as { data: { status: string }; requestId: string };

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body.data.status).toBe('live');
    expect(body.requestId).toBe(res.headers.get('x-request-id'));
    expect(pingDbMock).not.toHaveBeenCalled();
    expect(pingRedisMock).not.toHaveBeenCalled();
  });
});

describe('GET /ready (readiness)', () => {
  it('returns 200 when MySQL and Redis are both up', async () => {
    pingDbMock.mockResolvedValue(undefined);
    pingRedisMock.mockResolvedValue(undefined);

    const res = await fetch(`${baseUrl}/ready`);
    const body = (await res.json()) as { data: Record<string, string> };

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body.data).toMatchObject({ status: 'ready', db: 'ok', redis: 'ok' });
  });

  it('returns 503 when MySQL is down', async () => {
    pingDbMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
    pingRedisMock.mockResolvedValue(undefined);

    const res = await fetch(`${baseUrl}/ready`);
    const body = (await res.json()) as { error: { code: string; details: unknown } };

    expect(res.status).toBe(503);
    expect(body.error.code).toBe('NOT_READY');
    expect(body.error.details).toEqual({ db: 'down', redis: 'ok' });
  });

  it('returns 503 when Redis is down', async () => {
    pingDbMock.mockResolvedValue(undefined);
    pingRedisMock.mockRejectedValue(new Error('redis client not ready'));

    const res = await fetch(`${baseUrl}/ready`);
    const body = (await res.json()) as { error: { details: unknown } };

    expect(res.status).toBe(503);
    expect(body.error.details).toEqual({ db: 'ok', redis: 'down' });
  });

  it('does not leak error details in the response', async () => {
    pingDbMock.mockRejectedValue(new Error('Access denied for user secret_db_user'));
    pingRedisMock.mockResolvedValue(undefined);

    const res = await fetch(`${baseUrl}/ready`);
    const text = await res.text();

    expect(res.status).toBe(503);
    expect(text).not.toContain('secret_db_user');
  });
});

describe('runReadinessChecks', () => {
  it('reports a dependency that never answers as down after the timeout', async () => {
    vi.useFakeTimers();
    pingDbMock.mockReturnValue(new Promise<void>(() => {})); // hangs forever
    pingRedisMock.mockResolvedValue(undefined);

    const result = runReadinessChecks();
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(result).resolves.toEqual({ db: 'down', redis: 'ok' });
  });
});

describe('root endpoints', () => {
  it('GET /robots.txt disallows all crawlers', async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('User-agent: *\nDisallow: /\n');
  });

  it('GET / does not reveal versions or environment', async () => {
    const res = await fetch(`${baseUrl}/`);
    const body = (await res.json()) as { data: Record<string, unknown> };

    expect(res.status).toBe(200);
    expect(Object.keys(body.data).sort()).toEqual(['service', 'status']);
  });
});
