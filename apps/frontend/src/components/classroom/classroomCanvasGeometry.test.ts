import { describe, expect, it } from 'vitest';
import type { CsStroke } from '../../api/classroom';
import {
  eraseHitRadius,
  findStrokeAt,
  findStrokesInLasso,
  snapRotationAngle,
  strokeBoundingBox,
} from './classroomCanvasGeometry';

function pen(id: string, points: number[]): CsStroke {
  return { id, tool: 'pen', color: '#000', width: 3, points } as CsStroke;
}

describe('strokeBoundingBox', () => {
  it('barcha nuqtalarni qamrab oluvchi to‘rtburchak qaytaradi', () => {
    const box = strokeBoundingBox(pen('s1', [0.1, 0.2, 0.5, 0.4, 0.3, 0.8]));
    expect(box.left).toBeCloseTo(0.1);
    expect(box.top).toBeCloseTo(0.2);
    expect(box.right).toBeCloseTo(0.5);
    expect(box.bottom).toBeCloseTo(0.8);
  });
});

describe('eraseHitRadius', () => {
  it('qalin chiziq uchun kattaroq radius beradi', () => {
    expect(eraseHitRadius(20)).toBeGreaterThan(eraseHitRadius(2));
  });
});

describe('snapRotationAngle', () => {
  it('yaqin burchakni tekis qiymatga tortadi', () => {
    // 15° qadamga juda yaqin qiymat — o'ziga tortiladi.
    expect(snapRotationAngle(44)).toBe(45);
    expect(snapRotationAngle(1)).toBe(0);
  });

  it('qadamdan uzoq burchakni o‘zgartirmaydi', () => {
    expect(snapRotationAngle(37)).toBe(37);
  });
});

describe('findStrokeAt', () => {
  const strokes = [pen('a', [0.1, 0.1, 0.2, 0.1]), pen('b', [0.8, 0.8, 0.9, 0.8])];

  it('bosilgan nuqtaga eng yaqin strokeni topadi', () => {
    expect(findStrokeAt(strokes, 0.15, 0.1, 0.02)?.id).toBe('a');
  });

  it('ustma-ust chizmalarda oxirgi chizilganini tanlaydi', () => {
    const overlapping = [pen('past', [0.1, 0.1, 0.2, 0.1]), pen('tepa', [0.1, 0.1, 0.2, 0.1])];
    expect(findStrokeAt(overlapping, 0.15, 0.1, 0.02)?.id).toBe('tepa');
  });

  it('hech narsa yo‘q joyda null qaytaradi', () => {
    expect(findStrokeAt(strokes, 0.5, 0.5, 0.02)).toBeNull();
  });
});

describe('findStrokesInLasso', () => {
  it('faqat ko‘pburchak ichidagi strokelarni qaytaradi', () => {
    const strokes = [pen('in', [0.2, 0.2, 0.3, 0.3]), pen('out', [0.9, 0.9, 0.95, 0.95])];
    // (0.1,0.1)–(0.5,0.1)–(0.5,0.5)–(0.1,0.5) kvadrati
    const polygon = [0.1, 0.1, 0.5, 0.1, 0.5, 0.5, 0.1, 0.5];
    expect(findStrokesInLasso(strokes, polygon)).toEqual(['in']);
  });
});
