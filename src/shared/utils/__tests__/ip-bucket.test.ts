/**
 * bucketIp() groups client IPs for the OTP abuse limits. If two spellings of
 * the same network gave different keys, an attacker could get around them.
 */
import { describe, expect, it } from 'vitest';
import { bucketIp } from '../ip-bucket.js';

describe('bucketIp', () => {
  it('groups IPv4 by /24', () => {
    expect(bucketIp('203.0.113.7')).toBe('v4:203.0.113');
    expect(bucketIp('203.0.113.250')).toBe('v4:203.0.113');
  });

  it('treats IPv4-mapped IPv6 as IPv4', () => {
    expect(bucketIp('::ffff:203.0.113.7')).toBe('v4:203.0.113');
  });

  it('groups IPv6 by /64', () => {
    expect(bucketIp('2001:db8:1:2:aaaa::1')).toBe('v6:2001:0db8:0001:0002');
    expect(bucketIp('2001:db8:1:2:bbbb::9')).toBe('v6:2001:0db8:0001:0002');
  });

  it('gives the same key for different spellings of one IPv6 network', () => {
    expect(bucketIp('2001:DB8::1')).toBe(bucketIp('2001:0db8:0000:0000::2'));
  });

  it.each([null, '', 'not-an-ip', '999.1.1.1'])('returns null for %j', ip => {
    expect(bucketIp(ip)).toBeNull();
  });
});
