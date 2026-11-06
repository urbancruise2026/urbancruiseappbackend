/**
 * ttlToSeconds() turns JWT and Redis TTL settings into seconds. A wrong
 * result means sessions or OTPs expire at the wrong time.
 */
import { describe, expect, it } from 'vitest';
import { durationRegex, ttlToSeconds } from '../duration.js';

describe('ttlToSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['1h', 3_600],
    ['30d', 2_592_000],
    ['1500ms', 2], // rounds up
    ['1ms', 1], // Redis TTL must be at least 1 second
  ])('%s -> %i seconds', (ttl, expected) => {
    expect(ttlToSeconds(ttl)).toBe(expected);
  });

  it.each(['1.5h', '1', '15 m', 'h', '', '-1h', '10w'])('rejects "%s"', ttl => {
    expect(() => ttlToSeconds(ttl)).toThrow();
  });

  it('accepts exactly what durationRegex accepts', () => {
    // env.ts validates JWT TTLs with durationRegex; the parser must agree.
    for (const ttl of ['1s', '15m', '1h', '7d', '500ms']) {
      expect(durationRegex.test(ttl)).toBe(true);
      expect(() => ttlToSeconds(ttl)).not.toThrow();
    }
  });
});
