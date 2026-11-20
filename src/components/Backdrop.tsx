export default function Backdrop({ dim = false }: { dim?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,#0b1424_0%,#04070e_60%)]" />
      <div
        className={`absolute -top-32 left-[8%] h-[420px] w-[520px] rounded-full blur-[120px] animate-drift-slow ${dim ? 'bg-wealth-500/5' : 'bg-wealth-500/10'}`}
      />
      <div
        className={`absolute bottom-[-160px] right-[4%] h-[460px] w-[560px] rounded-full blur-[130px] animate-drift-slower ${dim ? 'bg-tide-500/5' : 'bg-tide-500/10'}`}
      />
      <svg
        className="absolute inset-x-0 bottom-0 h-[46vh] w-full opacity-40"
        viewBox="0 0 1200 400"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="bd-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
            <stop offset="45%" stopColor="#34d399" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        <path
          d="M0,360 C120,340 200,300 300,310 C420,322 480,250 600,240 C720,230 780,270 900,220 C1020,170 1100,120 1200,90"
          fill="none"
          stroke="url(#bd-line)"
          strokeWidth="1.5"
          strokeDasharray="6 14"
          className="animate-flow"
        />
        <path
          d="M0,390 C150,380 260,350 380,355 C500,360 580,300 700,290 C820,280 900,310 1020,260 C1100,228 1150,200 1200,180"
          fill="none"
          stroke="#1b3050"
          strokeWidth="1"
          strokeDasharray="2 10"
          className="animate-flow"
          style={{ animationDuration: '22s' }}
        />
      </svg>
    </div>
  );
}
