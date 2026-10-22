/** Объёмная витрина мешков (Three.js): активный мешок крупно по центру на подиуме под прожектором,
 *  соседи по бокам — глубже, меньше, темнее и развёрнуты к центру; позади активного — мягкий ореол цвета упаковки.
 *
 *  Карусель — одно число `pos` (непрерывное положение), которое пружиной догоняет целое `target`.
 *  Смещение мешка от центра k = i − pos (по кругу), всё остальное (x, глубина, поворот, яркость) — функция k.
 *  Поэтому быстрые повторные нажатия просто сдвигают target: пружина продолжает движение, ничего не ломается.
 *  Мешок — своя геометрия (bag-geometry.ts): фото упаковки только на лице, боковины/верх/зад — матовая
 *  бумага с лёгким шумом, тонированная средним цветом фото (pack-image.ts). Теней-карт нет: под активным —
 *  мягкое контактное пятно на подиуме (текстура). */
import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SpotLight,
  Vector2,
  type BufferGeometry,
  type Texture,
} from 'three';
import { HERO, type ShowcaseMode } from '../hero-config';
import { analysePack, type RGB } from './pack-image';
import { bagGeometry, seamGeometry } from './bag-geometry';

const S = HERO.showcase;

export interface ShowItem {
  id: string;
  title: string;
  href: string;
  image: string;
  desc: string;
}

interface Bag {
  group: Group;
  body: Mesh;
  front: MeshStandardMaterial;
  paper: MeshStandardMaterial;
  seam: MeshStandardMaterial;
  mean: RGB;
  glow: [number, number, number];
  geos: BufferGeometry[];
  photo: Texture | null;
  spinStart: number;
  flipped: boolean;
}

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const wrap = (v: number, n: number) => ((v % n) + n) % n;

function noiseTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const v = 214 + Math.random() * 41;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function blobTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

const haloShader = {
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv; uniform vec3 uColor; uniform float uStrength;
    void main() {
      vec2 c = vUv - 0.5; c.y *= 1.1;
      float r = length(c) * 2.0;
      float a = uStrength * exp(-r * r * 3.4) * (1.0 - smoothstep(0.8, 1.0, r));
      gl_FragColor = vec4(uColor, a);
    }`,
};

const beamShader = {
  vertexShader: haloShader.vertexShader,
  fragmentShader: /* glsl */ `
    varying vec2 vUv; uniform float uStrength;
    void main() {
      float y = vUv.y;                       // 0 — низ (подиум), 1 — верх
      float hw = mix(0.5, 0.16, y);          // луч сужается кверху
      float x = abs(vUv.x - 0.5);
      float a = uStrength * (1.0 - smoothstep(hw * 0.45, hw, x)) * smoothstep(0.0, 0.25, y) * (1.0 - smoothstep(0.85, 1.0, y));
      gl_FragColor = vec4(vec3(0.92, 0.94, 0.96) * a, 1.0);
    }`,
};

export class Showcase {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(28, 1, 0.1, 60);
  private rig = new Group();
  private bags: (Bag | null)[];
  private items: ShowItem[];
  private reduced: boolean;
  private n: number;
  private pos = 0;
  private vel = 0;
  private target = 0;
  private dragging = false;
  private dragFrom = 0;
  private lastActive = -1;
  private mode: ShowcaseMode = S.desktop;
  private mobile = false;
  private dist = 7.2;
  private visH = 1;
  private visW = 1;
  private bagH = 1;
  private slotX = 1;
  /** пикселей экрана на один шаг карусели (для свайпа) */
  slotPx = 200;
  private pointer = new Vector2();
  private pointerSmooth = new Vector2();
  private raycaster = new Raycaster();
  private halo: Mesh<PlaneGeometry, ShaderMaterial>;
  private beam: Mesh<PlaneGeometry, ShaderMaterial>;
  private podium: Mesh<CylinderGeometry, MeshStandardMaterial>;
  private shadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private haloColor: [number, number, number] = [0.45, 0.47, 0.5];
  private noise = noiseTexture();
  private blob = blobTexture();
  private disposed = false;
  private onActive: (i: number) => void;
  private onLoaded: () => void;
  private maxAniso = 4;

  constructor(items: ShowItem[], opts: { reduced: boolean; maxAnisotropy: number; onActive: (i: number) => void; onLoaded: () => void }) {
    this.items = items;
    this.n = items.length;
    this.bags = items.map(() => null);
    this.reduced = opts.reduced;
    this.onActive = opts.onActive;
    this.onLoaded = opts.onLoaded;
    this.maxAniso = Math.min(4, opts.maxAnisotropy);

    const bg = HERO.render.background;
    this.scene.fog = new Fog(bg, this.dist - 0.2, this.dist + 6);
    this.scene.add(this.rig);

    const L = S.light;
    this.scene.add(new HemisphereLight(0xd9dee2, 0x15191c, L.ambient));
    const key = new SpotLight(0xfff6ea, L.key, 0, 0.55, 0.85, 2);
    key.position.set(-1.6, 5.2, 5.6);
    key.target.position.set(0, -0.2, S.activeForward);
    this.scene.add(key, key.target);
    const fill = new DirectionalLight(0xdfe7ee, L.fill);
    fill.position.set(4, 1, 5);
    const rim = new DirectionalLight(0xe9eef3, L.rim);
    rim.position.set(-4, 2.5, -4);
    this.scene.add(fill, rim);

    this.halo = new Mesh(new PlaneGeometry(1, 1), new ShaderMaterial({ ...haloShader, transparent: true, depthWrite: false, uniforms: { uColor: { value: [...this.haloColor] }, uStrength: { value: 0 } } }));
    this.halo.renderOrder = -2;
    this.beam = new Mesh(new PlaneGeometry(1, 1), new ShaderMaterial({ ...beamShader, transparent: true, depthWrite: false, blending: AdditiveBlending, uniforms: { uStrength: { value: 0 } } }));
    this.beam.renderOrder = -1;
    this.podium = new Mesh(new CylinderGeometry(1, 1, 1, 72), new MeshStandardMaterial({ color: 0x252b30, roughness: 0.42, metalness: 0.35, transparent: true }));
    this.shadow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: this.blob, transparent: true, depthWrite: false, opacity: 0 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.rig.add(this.halo, this.beam, this.podium, this.shadow);

    items.forEach((item, i) => this.loadBag(item, i));
  }

  private async loadBag(item: ShowItem, i: number) {
    let canvas: HTMLCanvasElement | null = null;
    let aspect = 0.62;
    let mean: RGB = [178, 174, 166];
    let glow: RGB = [128, 132, 138];
    try {
      const p = await analysePack(item.image);
      canvas = p.canvas;
      aspect = Math.min(0.9, Math.max(0.45, p.aspect));
      mean = p.mean;
      glow = p.glow;
    } catch {
      // нет фото — мешок из одной бумаги, без надписей
    }
    if (this.disposed) return;
    const shape = { aspect, depth: S.bagDepth, belly: S.belly, pinch: S.pinch };
    const body = bagGeometry(shape);
    const seamG = seamGeometry(shape);
    let photo: Texture | null = null;
    if (canvas) {
      photo = new CanvasTexture(canvas);
      photo.colorSpace = SRGBColorSpace;
      photo.anisotropy = this.maxAniso;
      photo.minFilter = LinearMipmapLinearFilter;
    }
    const tone = (k: number) => (mean.map((v) => Math.min(255, v * k) / 255) as unknown) as [number, number, number];
    const paperRGB = tone(0.88);
    const paper = new MeshStandardMaterial({ map: this.noise, roughness: 0.92, metalness: 0, transparent: true });
    paper.color.setRGB(...paperRGB, SRGBColorSpace);
    const front = new MeshStandardMaterial({ map: photo, roughness: 0.6, metalness: 0, transparent: true, emissive: 0xffffff, emissiveMap: photo, emissiveIntensity: photo ? 0.32 : 0 });
    if (!photo) front.color.setRGB(...paperRGB, SRGBColorSpace);
    const seam = new MeshStandardMaterial({ map: this.noise, roughness: 0.9, transparent: true });
    seam.color.setRGB(...tone(0.7), SRGBColorSpace);
    const mesh = new Mesh(body, [paper, front]);
    mesh.userData.index = i;
    const seamMesh = new Mesh(seamG, seam);
    seamMesh.userData.index = i;
    const group = new Group();
    group.add(mesh, seamMesh);
    group.visible = false;
    this.rig.add(group);
    this.bags[i] = {
      group, body: mesh, front, paper, seam, mean,
      glow: [glow[0] / 255, glow[1] / 255, glow[2] / 255],
      geos: [body, seamG], photo, spinStart: -1, flipped: false,
    };
    if (this.bags.every(Boolean)) this.onLoaded();
  }

  /** Размеры: прямоугольник сцены (stage) внутри canvas, CSS px. Камера смотрит в центр stage, но рисует весь canvas
   *  (setViewOffset) — ореол и соседи не обрезаются краем stage. */
  setStage(stage: { left: number; top: number; width: number; height: number }, canvasW: number, canvasH: number, mobile: boolean) {
    this.mode = mobile ? S.mobile : S.desktop;
    this.mobile = mobile;
    const cam = this.camera;
    cam.aspect = stage.width / stage.height;
    cam.position.set(0, 0.35, this.dist);
    cam.lookAt(0, 0, 0);
    cam.setViewOffset(stage.width, stage.height, -stage.left, -stage.top, canvasW, canvasH);
    cam.updateProjectionMatrix();
    this.visH = 2 * this.dist * Math.tan((cam.fov * Math.PI) / 360);
    this.visW = this.visH * cam.aspect;
    const near = this.dist / (this.dist - S.activeForward);
    // мешок не шире ~70 % сцены (узкий телефон) и не выше доли высоты
    this.bagH = Math.min((this.mode.activeHeight * this.visH) / near, (0.7 * this.visW) / near / 0.9);
    this.slotX = this.mode.spacing * this.visW;
    this.slotPx = (this.slotX / this.visW) * stage.width;

    const bottom = -this.bagH / 2 - this.bagH * 0.1 + this.baseY();
    const r = this.bagH * 0.46;
    this.podium.scale.set(r, this.bagH * 0.045, r);
    this.podium.position.set(0, bottom - this.bagH * 0.0225, S.activeForward);
    this.shadow.scale.set(this.bagH * 0.75, this.bagH * 0.42, 1);
    this.shadow.position.set(0, bottom + 0.002, S.activeForward);
    this.halo.scale.set(this.bagH * 3, this.bagH * 2.6, 1);
    this.halo.position.set(0, this.baseY(), S.activeForward - 1.7);
    const beamH = this.visH * 1.2;
    this.beam.scale.set(this.bagH * 1.5, beamH, 1);
    this.beam.position.set(0, bottom + beamH / 2, S.activeForward - 0.9);
  }

  private baseY() {
    return this.bagH * 0.07;
  }

  get active() {
    return wrap(Math.round(this.dragging ? this.pos : this.target), this.n);
  }

  next(d: number) {
    this.target += d;
    if (this.reduced) { this.pos = this.target; this.vel = 0; }
    this.emitActive();
  }

  goTo(i: number) {
    let d = wrap(i - this.active, this.n);
    if (d > this.n / 2) d -= this.n;
    if (d) this.next(d);
  }

  spin() {
    const b = this.bags[this.active];
    if (!b) return;
    if (this.reduced) { b.flipped = !b.flipped; return; }
    if (b.spinStart >= 0) return; // уже крутится — повторное нажатие не ломает поворот
    b.spinStart = -2; // старт на ближайшем кадре
  }

  dragStart() {
    this.dragging = true;
    this.dragFrom = this.pos;
    this.vel = 0;
  }

  /** dx — сдвиг пальца, px (влево — отрицательный) */
  dragMove(dx: number) {
    if (!this.dragging) return;
    this.pos = this.dragFrom - dx / this.slotPx;
    if (this.reduced) this.target = this.pos;
    this.emitActive();
  }

  /** vx — скорость пальца, px/с */
  dragEnd(dx: number, vx: number) {
    if (!this.dragging) return;
    this.dragging = false;
    const from = Math.round(this.dragFrom);
    let t = Math.round(this.pos - (vx / this.slotPx) * 0.15);
    if (t === from && Math.abs(dx) > 30) t = from - Math.sign(dx);
    this.target = Math.max(from - 3, Math.min(from + 3, t));
    if (this.reduced) { this.pos = this.target; this.vel = 0; }
    this.emitActive();
  }

  setPointer(x: number, y: number) {
    this.pointer.set(x, y);
  }

  /** Индекс мешка под точкой (координаты нормализованы к canvas: −1…1) или −1 */
  pick(ndcX: number, ndcY: number): number {
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const meshes = this.bags.filter((b): b is Bag => Boolean(b?.group.visible)).map((b) => b.body);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    return hit ? (hit.object.userData.index as number) : -1;
  }

  private emitActive() {
    const a = this.active;
    if (a !== this.lastActive) {
      this.lastActive = a;
      this.onActive(a);
    }
  }

  /** Кадр. emerge(order) — насколько вышел из глубины мешок с порядковым номером order (|смещение| при старте), 0…1. */
  update(dt: number, clock: number, emerge: (order: number) => number) {
    if (!this.reduced && !this.dragging) {
      const a = S.spring.k * (this.target - this.pos) - S.spring.damping * this.vel;
      this.vel += a * dt;
      this.pos += this.vel * dt;
      if (Math.abs(this.target - this.pos) < 1e-4 && Math.abs(this.vel) < 1e-4) { this.pos = this.target; this.vel = 0; }
    }
    const m = this.mode;
    const n = this.n;
    const base = this.baseY();
    const act = this.active;

    // курсор: лёгкий поворот всей витрины, сглаженный
    const kp = this.reduced ? 0 : 1 - Math.pow(0.002, dt);
    this.pointerSmooth.lerp(this.pointer, kp);
    this.rig.rotation.y = this.pointerSmooth.x * S.cursor;
    this.rig.rotation.x = -this.pointerSmooth.y * S.cursor * 0.4;

    const eActive = emerge(0);
    for (let i = 0; i < n; i++) {
      const b = this.bags[i];
      if (!b) continue;
      let k = wrap(i - this.pos + n / 2, n) - n / 2;
      const ak = Math.abs(k);
      const sg = Math.sign(k);
      const order = Math.min(Math.abs(wrap(i - Math.round(this.target) + n / 2, n) - n / 2), 3);
      const e = emerge(order);
      const fade = 1 - smooth(m.visible, m.visible + 0.55, ak);
      const opacity = fade * Math.min(1, e * 1.6);
      b.group.visible = opacity > 0.01;
      if (!b.group.visible) continue;

      const near = Math.min(ak, 1);
      const x = sg * this.slotX * (ak <= 1 ? ak : 1 + (ak - 1) * 0.85);
      const z = S.activeForward * (1 - near) - m.depth * ak - (1 - e) * 7;
      const floatY = this.reduced ? 0 : S.float.amp * this.bagH * Math.sin(clock * S.float.speed + i * 1.9) * (1 - 0.4 * near);
      const y = base + floatY - (1 - e) * 0.35 * this.bagH;
      let rotY = S.activeTurn * (1 - near) - sg * m.turn * Math.min(ak, 1.2) + (1 - e) * -1.1;
      // поворот упаковки по кнопке: 360° с плавным разгоном и остановкой
      if (b.spinStart === -2) b.spinStart = clock;
      if (b.spinStart >= 0) {
        const p = (clock - b.spinStart) / S.spinSeconds;
        if (p >= 1) b.spinStart = -1;
        else rotY += Math.PI * 2 * easeInOut(p);
      }
      if (b.flipped) rotY += Math.PI;
      const sc = this.bagH * (1 - 0.08 * Math.min(ak, 2));
      b.group.position.set(x, y, z);
      b.group.rotation.set(0, rotY, this.reduced ? 0 : 0.012 * Math.sin(clock * 0.8 + i) * (1 - near * 0.5));
      b.group.scale.setScalar(sc);

      const dim = 1 - S.dimPerSlot * Math.min(ak, 2.2);
      b.front.color.setScalar(dim);
      b.front.emissiveIntensity = b.photo ? 0.32 * dim : 0;
      // материалы всегда transparent + depthWrite: мешки — отдельные объекты, three рисует их от дальнего
      // к ближнему, а при opacity 1 мешок выглядит и перекрывается как непрозрачный
      b.front.opacity = b.paper.opacity = b.seam.opacity = opacity;
    }

    // ореол: цвет активной упаковки, плавно
    const glow = this.bags[act]?.glow;
    if (glow) {
      const f = this.reduced ? 1 : 1 - Math.pow(1 - S.halo.follow, dt * 60);
      for (let c = 0; c < 3; c++) this.haloColor[c] += (glow[c] - this.haloColor[c]) * f;
    }
    const hu = this.halo.material.uniforms;
    (hu.uColor.value as number[]).splice(0, 3, ...this.haloColor);
    hu.uStrength.value = S.halo.strength * eActive * eActive; // ореол разгорается чуть позже мешка
    this.beam.material.uniforms.uStrength.value = S.beam * eActive;
    this.podium.material.opacity = eActive;
    this.podium.visible = eActive > 0.01;
    this.podium.position.z = S.activeForward - (1 - eActive) * 3;
    this.shadow.material.opacity = 0.55 * eActive;
    this.shadow.visible = !this.mobile; // на телефоне без теней
  }

  dispose() {
    this.disposed = true;
    for (const b of this.bags) {
      if (!b) continue;
      b.geos.forEach((g) => g.dispose());
      b.front.dispose();
      b.paper.dispose();
      b.seam.dispose();
      b.photo?.dispose();
    }
    this.halo.geometry.dispose();
    this.halo.material.dispose();
    this.beam.geometry.dispose();
    this.beam.material.dispose();
    this.podium.geometry.dispose();
    this.podium.material.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.noise.dispose();
    this.blob.dispose();
  }
}

