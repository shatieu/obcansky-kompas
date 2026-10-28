"use client";

import { useId } from "react";

/* Statické SVG náhledy rámečků a obrázků ke sdílení (reference design systému).
   Exportované soubory vznikají jinde (lib/photo canvas, app/api/og). */

const S = 1080;
const R = 540;
const NAVY = "#0B1B33";
const FB = "#11457E";
const FR = "#D7141A";

/** Celá vlajka 3:2 v jednotkách SVG s obrysem a ochrannou zónou (¼ výšky). */
export function FlagAt({ x, y, w, plate = true, edge = NAVY }: { x: number; y: number; w: number; plate?: boolean; edge?: string }) {
  const h = (w * 2) / 3;
  const pad = h / 4;
  const sw = Math.max(2, w / 120);
  return (
    <g>
      {plate && <rect x={x - pad} y={y - pad} width={w + pad * 2} height={h + pad * 2} fill="#FFFFFF" />}
      <rect x={x} y={y} width={w} height={h / 2} fill="#FFFFFF" />
      <rect x={x} y={y + h / 2} width={w} height={h / 2} fill={FR} />
      <path d={`M${x} ${y}L${x + w / 2} ${y + h / 2} ${x} ${y + h}z`} fill={FB} />
      <rect x={x - sw / 2} y={y - sw / 2} width={w + sw} height={h + sw} fill="none" stroke={edge} strokeWidth={sw} />
    </g>
  );
}

function PhotoBase({ photo, uid, placeholder }: { photo?: string; uid: string; placeholder: string }) {
  return (
    <g clipPath={`url(#c${uid})`}>
      <rect width={S} height={S} fill="#E8EEF6" />
      {photo ? (
        <image href={photo} width={S} height={S} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <text x={R} y={R + 20} textAnchor="middle" fontSize="60" fontWeight="700" fill="#454E5D">
          {placeholder}
        </text>
      )}
    </g>
  );
}

export type PhotoFrameVariant = "ring" | "ribbon" | "corner" | "duotone";

/** Kruhový náhled profilové fotky s rámečkem (rounded-round je tu povolené). */
export function PhotoFrame({
  variant = "ring",
  slogan = "Ruce pryč od médií",
  photo,
  size = 280,
  label,
  placeholder = "Tvoje fotka",
}: {
  variant?: PhotoFrameVariant;
  slogan?: string;
  photo?: string;
  size?: number;
  /** "" = dekorativní. */
  label?: string;
  placeholder?: string;
}) {
  const uid = useId().replace(/[:«»]/g, "");
  const up = slogan.toUpperCase();
  let art;
  if (variant === "ring") {
    art = (
      <>
        <PhotoBase photo={photo} uid={uid} placeholder={placeholder} />
        <path d={`M${R - 470} ${R}A470 470 0 0 1 ${R + 470} ${R}`} fill="none" stroke={FB} strokeWidth="140" />
        <path d={`M${R - 470} ${R}A470 470 0 0 0 ${R + 470} ${R}`} fill="none" stroke={FR} strokeWidth="140" />
        <circle cx={R} cy={R} r="394" fill="none" stroke="#FFFFFF" strokeWidth="14" />
        <path d={`M${R - 470} ${R}h140M${R + 330} ${R}h140`} stroke="#FFFFFF" strokeWidth="14" />
        <path id={`a${uid}`} d={`M${R - 462} ${R}A462 462 0 0 1 ${R + 462} ${R}`} fill="none" />
        <text fontSize={up.length > 24 ? 44 : 60} fontWeight="800" fill="#FFFFFF" letterSpacing="2">
          <textPath href={`#a${uid}`} startOffset="50%" textAnchor="middle" dominantBaseline="central">
            {up}
          </textPath>
        </text>
      </>
    );
  } else if (variant === "ribbon") {
    art = (
      <>
        <PhotoBase photo={photo} uid={uid} placeholder={placeholder} />
        <g clipPath={`url(#c${uid})`}>
          <rect y="700" width={S} height="170" fill={FB} />
          <rect y="870" width={S} height="28" fill={FR} />
          <text x={R} y="805" textAnchor="middle" fontSize={up.length > 24 ? 40 : 62} fontWeight="800" fill="#FFFFFF">
            {up}
          </text>
        </g>
      </>
    );
  } else if (variant === "corner") {
    art = (
      <>
        <PhotoBase photo={photo} uid={uid} placeholder={placeholder} />
        <FlagAt x={600} y={700} w={240} plate={false} />
      </>
    );
  } else {
    const words = slogan.split(" ");
    const lines: string[] = [];
    let cur = "";
    words.forEach((w) => {
      if ((cur + " " + w).trim().length > 10 && cur) {
        lines.push(cur);
        cur = w;
      } else cur = (cur + " " + w).trim();
    });
    lines.push(cur);
    const y0 = 540 - ((lines.length - 1) * 112) / 2 + 30;
    art = (
      <g clipPath={`url(#c${uid})`}>
        <rect width={S} height={S} fill={FB} />
        {photo && <image href={photo} width={S} height={S} preserveAspectRatio="xMidYMid slice" filter={`url(#d${uid})`} />}
        {lines.map((l, i) => (
          <text key={i} x={R} y={y0 + i * 112} textAnchor="middle" fontSize="104" fontWeight="800" fill="#FFFFFF" letterSpacing="-3">
            {l.toUpperCase()}
          </text>
        ))}
        <rect x="390" y={y0 + (lines.length - 1) * 112 + 50} width="300" height="24" fill={FR} />
      </g>
    );
  }
  return (
    <svg
      className="k-photo"
      width={size}
      height={size}
      viewBox={`0 0 ${S} ${S}`}
      role={label === "" ? undefined : "img"}
      aria-hidden={label === "" ? true : undefined}
      aria-label={label === "" ? undefined : label || `Profilová fotka s rámečkem: ${slogan}`}
    >
      <defs>
        <clipPath id={`c${uid}`}>
          <circle cx={R} cy={R} r={R} />
        </clipPath>
        <filter id={`d${uid}`}>
          <feColorMatrix type="matrix" values="0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 1 0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.067 1" />
            <feFuncG type="table" tableValues="0.271 1" />
            <feFuncB type="table" tableValues="0.494 1" />
          </feComponentTransfer>
        </filter>
      </defs>
      {art}
    </svg>
  );
}
