"use client";

import { useEffect, useRef } from "react";

/**
 * Celebration confetti for the activation success state.
 *
 * Deliberately hand-rolled rather than pulled from a library: it is one canvas
 * and a few dozen particles, it must not ship a dependency to customers, and it
 * has to be trivial to switch off entirely for reduced-motion users.
 *
 * It is a fixed, pointer-transparent overlay, so it can never affect layout or
 * block the button underneath it.
 */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  shape: "ribbon" | "dot";
  life: number;
};

const COLORS = ["#7c3aed", "#4f46e5", "#2563eb", "#ec4899", "#f59e0b", "#10b981", "#38bdf8"];
const DURATION_MS = 2600;
const GRAVITY = 0.16;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    // A celebration is decoration, never a requirement: skip it entirely.
    if (!canvas || prefersReducedMotion()) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    resize();

    // Two cannons angled inward, plus a light sprinkle from above, so the burst
    // reads from any screen size rather than from one corner.
    const particles: Particle[] = [];
    const burst = (x: number, y: number, angle: number, spread: number, count: number) => {
      for (let index = 0; index < count; index += 1) {
        const velocity = 9 + Math.random() * 7;
        const heading = angle + (Math.random() - 0.5) * spread;

        particles.push({
          x,
          y,
          vx: Math.cos(heading) * velocity,
          vy: Math.sin(heading) * velocity,
          size: 5 + Math.random() * 6,
          rotation: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.34,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
          shape: Math.random() > 0.32 ? "ribbon" : "dot",
          life: 1,
        });
      }
    };

    burst(width * 0.06, height * 0.92, -Math.PI / 3.2, 1.1, 70);
    burst(width * 0.94, height * 0.92, (-Math.PI * 4) / 3.2, 1.1, 70);
    for (let index = 0; index < 26; index += 1) {
      burst(Math.random() * width, -12 - Math.random() * 60, Math.PI / 2, 0.5, 1);
    }

    const startedAt = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const elapsed = now - startedAt;
      // Fade the whole burst out over the last third so it never pops away.
      const fade = elapsed > DURATION_MS * 0.66 ? 1 - (elapsed - DURATION_MS * 0.66) / (DURATION_MS * 0.34) : 1;

      context.clearRect(0, 0, width, height);
      context.globalAlpha = Math.max(0, fade);

      for (const particle of particles) {
        particle.vy += GRAVITY;
        particle.vx *= 0.995;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rotation += particle.spin;

        if (particle.y > height + 40) continue;

        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.fillStyle = particle.color;

        if (particle.shape === "ribbon") {
          context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.52);
        } else {
          context.beginPath();
          context.arc(0, 0, particle.size * 0.34, 0, Math.PI * 2);
          context.fill();
        }

        context.restore();
      }

      context.globalAlpha = 1;

      if (elapsed < DURATION_MS) {
        frame = requestAnimationFrame(draw);
      } else {
        context.clearRect(0, 0, width, height);
      }
    };

    frame = requestAnimationFrame(draw);

    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      context.clearRect(0, 0, width, height);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      // Decorative only: announced by the success message, never by itself.
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
}