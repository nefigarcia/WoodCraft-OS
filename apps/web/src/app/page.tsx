"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_FRAMES = 120;
const GOLD   = "#E8C547";
const TEAL   = "#5FC4C4";
const PURPLE = "#B07EE8";
const RED    = "#E87070";
const GREEN  = "#A0C870";
const ORANGE = "#F0A030";
const BG     = "#080A0C";
const BG2    = "#0A0C10";
const CARD   = "#0E1114";
const BORDER = "#1E2226";
const TEXT   = "#D0CEC8";
const MUTED  = "#6A7280";
const DIM    = "#3A4050";

// ─── Data ─────────────────────────────────────────────────────────────────────

const HERO_PHASES = [
  {
    label: "CABINET DESIGN, REIMAGINED",
    h1: "Design Cabinets",
    h2: "In Minutes",
    sub: "Draw your entire project in 3D, right in the browser. Change one measurement and every panel, door, and shelf updates automatically.",
    accent: GOLD,
    showCTA: false,
  },
  {
    label: "AI-POWERED ACCURACY",
    h1: "Catch Errors",
    h2: "Before You Cut",
    sub: "AI scans every design for door collisions, drawer clearances, and hinge spacing before a single board is touched.",
    accent: TEAL,
    showCTA: false,
  },
  {
    label: "FROM DESIGN TO SHOP FLOOR",
    h1: "One Click to",
    h2: "Your CNC",
    sub: "Send cut lists and G-code directly to your machine. No manual programming, no post-processing, no errors in translation.",
    accent: RED,
    showCTA: false,
  },
  {
    label: "14-DAY FREE TRIAL",
    h1: "Software Built",
    h2: "for Cabinet Shops",
    sub: "Stop patching together spreadsheets, PDFs, and outdated CAD tools. WoodCraft OS connects design, production, and installation in one place.",
    accent: PURPLE,
    showCTA: true,
  },
];

const FEATURES = [
  {
    icon: "⬡",
    title: "3D Cabinet Designer",
    desc: "Design any cabinet configuration in a live 3D view. Every dimension is connected — resize one part and the whole project updates instantly.",
    color: GOLD,
  },
  {
    icon: "✦",
    title: "AI Error Checker",
    desc: "Before you cut a single board, AI reviews every measurement for clearance issues, collisions, and machine feasibility. Zero surprises at installation.",
    color: TEAL,
  },
  {
    icon: "⚙",
    title: "CNC-Ready Export",
    desc: "Generate G-code and DXF files tuned to your specific machine. Supports HOLZHER, Biesse, SCM, and more — no manual programming needed.",
    color: RED,
  },
  {
    icon: "▦",
    title: "Quotes & Cut Lists",
    desc: "Auto-generate optimized cut lists and professional client quotes directly from your design. Always up to date as the project changes.",
    color: ORANGE,
  },
  {
    icon: "◎",
    title: "Installer App",
    desc: "Your crew gets the full 3D model, measurements, and AR overlay on their phone. They can flag issues from the job site and keep the shop informed.",
    color: GREEN,
  },
  {
    icon: "◈",
    title: "Projects & Clients",
    desc: "Manage every client, project, revision, and production run in one place. Built around how cabinet shops actually work, not generic business software.",
    color: PURPLE,
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Design in 3D",
    desc: "Open a project and start placing cabinets. Set the room dimensions, choose styles, and configure every door, drawer, and shelf. The app calculates all the parts for you — no manual math.",
    color: GOLD,
    icon: "⬡",
  },
  {
    step: "02",
    title: "Validate before you build",
    desc: "Hit validate and AI checks the entire design in seconds. It catches door swings that would clash, drawers that won't clear, hinge spacing that won't work. Fix issues on screen, not at the job site.",
    color: TEAL,
    icon: "✦",
  },
  {
    step: "03",
    title: "Cut, build, install",
    desc: "Export an optimized cut list for your sheet goods and send G-code directly to your CNC. Your installer gets the 3D model and measurements on their phone. The whole job, start to finish.",
    color: GREEN,
    icon: "⚙",
  },
];

const STATS = [
  { display: "2×", label: "Faster from design to approved quote", color: GOLD },
  { display: "0", label: "Measurement errors reaching installation", color: TEAL },
  { display: "3 min", label: "To generate a full cut list", color: ORANGE },
  { display: "1 click", label: "From finished design to CNC G-code", color: RED },
];

const PLANS = [
  {
    name: "Starter",
    price: 99,
    desc: "For small shops getting started",
    features: [
      "1 designer seat",
      "Up to 10 active projects",
      "Full 3D cabinet designer",
      "Cut list & DXF export",
      "Client quotes as PDF",
      "Email support",
    ],
    cta: "Start free trial",
    popular: false,
    color: TEAL,
    href: "/register",
  },
  {
    name: "Professional",
    price: 199,
    desc: "The full platform for growing shops",
    features: [
      "5 designer seats",
      "Unlimited projects",
      "AI validation & copilot",
      "CNC G-code export",
      "HOLZHER, Biesse, SCM profiles",
      "Realtime team collaboration",
      "Priority support",
    ],
    cta: "Start free trial",
    popular: true,
    color: GOLD,
    href: "/register",
  },
  {
    name: "Enterprise",
    price: null,
    desc: "For multi-location operations",
    features: [
      "Unlimited designer seats",
      "Multiple shop locations",
      "Custom CNC machine profiles",
      "API access & webhooks",
      "Advanced analytics",
      "Dedicated account manager",
      "SLA guarantee",
    ],
    cta: "Contact sales",
    popular: false,
    color: PURPLE,
    href: "/register",
  },
];

const BANNER_H = 38;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function padNum(n: number) {
  return String(n).padStart(4, "0");
}

// ─── PulseRing ────────────────────────────────────────────────────────────────

function PulseRing({ color = GOLD, size = 8 }: { color?: string; size?: number }) {
  return (
    <span className="relative flex flex-shrink-0" style={{ width: size, height: size }}>
      <span
        className="absolute inline-flex rounded-full animate-ping"
        style={{ width: "100%", height: "100%", backgroundColor: color, opacity: 0.6 }}
      />
      <span
        className="relative inline-flex rounded-full"
        style={{ width: "100%", height: "100%", backgroundColor: color }}
      />
    </span>
  );
}

// ─── DevBanner ────────────────────────────────────────────────────────────────

function DevBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="fixed left-0 right-0 flex items-center justify-center px-8"
      style={{
        top: 0,
        zIndex: 60,
        height: BANNER_H,
        background: "rgba(232,197,71,0.07)",
        borderBottom: "1px solid rgba(232,197,71,0.18)",
        backdropFilter: "blur(12px)",
      }}
    >
      <p className="text-center" style={{ fontSize: 11, color: "#8A8070", letterSpacing: "0.3px" }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "2px",
            color: GOLD,
            background: "rgba(232,197,71,0.12)",
            border: "1px solid rgba(232,197,71,0.25)",
            padding: "2px 6px",
            marginRight: 8,
          }}
        >
          BETA
        </span>
        WoodCraft OS is currently in development.{" "}
        <span style={{ color: "#A09070" }}>Share your feedback with </span>
        <span style={{ color: GOLD, fontWeight: 600 }}>Mia</span>
        <span style={{ color: "#A09070" }}>, our AI agent — call </span>
        <a
          href="tel:+12678619083"
          style={{ color: GOLD, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          (267) 861-9083
        </a>
      </p>
      <button
        onClick={onDismiss}
        className="absolute right-3 transition-colors"
        style={{ fontSize: 14, color: DIM, lineHeight: 1, padding: "4px 8px" }}
        onMouseEnter={(e) => ((e.target as HTMLElement).style.color = MUTED)}
        onMouseLeave={(e) => ((e.target as HTMLElement).style.color = DIM)}
        aria-label="Dismiss banner"
      >
        ✕
      </button>
    </div>
  );
}

// ─── PricingModal ─────────────────────────────────────────────────────────────

function PricingModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(8,10,12,0.94)", backdropFilter: "blur(16px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-3xl my-8">
        {/* Header */}
        <div className="text-center mb-8 px-2">
          <div className="flex items-center justify-center gap-2 mb-3">
            <PulseRing color={GOLD} size={7} />
            <span style={{ fontSize: 10, letterSpacing: "4px", color: GOLD }}>14-DAY FREE TRIAL</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-white mb-2">
            Start building today
          </h2>
          <p style={{ fontSize: 13, color: MUTED }}>No credit card required · Cancel anytime</p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px" style={{ background: BORDER }}>
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className="relative flex flex-col"
              style={{
                background: plan.popular ? CARD : BG,
                borderTop: `2px solid ${plan.color}`,
                padding: "24px 20px",
              }}
            >
              {plan.popular && (
                <div
                  className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-[3px] px-3 py-1 whitespace-nowrap"
                  style={{ background: plan.color, color: BG }}
                >
                  MOST POPULAR
                </div>
              )}

              <div style={{ fontSize: 10, letterSpacing: "2px", color: plan.color, marginBottom: 4 }}>
                {plan.name.toUpperCase()}
              </div>
              <div className="mb-1">
                {plan.price != null ? (
                  <span className="text-3xl font-bold text-white">
                    ${plan.price}
                    <span style={{ fontSize: 13, fontWeight: 400, color: MUTED }}>/mo</span>
                  </span>
                ) : (
                  <span className="text-2xl font-bold text-white">Custom</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 16 }}>{plan.desc}</div>

              <div className="flex-1 space-y-2 mb-5">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-start gap-2">
                    <span style={{ color: plan.color, fontSize: 10, marginTop: 2, flexShrink: 0 }}>▸</span>
                    <span style={{ fontSize: 11, color: "#8A9090" }}>{f}</span>
                  </div>
                ))}
              </div>

              <Link
                href={plan.href}
                className="block w-full text-center font-bold transition-all active:scale-95"
                style={{
                  fontSize: 11,
                  letterSpacing: "2px",
                  padding: "13px 0",
                  background: plan.popular ? plan.color : "transparent",
                  color: plan.popular ? BG : plan.color,
                  border: `1px solid ${plan.color}`,
                }}
              >
                {plan.cta.toUpperCase()} →
              </Link>
            </div>
          ))}
        </div>

        <div className="text-center mt-6 px-2">
          <p style={{ fontSize: 10, color: DIM }}>
            All plans include a 14-day free trial · No credit card required · Cancel anytime
          </p>
          <button
            onClick={onClose}
            className="mt-4 transition-colors"
            style={{ fontSize: 11, letterSpacing: "2px", color: DIM }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = MUTED)}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = DIM)}
          >
            Close ✕
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav({ onCTA, topOffset = 0 }: { onCTA: () => void; topOffset?: number }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav
      className="fixed left-0 right-0 z-40 flex items-center justify-between transition-all duration-300"
      style={{
        top: topOffset,
        padding: "0 20px",
        height: 52,
        background: scrolled ? "rgba(8,10,12,0.96)" : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: scrolled ? `1px solid ${BORDER}` : "1px solid transparent",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2">
        <PulseRing color={GOLD} size={7} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "2px", color: GOLD, fontFamily: "monospace" }}>
          WOODCRAFT OS
        </span>
      </div>

      {/* Mid links — desktop only */}
      <div className="hidden md:flex items-center gap-8">
        {(["Features", "How It Works", "Pricing"] as const).map((item) => (
          <button
            key={item}
            onClick={item === "Pricing" ? onCTA : undefined}
            className="transition-colors"
            style={{ fontSize: 10, letterSpacing: "2px", color: scrolled ? MUTED : "#9A9090" }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#fff")}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = scrolled ? MUTED : "#9A9090")}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/login"
          className="transition-colors hidden sm:block"
          style={{ fontSize: 10, letterSpacing: "2px", color: MUTED }}
          onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#fff")}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.color = MUTED)}
        >
          SIGN IN
        </Link>
        <button
          onClick={onCTA}
          className="font-bold transition-all active:scale-95"
          style={{ fontSize: 10, letterSpacing: "2px", padding: "7px 14px", background: GOLD, color: BG }}
        >
          FREE TRIAL
        </button>
      </div>
    </nav>
  );
}

// ─── ScrollVideoHero ──────────────────────────────────────────────────────────

function ScrollVideoHero({ onCTA }: { onCTA: () => void }) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const sectionRef   = useRef<HTMLDivElement>(null);
  const framesRef    = useRef<(HTMLImageElement | null)[]>(Array(TOTAL_FRAMES).fill(null));
  const loadedRef    = useRef(0);
  const canvasSizeRef = useRef({ w: 0, h: 0 });
  const currentFrameRef = useRef(0);
  const rafRef       = useRef<number | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [phase, setPhase] = useState(0);
  const phaseRef = useRef(0);

  // Preload all frames
  useEffect(() => {
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const img = new Image();
      const idx = i;
      img.onload = () => {
        framesRef.current[idx] = img;
        loadedRef.current++;
        setLoadProgress(loadedRef.current / TOTAL_FRAMES);
        if (idx === 0) drawFrame(0);
      };
      img.src = `/landing/frame_${padNum(i + 1)}.jpg`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set canvas dimensions on mount and resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      canvasSizeRef.current = { w: canvas.width, h: canvas.height };
      drawFrame(currentFrameRef.current);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawFrame = useCallback((idx: number) => {
    const canvas = canvasRef.current;
    const img    = framesRef.current[idx];
    if (!canvas || !img || !img.complete) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = canvasSizeRef.current;
    const imgAr = 960 / 540;
    const cvAr  = w / h;
    let dw: number, dh: number, dx: number, dy: number;
    if (cvAr > imgAr) {
      dw = w; dh = w / imgAr;
    } else {
      dh = h; dw = h * imgAr;
    }
    dx = (w - dw) / 2;
    dy = (h - dh) / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, dx, dy, dw, dh);
  }, []);

  // Scroll → frame + phase
  useEffect(() => {
    const handleScroll = () => {
      const section = sectionRef.current;
      if (!section) return;
      const rect     = section.getBoundingClientRect();
      const sectionH = section.offsetHeight;
      const viewH    = window.innerHeight;
      const scrolled = Math.max(0, -rect.top);
      const progress = Math.min(1, scrolled / Math.max(1, sectionH - viewH));

      const newFrame = Math.min(TOTAL_FRAMES - 1, Math.floor(progress * TOTAL_FRAMES));
      if (newFrame !== currentFrameRef.current) {
        currentFrameRef.current = newFrame;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => drawFrame(newFrame));
      }

      const newPhase = progress < 0.25 ? 0 : progress < 0.5 ? 1 : progress < 0.75 ? 2 : 3;
      if (newPhase !== phaseRef.current) {
        phaseRef.current = newPhase;
        setPhase(newPhase);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [drawFrame]);

  const ph = HERO_PHASES[phase];

  return (
    <div ref={sectionRef} style={{ height: "500vh", position: "relative" }}>
      <div className="sticky top-0 overflow-hidden" style={{ height: "100vh" }}>
        {/* Background placeholder */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, #0A0E12 0%, #080A0C 60%, #0C0E14 100%)" }}
        />

        {/* Canvas — z-index 1 (below gradients and text) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{
            zIndex: 1,
            width: "100%",
            height: "100%",
            opacity: loadProgress > 0.02 ? 1 : 0,
            transition: "opacity 0.8s ease",
          }}
        />

        {/* Gradient overlays — z-index 2, below text layer (z-index 10) */}
        <div
          className="absolute inset-0"
          style={{ zIndex: 2, background: "linear-gradient(to bottom, rgba(8,10,12,0.55) 0%, rgba(8,10,12,0) 40%, rgba(8,10,12,0.7) 100%)" }}
        />
        <div
          className="absolute inset-0"
          style={{ zIndex: 2, background: "linear-gradient(to right, rgba(8,10,12,0.75) 0%, rgba(8,10,12,0.25) 55%, rgba(8,10,12,0) 100%)" }}
        />

        {/* Text overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            zIndex: 10,
          }}
          className="sm:px-10 md:px-16"
        >
          <div style={{ maxWidth: 540, width: "100%" }}>
            {(() => {
              const p = HERO_PHASES[phase];
              return (
                <div key={phase} className="enter-fade-up">
                  {/* Label */}
                  <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
                    <PulseRing color={p.accent} size={6} />
                    <span style={{ fontSize: 9, letterSpacing: "3px", color: p.accent, fontFamily: "monospace" }}>
                      {p.label}
                    </span>
                  </div>

                  {/* Heading */}
                  <h1
                    className="font-bold leading-tight text-white"
                    style={{
                      fontSize: "clamp(28px, 5vw, 52px)",
                      fontFamily: "'JetBrains Mono','Fira Code',monospace",
                      marginBottom: 16,
                    }}
                  >
                    {p.h1}
                    <br />
                    <span style={{ color: p.accent }}>{p.h2}</span>
                  </h1>

                  {/* Sub */}
                  <p style={{ fontSize: 14, color: "#B0A898", lineHeight: 1.75, maxWidth: 420, marginBottom: p.showCTA ? 28 : 0 }}>
                    {p.sub}
                  </p>

                  {/* CTA */}
                  {p.showCTA && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={onCTA}
                        className="font-bold active:scale-95"
                        style={{ fontSize: 11, letterSpacing: "2px", padding: "13px 24px", background: p.accent, color: BG }}
                      >
                        SEE PRICING →
                      </button>
                      <Link
                        href="/register"
                        className="font-bold"
                        style={{ fontSize: 11, letterSpacing: "2px", padding: "13px 24px", border: `1px solid ${BORDER}`, color: TEXT }}
                      >
                        START FREE
                      </Link>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Phase progress — hidden on small screens */}
        <div
          className="absolute hidden sm:flex flex-col gap-1.5"
          style={{ right: 24, top: "50%", transform: "translateY(-50%)", zIndex: 10 }}
        >
          {HERO_PHASES.map((p, i) => (
            <div
              key={i}
              style={{
                width: 2,
                height: phase === i ? 36 : 10,
                background: phase === i ? p.accent : DIM,
                transition: "all 0.4s ease",
                borderRadius: 1,
              }}
            />
          ))}
        </div>

        {/* Loading bar */}
        {loadProgress < 0.98 && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <div style={{ height: 1, width: 120, background: "#1E2226", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${loadProgress * 100}%`,
                  background: ph.accent,
                  transition: "width 0.2s ease",
                }}
              />
            </div>
            <span style={{ fontSize: 9, letterSpacing: "2px", color: DIM }}>
              {Math.round(loadProgress * 100)}%
            </span>
          </div>
        )}

        {/* Scroll hint */}
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
          style={{ opacity: phase === 0 ? 1 : 0, transition: "opacity 0.5s ease", pointerEvents: "none" }}
        >
          <span style={{ fontSize: 9, letterSpacing: "3px", color: DIM }}>SCROLL</span>
          <div
            className="animate-bounce"
            style={{ width: 1, height: 20, background: `linear-gradient(to bottom, ${DIM}, transparent)` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── FeaturesSection ──────────────────────────────────────────────────────────

function FeaturesSection() {
  return (
    <section className="px-5 sm:px-10 py-16 sm:py-24" style={{ background: BG }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ fontSize: 10, letterSpacing: "4px", color: DIM, marginBottom: 10 }}>FEATURES</div>
        <h2 className="font-bold text-white text-2xl sm:text-3xl mb-2">
          Everything your shop needs in one place
        </h2>
        <p className="mb-10 sm:mb-14" style={{ fontSize: 14, color: MUTED }}>
          From the first sketch to the final install.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: BORDER }}>
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, desc, color }: (typeof FEATURES)[0]) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? CARD : BG,
        borderTop: `2px solid ${hovered ? color : "transparent"}`,
        padding: "28px 24px",
        transition: "background 0.2s ease, border-color 0.2s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Glow */}
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "60%",
          background: `radial-gradient(ellipse at 50% -20%, ${color}08 0%, transparent 70%)`,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.3s ease",
          pointerEvents: "none",
        }}
      />
      <div className="flex items-center gap-3 mb-4">
        <PulseRing color={color} size={7} />
        <span style={{ fontSize: 22, color }}>{icon}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.75 }}>{desc}</div>
    </div>
  );
}

// ─── HowItWorksSection ────────────────────────────────────────────────────────

function HowItWorksSection() {
  return (
    <section className="px-5 sm:px-10 py-16 sm:py-24" style={{ background: BG2 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ fontSize: 10, letterSpacing: "4px", color: DIM, marginBottom: 10 }}>HOW IT WORKS</div>
        <h2 className="font-bold text-white text-2xl sm:text-3xl mb-2">
          Design to delivery in three steps
        </h2>
        <p className="mb-10 sm:mb-14" style={{ fontSize: 14, color: MUTED }}>
          No steep learning curve. No complex setup. Just open a project and go.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px" style={{ background: BORDER }}>
          {HOW_IT_WORKS.map((step, i) => (
            <div
              key={step.step}
              style={{ background: BG, borderTop: `2px solid ${step.color}`, padding: "32px 28px", position: "relative" }}
            >
              {/* Step number watermark */}
              <div
                style={{
                  position: "absolute", top: 20, right: 24,
                  fontSize: 56, fontWeight: 900, color: step.color,
                  opacity: 0.06, fontFamily: "monospace", lineHeight: 1,
                  userSelect: "none",
                }}
              >
                {step.step}
              </div>

              <div className="flex items-center gap-3 mb-5">
                <div
                  style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: `${step.color}18`,
                    border: `1px solid ${step.color}44`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, color: step.color, fontWeight: 700,
                    fontFamily: "monospace", flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <span style={{ fontSize: 18, color: step.color }}>{step.icon}</span>
              </div>

              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 10 }}>{step.title}</div>
              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.8 }}>{step.desc}</div>

              {/* Connector arrow — desktop only */}
              {i < 2 && (
                <div
                  className="hidden md:block absolute"
                  style={{
                    right: -13, top: "50%", transform: "translateY(-50%)",
                    fontSize: 18, color: DIM, zIndex: 1,
                  }}
                >
                  →
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── StatsSection ─────────────────────────────────────────────────────────────

function StatsSection() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="px-5 sm:px-10 py-16 sm:py-24" style={{ background: BG }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ fontSize: 10, letterSpacing: "4px", color: DIM, marginBottom: 10 }}>THE DIFFERENCE</div>
        <h2 className="font-bold text-white text-2xl sm:text-3xl mb-10 sm:mb-14">
          Real results for cabinet shops
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ background: BORDER }}>
          {STATS.map((s, i) => (
            <div
              key={s.label}
              style={{ background: BG, padding: "32px 20px", textAlign: "center" }}
            >
              <div
                style={{
                  fontSize: "clamp(24px, 4vw, 36px)",
                  fontWeight: 700,
                  color: s.color,
                  marginBottom: 10,
                  fontFamily: "monospace",
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(20px)",
                  transition: `opacity 0.7s ease ${i * 120}ms, transform 0.7s ease ${i * 120}ms`,
                }}
              >
                {s.display}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: DIM,
                  lineHeight: 1.5,
                  opacity: visible ? 1 : 0,
                  transition: `opacity 0.7s ease ${i * 120 + 200}ms`,
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTASection ───────────────────────────────────────────────────────────────

function CTASection({ onCTA }: { onCTA: () => void }) {
  return (
    <section className="px-5 sm:px-10 py-20 sm:py-32" style={{ background: BG2 }}>
      <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div className="flex items-center justify-center gap-2 mb-4">
          <PulseRing color={GOLD} size={8} />
          <span style={{ fontSize: 10, letterSpacing: "4px", color: GOLD }}>14-DAY FREE TRIAL</span>
        </div>
        <h2
          className="font-bold text-white mb-4"
          style={{ fontSize: "clamp(28px, 5vw, 48px)", lineHeight: 1.1 }}
        >
          Ready to run a smarter shop?
        </h2>
        <p className="mb-8 sm:mb-10" style={{ fontSize: 14, color: MUTED, lineHeight: 1.75 }}>
          Stop measuring twice and cutting wrong. Start your 14-day free trial — no credit card, no installs, cancel anytime.
        </p>

        <div className="flex items-center justify-center gap-3 flex-wrap mb-4">
          <button
            onClick={onCTA}
            className="font-bold transition-all active:scale-95"
            style={{ fontSize: 12, letterSpacing: "2px", padding: "16px 32px", background: GOLD, color: BG }}
          >
            SEE PLANS →
          </button>
          <Link
            href="/register"
            className="font-bold transition-all"
            style={{ fontSize: 12, letterSpacing: "2px", padding: "16px 32px", border: `1px solid ${GOLD}44`, color: GOLD }}
          >
            START FREE
          </Link>
        </div>
        <p style={{ fontSize: 11, color: DIM }}>
          No credit card required · Cancel anytime · 14 days free
        </p>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer({ onCTA }: { onCTA: () => void }) {
  return (
    <footer
      className="px-5 sm:px-10 pt-12 pb-8"
      style={{ background: BG, borderTop: `1px solid ${BORDER}` }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Grid — stacks on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mb-10">
          {/* Brand */}
          <div className="sm:col-span-2 md:col-span-1">
            <div
              style={{ fontSize: 13, fontWeight: 700, letterSpacing: "3px", color: GOLD, fontFamily: "monospace", marginBottom: 10 }}
            >
              WOODCRAFT OS
            </div>
            <p style={{ fontSize: 12, color: MUTED, maxWidth: 260, lineHeight: 1.8, marginBottom: 16 }}>
              AI-powered cabinet design, validation, and CNC production — all in one platform.
            </p>
            <div className="flex gap-1.5">
              {[GOLD, TEAL, PURPLE, RED, GREEN, ORANGE].map((c) => (
                <div key={c} style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />
              ))}
            </div>
          </div>

          {/* Product */}
          <div>
            <div style={{ fontSize: 9, letterSpacing: "3px", color: DIM, marginBottom: 12 }}>PRODUCT</div>
            {[
              { label: "Features",    action: () => {} },
              { label: "How It Works", action: () => {} },
              { label: "Pricing",      action: onCTA },
            ].map((l) => (
              <button
                key={l.label}
                onClick={l.action}
                className="block w-full text-left transition-colors mb-2"
                style={{ fontSize: 12, color: MUTED }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#fff")}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = MUTED)}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* What you can do */}
          <div>
            <div style={{ fontSize: 9, letterSpacing: "3px", color: DIM, marginBottom: 12 }}>IN THE APP</div>
            {["3D Cabinet Designer", "AI Error Checker", "Cut List Generator", "CNC Export", "Client Quotes", "Installer App"].map((l) => (
              <div key={l} style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>{l}</div>
            ))}
          </div>

          {/* Account */}
          <div>
            <div style={{ fontSize: 9, letterSpacing: "3px", color: DIM, marginBottom: 12 }}>ACCOUNT</div>
            {[
              { label: "Sign In",    href: "/login" },
              { label: "Register",   href: "/register" },
              { label: "Dashboard",  href: "/dashboard" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="block transition-colors mb-2"
                style={{ fontSize: 12, color: MUTED, textDecoration: "none" }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#fff")}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = MUTED)}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div
          className="flex flex-col sm:flex-row items-center sm:justify-between gap-2"
          style={{ paddingTop: 24, borderTop: `1px solid ${BORDER}` }}
        >
          <p style={{ fontSize: 10, color: "#2E3038", letterSpacing: "1px" }}>
            © 2026 ROSYS.IM. ALL RIGHTS RESERVED.
          </p>
          <p style={{ fontSize: 10, color: DIM }}>
            rosys.im · (828) 827-3145
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [showPricing, setShowPricing] = useState(false);
  const [showBanner, setShowBanner] = useState(true);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  if (user) return null;

  return (
    <div style={{ background: BG, color: TEXT, fontFamily: "system-ui, sans-serif" }}>
      {showBanner && <DevBanner onDismiss={() => setShowBanner(false)} />}
      <Nav onCTA={() => setShowPricing(true)} topOffset={showBanner ? BANNER_H : 0} />
      <ScrollVideoHero onCTA={() => setShowPricing(true)} />
      <FeaturesSection />
      <HowItWorksSection />
      <StatsSection />
      <CTASection onCTA={() => setShowPricing(true)} />
      <Footer onCTA={() => setShowPricing(true)} />
      {showPricing && <PricingModal onClose={() => setShowPricing(false)} />}
    </div>
  );
}
