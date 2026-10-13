import { useEffect, useRef } from "react";

/* ------------------------------- Colours -------------------------------- */

function parseColor(value, fallback = [34, 197, 94]) {
  const v = String(value || "").trim();
  const hex = v.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = v
    .match(/rgba?\(([^)]+)\)/)?.[1]
    ?.split(/[ ,/]+/)
    .map(Number);
  return rgb && rgb.length >= 3 ? rgb.slice(0, 3) : fallback;
}

/** The accent's "rival" colour (Tron's blue vs orange): hue turned by 150°. */
function rival([r, g, b]) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  if (d) {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    h =
      max === rr
        ? ((gg - bb) / d) % 6
        : max === gg
          ? (bb - rr) / d + 2
          : (rr - gg) / d + 4;
    h *= 60;
  }
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  const h2 = (h + 150) % 360;
  const l2 = Math.min(0.62, Math.max(0.5, l));
  const s2 = Math.max(0.75, s);
  const c = (1 - Math.abs(2 * l2 - 1)) * s2;
  const x = c * (1 - Math.abs(((h2 / 60) % 2) - 1));
  const m = l2 - c / 2;
  const [a, bb2, cc] =
    h2 < 60
      ? [c, x, 0]
      : h2 < 120
        ? [x, c, 0]
        : h2 < 180
          ? [0, c, x]
          : h2 < 240
            ? [0, x, c]
            : h2 < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [a, bb2, cc].map((v) => Math.round((v + m) * 255));
}

const rgba = ([r, g, b], a) =>
  `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

/* ------------------------------- The scene ------------------------------ */

const Z_NEAR = 1;
const Z_FAR = 34;
const CELL = 0.5; // world units between grid lines
const X_LINES = 26; // lines either side of the centre

const NOT_BACKGROUND =
  'a, button, input, select, textarea, label, dialog, [contenteditable], [role="button"], [role="menu"], .tile-cell, .profile, .toolbar, .design-panel, .share-fab, .site-footer, .toast';

const paceFor = (speed) => (speed >= 1.5 ? 0.3 : speed <= 0.6 ? 1.7 : 1);

export default function TronGrid({ speed = 1 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const pace = paceFor(speed);
    const ringLife = 2.2 / pace ** 0.25;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();
    let scroll = 0;
    let flare = 0;
    let accent = [34, 197, 94];
    let second = rival(accent);
    let colorCheck = 0;
    const pointer = { x: -1, y: -1, active: false };
    /** @type {{ x: number, z: number, dx: number, dz: number, v: number, color: number[], trail: {x:number,z:number}[], life: number, nextTurn: number }[]} */
    const cycles = [];
    /** @type {{ x: number, z: number, r: number, life: number }[]} */
    const rings = [];
    /** Sparks bursting from a tap above the horizon. */
    const sparks = [];
    /** Light drawn by dragging a finger / the mouse over the background. */
    const strokes = [];
    let dragging = false;

    const readColors = () => {
      const css = getComputedStyle(document.documentElement).getPropertyValue(
        "--accent",
      );
      accent = parseColor(css, accent);
      second = rival(accent);
    };

    const horizon = () => H * 0.44;
    /** World (x, z) -> screen, or null behind the camera. */
    const project = (x, z) => {
      if (z <= 0.05) return null;
      const s = Z_NEAR / z;
      const hy = horizon();
      return { x: W / 2 + x * W * 0.5 * s * 0.55, y: hy + (H - hy) * s, s };
    };
    /** Screen -> world point on the floor (null above the horizon). */
    const unproject = (sx, sy) => {
      const hy = horizon();
      if (sy <= hy + 2) return null;
      const s = (sy - hy) / (H - hy);
      return { x: (sx - W / 2) / (W * 0.5 * s * 0.55), z: Z_NEAR / s };
    };

    const snap = (v) => Math.round(v / CELL) * CELL;

    function spawnCycle(from, dir, color) {
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      const [dx, dz] = dir || dirs[Math.floor(Math.random() * 4)];
      const start = from || {
        x: snap((Math.random() - 0.5) * 10),
        z: snap(6 + Math.random() * 20),
      };
      cycles.push({
        x: snap(start.x),
        z: snap(start.z),
        dx,
        dz,
        v: 2.2 + Math.random() * 1.6,
        color: color || (Math.random() < 0.5 ? accent : second),
        trail: [{ x: snap(start.x), z: snap(start.z) }],
        life: 0,
        nextTurn: 0.6 + Math.random() * 2.2,
      });
      if (cycles.length > 18) cycles.shift();
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, W * H > 1.2e6 ? 1.25 : 1.6);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ---------------------------- Drawing ---------------------------- */

    function drawSky() {
      const hy = horizon();
      // Glow rising from the horizon.
      const g = ctx.createLinearGradient(0, hy - H * 0.35, 0, hy + 4);
      g.addColorStop(0, rgba(accent, 0));
      g.addColorStop(0.75, rgba(accent, 0.07 + flare * 0.08));
      g.addColorStop(1, rgba(accent, 0.28 + flare * 0.3));
      ctx.fillStyle = g;
      ctx.fillRect(0, hy - H * 0.35, W, H * 0.35 + 4);
      // Faint scan lines drifting up through the sky.
      ctx.strokeStyle = rgba(accent, 0.05);
      ctx.lineWidth = 1;
      const gap = 14;
      const off = (scroll * 9) % gap; // follows the floor, so it slows down too
      ctx.beginPath();
      for (let y = hy - off; y > 0; y -= gap) {
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
      // The horizon line itself.
      ctx.strokeStyle = rgba(accent, 0.25 + flare * 0.4);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.lineTo(W, hy);
      ctx.stroke();
      ctx.strokeStyle = rgba([255, 255, 255], 0.55 + flare * 0.4);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    function drawFloor() {
      const hy = horizon();
      // Floor sheen.
      const g = ctx.createLinearGradient(0, hy, 0, H);
      g.addColorStop(0, rgba(accent, 0.12 + flare * 0.1));
      g.addColorStop(1, rgba(accent, 0.02));
      ctx.fillStyle = g;
      ctx.fillRect(0, hy, W, H - hy);

      const boost = 1 + flare * 1.6;
      // Lines across (constant z), coming towards the viewer.
      const off = scroll % CELL;
      for (let z = Z_NEAR + CELL - off; z <= Z_FAR; z += CELL) {
        const p = project(0, z);
        const fade = Math.min(1, (Z_FAR - z) / (Z_FAR * 0.7));
        const a = (0.08 + 0.4 * p.s) * fade * boost;
        ctx.strokeStyle = rgba(accent, a * 0.35);
        ctx.lineWidth = 1 + 5 * p.s;
        ctx.beginPath();
        ctx.moveTo(0, p.y);
        ctx.lineTo(W, p.y);
        ctx.stroke();
        ctx.strokeStyle = rgba(accent, a);
        ctx.lineWidth = 0.6 + 1.4 * p.s;
        ctx.stroke();
      }
      // Lines along (constant x), meeting at the vanishing point: one path,
      // one gradient (bright near, fading into the distance).
      const near = project(0, Z_NEAR * 0.6);
      const far = project(0, Z_FAR);
      const grad = ctx.createLinearGradient(0, near.y, 0, far.y);
      grad.addColorStop(0, rgba(accent, 0.5 * boost));
      grad.addColorStop(1, rgba(accent, 0.04));
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let k = -X_LINES; k <= X_LINES; k++) {
        const a1 = project(k * CELL, Z_NEAR * 0.6);
        const a2 = project(k * CELL, Z_FAR);
        ctx.moveTo(a1.x, a1.y);
        ctx.lineTo(a2.x, a2.y);
      }
      ctx.stroke();
    }

    function drawPointerGlow() {
      if (!pointer.active || pointer.y <= horizon()) return;
      const r = 80 + 140 * ((pointer.y - horizon()) / (H - horizon()));
      const g = ctx.createRadialGradient(
        pointer.x,
        pointer.y,
        0,
        pointer.x,
        pointer.y,
        r,
      );
      g.addColorStop(0, rgba(accent, 0.22));
      g.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(pointer.x - r, pointer.y - r, r * 2, r * 2);
    }

    function drawRings() {
      for (const ring of rings) {
        const a = Math.max(0, 1 - ring.life / ringLife);
        for (const [color, width, alpha] of [
          [ring.color, 8, 0.25],
          [[255, 255, 255], 1.6, 0.9],
        ]) {
          ctx.strokeStyle = rgba(color, a * alpha);
          ctx.beginPath();
          let started = false;
          if (ring.r <= 0) continue;
          for (let i = 0; i <= 72; i++) {
            const t = (i / 72) * Math.PI * 2;
            const p = project(
              ring.x + Math.cos(t) * ring.r,
              ring.z + Math.sin(t) * ring.r,
            );
            if (!p || p.y > H + 40) {
              started = false;
              continue;
            }
            ctx.lineWidth = Math.max(0.5, width * p.s);
            if (!started) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
            started = true;
          }
          ctx.stroke();
        }
      }
    }

    function drawCycles() {
      for (const c of cycles) {
        const pts = [...c.trail, { x: c.x, z: c.z }]
          .map((q) => project(q.x, q.z))
          .filter(Boolean);
        if (pts.length < 2) continue;
        const fadeIn = Math.min(1, c.life * 3);
        // Wide soft glow, then the bright core of the trail.
        for (const [width, alpha, color] of [
          [10, 0.18, c.color],
          [3.2, 0.7, c.color],
          [1.1, 0.9, [255, 255, 255]],
        ]) {
          ctx.strokeStyle = rgba(color, alpha * fadeIn);
          ctx.lineWidth = width * Math.max(0.35, pts[pts.length - 1].s);
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        // The cycle: a bright head.
        const head = pts[pts.length - 1];
        const r = 3 + 9 * head.s;
        const g = ctx.createRadialGradient(
          head.x,
          head.y,
          0,
          head.x,
          head.y,
          r * 2.4,
        );
        g.addColorStop(0, rgba([255, 255, 255], 0.95 * fadeIn));
        g.addColorStop(0.3, rgba(c.color, 0.8 * fadeIn));
        g.addColorStop(1, rgba(c.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(head.x, head.y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawStrokes() {
      if (strokes.length < 2) return;
      for (const [width, alpha, color] of [
        [12, 0.16, accent],
        [3, 0.6, accent],
        [1.2, 0.9, [255, 255, 255]],
      ]) {
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        for (let i = 1; i < strokes.length; i++) {
          const a = strokes[i - 1];
          const b = strokes[i];
          if (b.start) continue;
          ctx.strokeStyle = rgba(color, alpha * Math.max(0, 1 - b.age / 1.2));
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    function drawSparks() {
      for (const s of sparks) {
        const a = Math.max(0, 1 - s.life / s.max);
        ctx.fillStyle = rgba(s.color, a);
        ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
      }
    }

    /* ---------------------------- Updating --------------------------- */

    function step(dt) {
      const floorSpeed = 1.6 * pace;
      scroll += floorSpeed * dt;
      flare = Math.max(0, flare - dt * 1.4);

      for (const c of cycles) {
        c.life += dt;
        const move = c.v * pace * dt;
        c.x += c.dx * move;
        c.z += c.dz * move - floorSpeed * dt;
        for (const p of c.trail) p.z -= floorSpeed * dt;
        c.nextTurn -= dt * pace;
        if (c.nextTurn <= 0) {
          // Turn 90° at the nearest grid crossing: a corner in the trail.
          c.x = snap(c.x);
          c.z = snap(c.z);
          c.trail.push({ x: c.x, z: c.z });
          [c.dx, c.dz] = Math.random() < 0.5 ? [-c.dz, c.dx] : [c.dz, -c.dx];
          c.nextTurn = 0.5 + Math.random() * 2.4;
        }
        // Keep trails a sensible length.
        while (c.trail.length > 8) c.trail.shift();
      }
      // Drop cycles that left the floor; keep a few riding.
      for (let i = cycles.length - 1; i >= 0; i--) {
        const c = cycles[i];
        if (
          c.z < Z_NEAR * 0.35 ||
          c.z > Z_FAR + 2 ||
          Math.abs(c.x) > X_LINES * CELL + 2 ||
          c.life > 30
        )
          cycles.splice(i, 1);
      }
      while (cycles.length < 4) spawnCycle(null, null, null);

      for (const ring of rings) {
        ring.life += dt;
        ring.r += dt * Math.sqrt(pace) * (4.5 + ring.r * 0.6);
        ring.z -= floorSpeed * dt;
      }
      for (let i = rings.length - 1; i >= 0; i--)
        if (rings[i].life > ringLife) rings.splice(i, 1);

      for (const s of sparks) {
        s.life += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 260 * dt;
      }
      for (let i = sparks.length - 1; i >= 0; i--)
        if (sparks[i].life > sparks[i].max) sparks.splice(i, 1);
      for (const p of strokes) p.age += dt;
      while (strokes.length && strokes[0].age > 1.2) strokes.shift();
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if ((colorCheck -= dt) <= 0) {
        readColors();
        colorCheck = 1;
      }
      step(dt);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      drawSky();
      drawFloor();
      drawPointerGlow();
      drawRings();
      drawCycles();
      drawStrokes();
      drawSparks();
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    }

    /* ----------------------------- Input ----------------------------- */

    function onDown(e) {
      if (e.button > 0 || e.target.closest?.(NOT_BACKGROUND)) return;
      const hit = unproject(e.clientX, e.clientY);
      flare = 1;
      dragging = true;
      strokes.push({ x: e.clientX, y: e.clientY, age: 0, start: true });
      // A tiny buzz on phones that support it.
      if (e.pointerType === "touch") navigator.vibrate?.(12);
      if (hit) {
        const color = Math.random() < 0.5 ? accent : second;
        rings.push({ x: hit.x, z: hit.z, r: 0.05, life: 0, color });
        rings.push({
          x: hit.x,
          z: hit.z,
          r: -0.9,
          life: 0,
          color: color === accent ? second : accent,
        });
        if (rings.length > 8) rings.splice(0, rings.length - 8);
        for (const dir of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          spawnCycle(hit, dir, dir[0] ? accent : second);
      } else {
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = 80 + Math.random() * 220;
          sparks.push({
            x: e.clientX,
            y: e.clientY,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 60,
            life: 0,
            max: 0.6 + Math.random() * 0.6,
            color: Math.random() < 0.5 ? accent : second,
          });
        }
        if (sparks.length > 160) sparks.splice(0, sparks.length - 160);
      }
    }
    function onMove(e) {
      if (dragging) {
        strokes.push({ x: e.clientX, y: e.clientY, age: 0 });
        if (strokes.length > 240) strokes.shift();
      }
      if (e.pointerType !== "mouse") return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = !e.target.closest?.(NOT_BACKGROUND);
    }
    const onLeave = () => {
      pointer.active = false;
    };
    const onUp = () => {
      dragging = false;
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    resize();
    readColors();
    for (let i = 0; i < 5; i++) spawnCycle(null, null, null);
    window.addEventListener("resize", resize);

    if (reduced) {
      // One calm still frame: grid and horizon, no motion.
      ctx.globalCompositeOperation = "lighter";
      drawSky();
      drawFloor();
      ctx.globalCompositeOperation = "source-over";
    } else {
      window.addEventListener("pointerdown", onDown, { passive: true });
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      document.addEventListener("pointerleave", onLeave);
      document.addEventListener("visibilitychange", onVisibility);
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [speed]);

  return <canvas ref={canvasRef} className="fx fx-tron" />;
}
