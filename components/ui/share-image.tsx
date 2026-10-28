import { FlagAt } from "./photo-frame";

/* Náhled obrázků ke sdílení (reference design systému). Skutečné PNG generuje app/api/og. */

const NAVY = "#0B1B33";
const FB = "#11457E";
const SHARE = { og: [1200, 630], story: [1080, 1920], square: [1080, 1080] } as const;
const F = "var(--font-wide)";

function Choice({ c, i, fs }: { c: string; i: number; fs: number }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: fs * 0.6,
        background: "#FFFFFF",
        color: NAVY,
        padding: `${fs * 0.5}px ${fs * 0.7}px`,
        font: `700 ${fs}px/1.2 var(--font-sans)`,
      }}
    >
      <span
        style={{
          flex: "none",
          width: fs * 1.5,
          height: fs * 1.5,
          display: "grid",
          placeItems: "center",
          background: FB,
          color: "#FFFFFF",
          font: `800 ${fs * 0.8}px ${F}`,
        }}
      >
        {i + 1}
      </span>
      {c}
    </li>
  );
}

export function ShareImage({
  format = "og",
  headline = "Vím, jak chci financovat veřejnoprávní média",
  choices = [],
  scale = 0.4,
  brand = "Občanský kompas",
}: {
  format?: keyof typeof SHARE;
  headline?: string;
  choices: string[];
  scale?: number;
  brand?: string;
}) {
  const [W, H] = SHARE[format];
  const ch = choices.slice(0, 3);
  let body;
  if (format === "og") {
    body = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <rect width={W} height={H} fill={NAVY} />
        <FlagAt x={64} y={64} w={180} plate={false} edge="#FFFFFF" />
        <text x={W - 64} y={110} textAnchor="end" fontSize="24" fontWeight="800" fill="#FFFFFF" fontFamily={F}>
          {brand}
        </text>
        <foreignObject x="64" y="220" width={W - 128} height="200">
          <div style={{ font: `800 58px/62px ${F}`, color: "#FFFFFF", letterSpacing: "-1.5px" }}>{headline}</div>
        </foreignObject>
        <foreignObject x="64" y="448" width={W - 128} height="140">
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
            {ch.map((c, i) => (
              <Choice key={i} c={c} i={i} fs={22} />
            ))}
          </ol>
        </foreignObject>
      </svg>
    );
  } else if (format === "story") {
    body = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <rect width={W} height={H} fill={NAVY} />
        <FlagAt x={88} y={160} w={330} plate={false} edge="#FFFFFF" />
        <foreignObject x="88" y="560" width={W - 176} height="1200">
          <div>
            <div style={{ font: `800 92px/96px ${F}`, color: "#FFFFFF", letterSpacing: "-3px" }}>{headline}</div>
            <ol style={{ margin: "80px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 20 }}>
              {ch.map((c, i) => (
                <Choice key={i} c={c} i={i} fs={42} />
              ))}
            </ol>
          </div>
        </foreignObject>
        <text x="88" y={H - 110} fontSize="40" fontWeight="800" fill="#FFFFFF" fontFamily={F}>
          {brand}
        </text>
      </svg>
    );
  } else {
    body = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <rect width={W} height={H} fill={NAVY} />
        <FlagAt x={80} y={80} w={180} plate={false} edge="#FFFFFF" />
        <text x={W - 80} y={130} textAnchor="end" fontSize="30" fontWeight="800" fill="#FFFFFF" fontFamily={F}>
          {brand}
        </text>
        <foreignObject x="80" y="290" width={W - 160} height="720">
          <div>
            <div style={{ font: `800 68px/72px ${F}`, color: "#FFFFFF", letterSpacing: "-2px" }}>{headline}</div>
            <ol style={{ margin: "56px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 16 }}>
              {ch.map((c, i) => (
                <Choice key={i} c={c} i={i} fs={34} />
              ))}
            </ol>
          </div>
        </foreignObject>
      </svg>
    );
  }
  return (
    <div className="k-scaled" style={{ width: W * scale, height: H * scale }} role="img" aria-label={`Obrázek ke sdílení ${W}×${H}: ${headline}`}>
      <div className="k-share" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        {body}
      </div>
    </div>
  );
}
