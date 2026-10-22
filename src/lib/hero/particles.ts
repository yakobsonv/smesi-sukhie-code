/** Облако минеральных частиц, которое собирается в буквы заголовка (Three.js).
 *
 *  Все частицы — ОДИН объект Points с BufferGeometry: на частицу нет ни DOM-элемента, ни своего вызова
 *  отрисовки. Состояния (облако → перелёт в букву → растворение) считаются в вершинном шейдере от одного
 *  числа — времени интро uTime; CPU на кадр меняет только uniform. Атрибуты — типизированные массивы:
 *    aCloud  — точка в облаке (единичный радиус, ось y вверх);
 *    aTarget — точка буквы H1, CSS px от левого верхнего угла первого экрана;
 *    aAnim   — задержка перелёта, длительность, вид (0 — зерно, 1 — отстаёт и осыпается, 2 — пыль), случайное;
 *    aLook   — цвет (палитра смеси) и размер.
 *  Координаты экрана — CSS px первого экрана (canvas во весь первый экран); перспектива для объёма облака —
 *  своя, к центру облака, и в буквах (z = 0) она тождественна: частица стоит ровно на пикселе буквы. */
import { BufferAttribute, BufferGeometry, NormalBlending, Points, ShaderMaterial } from 'three';
import { HERO, type ParticleMode } from '../hero-config';
import type { TitleSample } from './title-sample';

const P = HERO.particles;
const T = HERO.time;

const vertex = /* glsl */ `
uniform float uTime, uRadius, uFocal, uDpr, uTitleStart, uSpin, uTilt, uWobble, uShadeMin, uTextSize, uGravity, uCloudForm, uDustAlpha;
uniform vec2 uView, uCenter, uOut, uAlpha;
uniform vec3 uLight;
attribute vec3 aCloud;
attribute vec2 aTarget;
attribute vec4 aAnim;
attribute vec4 aLook;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
float easeInOut(float k) { return k < 0.5 ? 4.0 * k * k * k : 1.0 - pow(-2.0 * k + 2.0, 3.0) / 2.0; }
float easeOut(float k) { return 1.0 - pow(1.0 - k, 3.0); }

void main() {
  float t = uTime;
  float rnd = aAnim.w;
  float kind = aAnim.z;

  // Облако: собирается из рассеянной пыли, закручивается с инерцией (угловая скорость растёт от нуля,
  // внутренние витки быстрее внешних — облако «наматывается»), дышит мягким шумом.
  float form = easeOut(clamp((t - rnd * 0.3) / uCloudForm, 0.0, 1.0));
  vec3 p = aCloud * mix(1.55, 1.0, form) + (1.0 - form) * 0.35 * vec3(fract(rnd * 31.7) - 0.5, fract(rnd * 17.3) - 0.5, fract(rnd * 47.9) - 0.5);
  float r = length(p.xz);
  p = rotY(p, uSpin * t * t / (t + 1.0) / (0.35 + r));
  p = rotX(p, uTilt);
  p += uWobble * vec3(sin(t * 0.9 + rnd * 37.0 + p.y * 2.5), sin(t * 0.7 + rnd * 21.0 + p.z * 2.5), sin(t * 0.8 + rnd * 13.0 + p.x * 2.5));
  vec3 n = normalize(p + vec3(1e-4));
  vec3 cloud = vec3(uCenter.x + p.x * uRadius, uCenter.y - p.y * uRadius, p.z * uRadius);

  // Перелёт в букву: у каждой частицы своя задержка и длительность, путь — дуга
  float e = 0.0;
  if (kind < 1.5) e = easeInOut(clamp((t - uTitleStart - aAnim.x) / aAnim.y, 0.0, 1.0));
  vec3 pos = mix(cloud, vec3(aTarget, 0.0), e);
  pos += sin(3.14159 * e) * uRadius * vec3((fract(rnd * 7.13) - 0.5) * 0.5, (fract(rnd * 3.71) - 0.5) * 0.35, (fract(rnd * 5.17) - 0.5) * 0.8);

  float alpha = mix(uAlpha.x, uAlpha.y, fract(rnd * 11.3)) * smoothstep(0.0, 0.7, t - rnd * 0.45);

  // Отстающие мелкие: долетают почти до буквы и осыпаются вниз
  if (kind > 0.5 && kind < 1.5) {
    float tf = t - (uTitleStart + aAnim.x + aAnim.y * 0.85);
    if (tf > 0.0) {
      pos.y += 0.5 * uGravity * tf * tf;
      pos.x += tf * 30.0 * (fract(rnd * 17.0) - 0.5);
      alpha *= 1.0 - smoothstep(0.0, 0.8, tf);
    }
  }
  // Пыль: еле заметная, к буквам не летит и тает, пока собирается заголовок
  if (kind > 1.5) alpha = uDustAlpha * smoothstep(0.0, 1.0, t) * (1.0 - smoothstep(uTitleStart, uTitleStart + 1.4, t));

  // Растворение, когда проявился настоящий заголовок
  float d = smoothstep(uOut.x + rnd * 0.2, uOut.y + rnd * 0.2, t);
  pos += vec3(fract(rnd * 23.1) - 0.5, -0.6 - fract(rnd * 5.3), fract(rnd * 9.7) - 0.5) * d * 16.0;
  alpha *= 1.0 - d;

  float s = uFocal / max(uFocal - pos.z, uFocal * 0.3);
  vec2 scr = uCenter + (pos.xy - uCenter) * s;
  gl_Position = vec4(scr.x / uView.x * 2.0 - 1.0, 1.0 - scr.y / uView.y * 2.0, 0.0, 1.0);
  gl_PointSize = max(mix(aLook.a * s, uTextSize, e) * uDpr, 1.0);

  // Боковой свет: сторона облака к свету светлее, дальние частицы темнее; в букве свет ровный
  float lit = uShadeMin + (1.0 - uShadeMin) * max(dot(n, uLight), 0.0);
  lit *= mix(0.75, 1.1, clamp((s - 0.7) / 0.9, 0.0, 1.0));
  lit = mix(lit, 1.05, e);
  vColor = mix(aLook.rgb * lit, vec3(0.96, 0.95, 0.92), e * 0.35);
  vAlpha = alpha;
  vSoft = kind > 1.5 ? 1.0 : 0.0;
}
`;

const fragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = vSoft > 0.5 ? 1.0 - smoothstep(0.0, 0.5, d) : 1.0 - smoothstep(0.3, 0.5, d);
  if (a * vAlpha <= 0.002) discard;
  gl_FragColor = vec4(vColor, vAlpha * a);
}
`;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const gauss = () => {
  let u = 0;
  for (let k = 0; k < 4; k++) u += Math.random();
  return (u - 2) / 0.577;
};

export interface ParticleLayout {
  /** размер canvas в CSS px */
  width: number;
  height: number;
  dpr: number;
  title: TitleSample;
}

export class TitleParticles {
  readonly points: Points;
  private geometry: BufferGeometry;
  private material: ShaderMaterial;
  private count: number;
  private kinds: Uint8Array;
  private step: number;

  constructor(mode: ParticleMode, layout: ParticleLayout) {
    const n = (this.count = mode.count);
    this.step = mode.sampleStep;
    const cloud = new Float32Array(n * 3);
    const anim = new Float32Array(n * 4);
    const look = new Float32Array(n * 4);
    const kinds = (this.kinds = new Uint8Array(n));
    const nDust = Math.round(n * P.dustShare);
    const nFall = Math.round(n * P.fallShare);

    // палитра с долями
    const pal = P.colors.map((c) => {
      const v = parseInt(c.hex.slice(1), 16);
      return { rgb: [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255], w: c.weight };
    });
    const total = pal.reduce((s, c) => s + c.w, 0);
    const pick = () => {
      let x = Math.random() * total;
      for (const c of pal) if ((x -= c.w) <= 0) return c.rgb;
      return pal[0].rgb;
    };

    for (let i = 0; i < n; i++) {
      const kind = i < nDust ? 2 : i < nDust + nFall ? 1 : 0;
      kinds[i] = kind;
      let x: number, y: number, z: number;
      if (kind === 2) {
        // пыль — рыхлая сфера вокруг облака
        const a = Math.random() * Math.PI * 2;
        const u = rnd(-1, 1);
        const rr = rnd(0.5, 1.35);
        x = Math.sqrt(1 - u * u) * Math.cos(a) * rr;
        y = u * rr * 0.6;
        z = Math.sqrt(1 - u * u) * Math.sin(a) * rr;
      } else {
        // закрученная лента: 1,25 витка вокруг вертикали, высота волной, ширина ленты — по вертикали,
        // к концам лента сужается и редеет
        const s = Math.random();
        const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, s * 1.08 - 0.04)));
        const a = Math.PI * 2 * 1.25 * s;
        const rr = 0.55 + 0.38 * Math.sin(Math.PI * s);
        const band = (Math.random() * 2 - 1) * 0.17 * (0.35 + 0.65 * taper);
        const sigma = 0.025 + 0.03 * (1 - taper);
        x = Math.cos(a) * rr + gauss() * sigma;
        z = Math.sin(a) * rr * 0.8 + gauss() * sigma;
        y = 0.3 * Math.sin(2 * a + 0.6) + band + gauss() * sigma;
      }
      cloud.set([x, y, z], i * 3);
      const c = pick();
      const shade = rnd(0.75, 1.05);
      const size = kind === 2 ? rnd(P.dustSize[0], P.dustSize[1]) : kind === 1 ? rnd(P.size[0], (P.size[0] + P.size[1]) / 2) : rnd(P.size[0], P.size[1]) * (Math.random() < 0.08 ? 1.35 : 1);
      look.set([Math.min(1, c[0] * shade), Math.min(1, c[1] * shade), Math.min(1, c[2] * shade), size], i * 4);
      anim[i * 4 + 1] = rnd(T.titleFlight[0], T.titleFlight[1]);
      anim[i * 4 + 2] = kind;
      anim[i * 4 + 3] = Math.random();
    }

    const g = (this.geometry = new BufferGeometry());
    g.setAttribute('aCloud', new BufferAttribute(cloud, 3));
    g.setAttribute('aTarget', new BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('aAnim', new BufferAttribute(anim, 4));
    g.setAttribute('aLook', new BufferAttribute(look, 4));
    // position нужен three для числа вершин; в шейдере не используется
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));

    this.material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uRadius: { value: 200 },
        uFocal: { value: 600 },
        uDpr: { value: 1 },
        uTitleStart: { value: T.titleStart },
        uSpin: { value: P.spin },
        uTilt: { value: P.tilt },
        uWobble: { value: P.wobble },
        uShadeMin: { value: P.shadeMin },
        uTextSize: { value: 2 },
        uGravity: { value: P.gravity },
        uCloudForm: { value: T.cloudForm },
        uDustAlpha: { value: P.dustAlpha },
        uView: { value: [1, 1] },
        uCenter: { value: [0, 0] },
        uOut: { value: [T.particlesOut[0], T.particlesOut[1]] },
        uAlpha: { value: [P.alpha[0], P.alpha[1]] },
        uLight: { value: normalize(P.light) },
      },
    });
    this.points = new Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.setLayout(layout);
  }

  /** Новые размеры экрана или новое место заголовка: точки букв, центр и радиус облака пересчитываются. */
  setLayout(layout: ParticleLayout) {
    const { title } = layout;
    const u = this.material.uniforms;
    u.uView.value = [layout.width, layout.height];
    u.uDpr.value = layout.dpr;
    u.uTextSize.value = this.step * P.textSize;
    const b = title.box;
    const narrow = layout.width < HERO.mobileBelow;
    const radius = Math.max(narrow ? layout.width * P.cloudRadius.mobile : 60, Math.min(b.width * P.cloudRadius.ofTitle, P.cloudRadius.max, layout.width * P.cloudRadius.ofScreen));
    u.uRadius.value = radius;
    u.uFocal.value = radius * 2.6;
    // облако — под заголовком, на свободном месте над витриной; к буквам частицы летят снизу вверх
    u.uCenter.value = [b.left + b.width / 2, Math.min(layout.height - radius * 0.6, b.top + b.height + radius * (narrow ? P.cloudBelow.mobile : P.cloudBelow.desktop))];

    const pts = title.points;
    const m = pts.length / 2;
    const target = this.geometry.getAttribute('aTarget') as BufferAttribute;
    const anim = this.geometry.getAttribute('aAnim') as BufferAttribute;
    const ta = target.array as Float32Array;
    const aa = anim.array as Float32Array;
    if (!m) return;
    // точки букв перемешаны: каждая частица получает свою; если частиц больше — точки повторяются со сдвигом
    const order = new Uint32Array(m);
    for (let k = 0; k < m; k++) order[k] = k;
    for (let k = m - 1; k > 0; k--) {
      const j = (Math.random() * (k + 1)) | 0;
      const tmp = order[k]; order[k] = order[j]; order[j] = tmp;
    }
    const [d0, d1] = T.titleDelay;
    let c = 0;
    for (let i = 0; i < this.count; i++) {
      const kind = this.kinds[i];
      if (kind === 2) {
        ta[i * 2] = b.left + b.width / 2;
        ta[i * 2 + 1] = b.top + b.height / 2;
        continue;
      }
      const k = order[c++ % m];
      const jit = c > m ? 0.5 : 0;
      const x = pts[k * 2] + (Math.random() - 0.5) * this.step * jit;
      const y = pts[k * 2 + 1] + (Math.random() - 0.5) * this.step * jit;
      ta[i * 2] = x;
      ta[i * 2 + 1] = y;
      // левые буквы собираются раньше правых, с разбросом; отстающие — позже
      const along = b.width ? (x - b.left) / b.width : 0;
      aa[i * 4] = d0 + (d1 - d0) * Math.min(1, along * 0.7 + Math.random() * 0.3) + (kind === 1 ? 0.25 : 0);
    }
    target.needsUpdate = true;
    anim.needsUpdate = true;
  }

  setTime(t: number) {
    this.material.uniforms.uTime.value = t;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}

function normalize(v: readonly [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
