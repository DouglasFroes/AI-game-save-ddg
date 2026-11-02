import { describe, expect, it } from 'vitest';
import { FrameMeter, isLowEndDevice, resolveLite } from '@/platform/perf';

describe('lite mode', () => {
  it('flags weak phones from the hints', () => {
    expect(isLowEndDevice({ hardwareConcurrency: 4 })).toBe(true);
    expect(isLowEndDevice({ deviceMemory: 2 })).toBe(true);
    expect(isLowEndDevice({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
    expect(isLowEndDevice({})).toBe(false);
  });

  it('lets the query override a past measurement and the hints', () => {
    const fast = { hardwareConcurrency: 8 };
    expect(resolveLite('?lite=1', null, fast)).toBe(true);
    expect(resolveLite('?lite=0', '1', { hardwareConcurrency: 2 })).toBe(false);
    expect(resolveLite('', '1', fast)).toBe(true);
    expect(resolveLite('', null, fast)).toBe(false);
  });
});

/** Feeds `frames` frames `ms` apart, returning the first verdict. */
const run = (meter: FrameMeter, frames: number, ms: number, from = 0): 'slow' | null => {
  for (let i = 0; i < frames; i++) {
    const verdict = meter.push(from + i * ms);
    if (verdict) return verdict;
  }
  return null;
};

describe('FrameMeter', () => {
  it('calls a 20 fps device slow, after the warm-up', () => {
    expect(run(new FrameMeter(), 400, 50)).toBe('slow');
  });

  it('leaves a 60 fps device alone', () => {
    const meter = new FrameMeter();
    expect(run(meter, 600, 16.7)).toBeNull();
    expect(meter.finished).toBe(true);
  });

  it('ignores long gaps such as a hidden tab', () => {
    const meter = new FrameMeter();
    run(meter, 200, 16.7);
    expect(meter.push(60_000)).toBeNull();
    expect(run(meter, 100, 16.7, 60_016)).toBeNull();
  });

  it('judges only once', () => {
    const meter = new FrameMeter();
    expect(run(meter, 400, 50)).toBe('slow');
    expect(meter.push(99_999)).toBeNull();
  });
});
