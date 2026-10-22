/** Геометрия мешка смеси: скруглённый бокс (RoundedBoxGeometry) с деформацией вершин — лицо и зад выгнуты
 *  «пузом» (сильнее к середине), у верхнего шва мешок защипнут, у дна чуть поджат. Высота 1, ширина = пропорции
 *  фото упаковки. Материалов два: 0 — бумага (боковины, верх, дно, зад), 1 — лицо (+z) с фото; групп три
 *  (бумага · лицо · бумага) — три вызова отрисовки на мешок вместо шести у BoxGeometry.
 *  Лицу назначаются плоские UV по исходной рамке (фото ложится ровно на лицо), нормали пересчитываются гладкими. */
import { BoxGeometry, BufferAttribute, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export interface BagShape {
  /** ширина / высота */
  aspect: number;
  /** толщина — доля ширины */
  depth: number;
  /** «пузо» лица — доля толщины */
  belly: number;
  /** защип у верхнего шва — доля толщины */
  pinch: number;
}

export function bagGeometry(shape: BagShape): BufferGeometry {
  const w = shape.aspect;
  const h = 1;
  const d = w * shape.depth;
  const g = new RoundedBoxGeometry(w, h, d, 5, Math.min(d * 0.3, 0.07));
  const pos = g.getAttribute('position') as BufferAttribute;
  const uv = g.getAttribute('uv') as BufferAttribute;

  // плоские UV лица — до деформации, по рамке w × h
  const front = g.groups.find((gr) => gr.materialIndex === 4);
  if (front) {
    for (let i = front.start; i < front.start + front.count; i++) {
      uv.setXY(i, Math.min(1, Math.max(0, pos.getX(i) / w + 0.5)), Math.min(1, Math.max(0, pos.getY(i) / h + 0.5)));
    }
  }

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    const y = pos.getY(i);
    let z = pos.getZ(i);
    const X = x / (w / 2);
    const Y = y / (h / 2);
    const belly = Math.max(0, 1 - Y * Y) * Math.max(0, 1 - 0.6 * X * X);
    z *= 1 + shape.belly * belly;
    const top = smooth(0.62, 1, Y);
    z *= 1 - shape.pinch * top;
    x *= 1 + 0.025 * top;
    z *= 1 - 0.16 * smooth(0.8, 1, -Y);
    pos.setXYZ(i, x, y, z);
  }
  smoothNormals(g);
  if (front) {
    const total = pos.count;
    g.clearGroups();
    g.addGroup(0, front.start, 0);
    g.addGroup(front.start, front.count, 1);
    g.addGroup(front.start + front.count, total - front.start - front.count, 0);
  }
  return g;
}

/** Тонкий верхний шов (полоска поверх защипа). */
export function seamGeometry(shape: BagShape): BufferGeometry {
  const w = shape.aspect;
  const d = w * shape.depth * (1 - shape.pinch) * 0.9;
  const g = new BoxGeometry(w * 1.0, 0.022, Math.max(0.01, d));
  g.translate(0, 0.5 - 0.008, 0);
  return g;
}

/** Гладкие нормали для геометрии без индекса: нормали граней суммируются по совпадающим позициям. */
function smoothNormals(g: BufferGeometry) {
  const pos = g.getAttribute('position') as BufferAttribute;
  const n = pos.count;
  const ids = new Int32Array(n);
  const map = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let j = map.get(key);
    if (j === undefined) { j = map.size; map.set(key, j); }
    ids[i] = j;
  }
  const acc = new Float32Array(map.size * 3);
  for (let i = 0; i < n; i += 3) {
    const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
    const bx = pos.getX(i + 1) - ax, by = pos.getY(i + 1) - ay, bz = pos.getZ(i + 1) - az;
    const cx = pos.getX(i + 2) - ax, cy = pos.getY(i + 2) - ay, cz = pos.getZ(i + 2) - az;
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
    for (let k = 0; k < 3; k++) {
      const j = ids[i + k] * 3;
      acc[j] += nx; acc[j + 1] += ny; acc[j + 2] += nz;
    }
  }
  const normals = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = ids[i] * 3;
    const l = Math.hypot(acc[j], acc[j + 1], acc[j + 2]) || 1;
    normals[i * 3] = acc[j] / l;
    normals[i * 3 + 1] = acc[j + 1] / l;
    normals[i * 3 + 2] = acc[j + 2] / l;
  }
  g.setAttribute('normal', new BufferAttribute(normals, 3));
}
