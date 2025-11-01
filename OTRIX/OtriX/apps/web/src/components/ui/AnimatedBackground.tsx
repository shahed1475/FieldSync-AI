"use client";

import { useEffect, useRef } from "react";

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    // Particle system
    const particles = Array.from({ length: 60 }).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 2 + 1,
      dx: (Math.random() - 0.5) * 0.5,
      dy: (Math.random() - 0.5) * 0.5,
      opacity: Math.random() * 0.5 + 0.2,
    }));

    let animationFrameId: number;

    const draw = () => {
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, w, h);

      // Draw gradient background
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, "rgba(110, 43, 255, 0.15)");
      gradient.addColorStop(0.5, "rgba(0, 166, 255, 0.08)");
      gradient.addColorStop(1, "rgba(233, 58, 255, 0.12)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // Draw particles
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);

        // Gradient for each particle
        const particleGradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2);
        particleGradient.addColorStop(0, `rgba(233, 58, 255, ${p.opacity})`);
        particleGradient.addColorStop(0.5, `rgba(110, 43, 255, ${p.opacity * 0.5})`);
        particleGradient.addColorStop(1, "rgba(233, 58, 255, 0)");

        ctx.fillStyle = particleGradient;
        ctx.fill();

        // Update particle position
        p.x += p.dx;
        p.y += p.dy;

        // Bounce off edges
        if (p.x < 0 || p.x > w) p.dx *= -1;
        if (p.y < 0 || p.y > h) p.dy *= -1;
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    // Handle window resize
    const handleResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;

      // Reset particle positions on resize
      particles.forEach(p => {
        if (p.x > w) p.x = w;
        if (p.y > h) p.y = h;
      });
    };

    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 opacity-50 pointer-events-none"
      style={{ mixBlendMode: "screen" }}
    />
  );
}
