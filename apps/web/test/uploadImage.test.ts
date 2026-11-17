import { describe, expect, it } from 'vitest';
import { fitWithin } from '../src/lib/uploadImage';

describe('fitWithin', () => {
  it('shrinks the long side to the edge and keeps the ratio', () => {
    expect(fitWithin(3000, 4000)).toEqual({ w: 768, h: 1024 });
    expect(fitWithin(4096, 1024)).toEqual({ w: 1024, h: 256 });
  });

  it('leaves small images as they are', () => {
    expect(fitWithin(500, 700)).toEqual({ w: 500, h: 700 });
  });
});
