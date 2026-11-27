import { describe, expect, it } from 'vitest';
import { backdropName } from '../src/lib/gmLibrary';
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

describe('backdropName', () => {
  it('파일 이름에서 확장자·앞 번호·밑줄을 덜어낸다', () => {
    expect(backdropName('03_harbor-night.png')).toBe('harbor night');
    expect(backdropName('폐허가 된 성당.webp')).toBe('폐허가 된 성당');
    expect(backdropName('.png')).toBe('');
  });
});
