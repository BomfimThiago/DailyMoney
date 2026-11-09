// Generates a static HTML mock of the Daily Money redesign for html_to_figma.
import { writeFileSync } from "node:fs";

const SH = "0 0 0 1px rgba(16,24,40,.035), 0 1px 2px rgba(16,24,40,.05), 0 10px 28px -6px rgba(16,24,40,.10)";
const SH_SM = "0 0 0 1px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.07)";
const SERIF = "'Instrument Serif',serif";
const C = {
  bg: "#FFFFFF", surface: "#FFFFFF", tint: "#F7F8FA", sunken: "#F1F3F6", border: "#EEF0F3", borderStrong: "#E1E4EA",
  ink: "#0F1115", ink2: "#596070", ink3: "#9198A5",
  brand: "#14614C", brandSoft: "#E2EEE8", brandInk: "#0E4A3A",
  inc: "#1E7A50", incSoft: "#E3F1E9",
  warn: "#A86412", warnSoft: "#FBEFD9",
  xfer: "#4655A0", xferSoft: "#E8EAF5",
  danger: "#B4371C", dangerSoft: "#FBE6E0",
};

const P = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  home: '<path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 2h2l2.7 12.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 1.9-1.6L22 7H5.1"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
  car: '<path d="M5 17h14v-5l-2-5H7l-2 5z"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  plane: '<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  bolt: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  brief: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  swap: '<path d="M8 3L4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/>',
  game: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4M8 10v4M15 13h.01M18 11h.01"/>',
  bag: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  bank: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4z"/>',
  dots: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>', chevR: '<path d="M9 18l6-6-6-6"/>', chevD: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>',
  spark: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
};
const ic = (n, color = C.ink2, s = 16, w = 1.8) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" style="flex:none">${P[n]}</svg>`;

const CAT = {
  Moradia: { c: "#8b5cf6", i: "home" }, Mercado: { c: "#16a34a", i: "cart" }, Viagem: { c: "#0891b2", i: "plane" },
  Restaurantes: { c: "#ea580c", i: "food" }, Transporte: { c: "#0284c7", i: "car" }, "Contas & Serviços": { c: "#ca8a04", i: "bolt" },
  Assinaturas: { c: "#0d9488", i: "repeat" }, Saúde: { c: "#dc2626", i: "heart" }, Salário: { c: "#16a34a", i: "brief" },
  Compras: { c: "#db2777", i: "bag" }, Lazer: { c: "#e11d48", i: "game" }, "Impostos & Taxas": { c: "#64748b", i: "bank" },
  "Outros gastos": { c: "#94a3b8", i: "dots" }, Transferência: { c: C.xfer, i: "swap" },
};
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const catIcon = (name, s = 32) => {
  const k = CAT[name];
  return `<div style="width:${s}px;height:${s}px;border-radius:${s / 3.2}px;background:${hexA(k.c, 0.12)};display:flex;align-items:center;justify-content:center;flex:none">${ic(k.i, k.c, s / 2)}</div>`;
};
const catPill = (name, opts = {}) => {
  const k = CAT[name];
  const dashed = opts.suggested ? `border:1px dashed ${hexA(k.c, 0.6)};` : `border:1px solid transparent;`;
  return `<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 9px 3px 7px;border-radius:999px;background:${hexA(k.c, 0.1)};${dashed}font-size:12px;font-weight:500;color:${C.ink};white-space:nowrap"><span style="width:7px;height:7px;border-radius:99px;background:${k.c}"></span>${name}${opts.caret ? ic("chevD", C.ink3, 12) : ""}</span>`;
};
const MEM = { Thiago: "#2563eb", Ana: "#c2410c", Casa: "#7c3aed" };
const avatar = (name, s = 22) =>
  `<span title="${name}" style="width:${s}px;height:${s}px;border-radius:99px;background:${hexA(MEM[name], 0.14)};color:${MEM[name]};font-size:${s * 0.45}px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;flex:none">${name[0]}</span>`;
const memberChip = (name) =>
  `<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:${C.ink2}">${avatar(name, 20)}${name}</span>`;
const cur = (code) =>
  `<span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:600;letter-spacing:.02em;color:${C.ink2};background:${C.sunken};border-radius:4px;padding:2px 5px">${code}</span>`;
const badge = (text, fg, bg, icon) =>
  `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:${bg};color:${fg};font-size:11.5px;font-weight:600;white-space:nowrap">${icon ? ic(icon, fg, 12, 2.2) : ""}${text}</span>`;
const btn = (label, kind = "primary", icon) => {
  const s = {
    primary: `background:${C.brand};color:#fff;border:1px solid ${C.brand};`,
    secondary: `background:${C.surface};color:${C.ink};border:1px solid transparent;box-shadow:${SH_SM};`,
    ghost: `background:transparent;color:${C.ink2};border:1px solid transparent;`,
  }[kind];
  const icColor = kind === "primary" ? "#fff" : C.ink2;
  return `<span style="display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px;border-radius:9px;font-size:13.5px;font-weight:600;white-space:nowrap;${s}">${icon ? ic(icon, icColor, 15, 2) : ""}${label}</span>`;
};
const card = (inner, extra = "") =>
  `<div style="background:${C.surface};border-radius:18px;box-shadow:${SH};${extra}">${inner}</div>`;
const cardHead = (title, right = "", sub = "") =>
  `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:22px 24px 0"><div><div style="font-family:${SERIF};font-size:24px;font-weight:400;letter-spacing:-.005em;line-height:1.1;color:${C.ink}">${title}</div>${sub ? `<div style="font-size:12.5px;color:${C.ink3};margin-top:3px">${sub}</div>` : ""}</div>${right}</div>`;
const link = (t) => `<span style="font-size:13px;font-weight:600;color:${C.brand};display:inline-flex;align-items:center;gap:3px;white-space:nowrap">${t}${ic("chevR", C.brand, 13, 2.2)}</span>`;

// ---------- shell ----------
const NAV = [
  ["dash", "Resumo"], ["list", "Transações"], ["upload", "Importar", "2"], ["tag", "Categorias e regras"], ["users", "Responsáveis"], ["sliders", "Configurações"],
];
const sidebar = (active) => `
<aside style="width:236px;flex:none;border-right:1px solid ${C.border};background:${C.surface};display:flex;flex-direction:column;padding:22px 14px">
  <div style="display:flex;align-items:center;gap:10px;padding:2px 8px 22px">
    <div style="width:30px;height:30px;border-radius:9px;background:${C.brand};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px">D</div>
    <div style="font-family:${SERIF};font-size:23px;font-weight:400;letter-spacing:-.01em;color:${C.ink}">Daily Money</div>
  </div>
  <div style="display:flex;flex-direction:column;gap:2px">
  ${NAV.map(([i, l, b]) => {
    const on = l === active;
    return `<div style="display:flex;align-items:center;gap:11px;height:36px;padding:0 10px;border-radius:9px;${on ? `background:${C.sunken};` : ""}font-size:13.5px;font-weight:${on ? 600 : 500};color:${on ? C.ink : C.ink2}">${ic(i, on ? C.brand : C.ink3, 17)}<span style="flex:1">${l}</span>${b ? `<span style="min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:${C.warn};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${b}</span>` : ""}</div>`;
  }).join("")}
  </div>
  <div style="margin-top:26px;padding:0 10px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${C.ink3}">Contas</div>
  <div style="display:flex;flex-direction:column;gap:2px;margin-top:8px">
    ${[["Revolut", "EUR"], ["Wise", "EUR"], ["Wise", "USD"], ["Wise", "BRL"]].map(([b, c]) => `<div style="display:flex;align-items:center;gap:10px;height:32px;padding:0 10px;font-size:13px;color:${C.ink2}">${ic("bank", C.ink3, 15)}<span style="flex:1">${b}</span>${cur(c)}</div>`).join("")}
  </div>
  <div style="flex:1"></div>
  <div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;background:${C.surface};box-shadow:${SH_SM}">
    ${avatar("Thiago", 30)}
    <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:${C.ink}">Thiago</div><div style="font-size:11.5px;color:${C.ink3}">3 responsáveis</div></div>
    ${ic("chevD", C.ink3, 14)}
  </div>
</aside>`;

const lens = (on = "EUR") => `
<div style="display:flex;align-items:center;gap:2px;padding:3px;border-radius:10px;background:${C.sunken}">
  ${["EUR", "USD", "BRL"].map((c) => `<span style="height:28px;padding:0 11px;border-radius:7px;display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;${c === on ? `background:${C.surface};color:${C.ink};box-shadow:0 1px 2px rgba(22,24,27,.08)` : `color:${C.ink3}`}">${{ EUR: "€", USD: "US$", BRL: "R$" }[c]} ${c}</span>`).join("")}
</div>`;
const period = (label) => `
<div style="display:flex;align-items:center;gap:4px;height:36px;padding:0 6px;border-radius:9px;background:${C.surface};box-shadow:${SH_SM}">
  ${ic("chevL", C.ink2, 16)}<span style="font-size:13.5px;font-weight:600;color:${C.ink};padding:0 6px">${label}</span>${ic("chevR", C.ink2, 16)}
</div>`;
const topbar = (title, sub, right, eyebrow = "Agosto · 2026") => `
<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:36px 40px 26px">
  <div><div style="font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${C.ink3};margin-bottom:6px">${eyebrow}</div><div style="font-family:${SERIF};font-size:48px;font-weight:400;line-height:1;letter-spacing:-.015em;color:${C.ink}">${title}</div><div style="font-size:13.5px;color:${C.ink2};margin-top:5px">${sub}</div></div>
  <div style="display:flex;align-items:center;gap:10px">${right}</div>
</div>`;
const screen = (name, active, body, h = 1100) =>
  `<section class="screen" data-name="${name}" style="width:1440px;min-height:${h}px;display:flex;background:${C.bg};font-family:Inter,sans-serif;color:${C.ink};font-feature-settings:'tnum' 1">${sidebar(active)}<main style="flex:1;min-width:0;display:flex;flex-direction:column">${body}</main></section>`;

const num = (t, size = 14, color = C.ink, weight = 600) => `<span style="font-size:${size}px;font-weight:${weight};color:${color};font-variant-numeric:tabular-nums;white-space:nowrap">${t}</span>`;

// ---------- 1. Resumo ----------
const kpi = (label, value, color, delta, deltaGood, alt) => card(`
  <div style="padding:22px 24px 22px">
    <div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${C.ink3}">${label}</span>${delta ? badge(delta, deltaGood ? C.inc : C.danger, deltaGood ? C.incSoft : C.dangerSoft) : ""}</div>
    <div style="margin-top:12px;font-family:${SERIF};font-size:46px;font-weight:400;line-height:1;letter-spacing:-.02em;color:${color}">${value}</div>
    <div style="margin-top:12px;font-size:12px;color:${C.ink3};font-variant-numeric:tabular-nums">${alt}</div>
  </div>`, "flex:1");

const MONTHS = [["Set", 5.9, 4.6], ["Out", 6.1, 4.9], ["Nov", 5.9, 5.2], ["Dez", 7.8, 6.4], ["Jan", 6.0, 4.4], ["Fev", 6.0, 4.1], ["Mar", 6.2, 4.7], ["Abr", 6.2, 4.3], ["Mai", 6.3, 5.0], ["Jun", 6.3, 4.6], ["Jul", 6.4, 5.3], ["Ago", 6.42, 4.18]];
const chart = () => {
  const H = 220, max = 8;
  const grid = [8, 6, 4, 2, 0].map((v) => `<div style="display:flex;align-items:center;gap:10px;height:0;position:relative"><span style="width:28px;text-align:right;font-size:11px;color:${C.ink3};transform:translateY(-1px)">${v ? `€${v}k` : "0"}</span><div style="flex:1;border-top:1px ${v ? "dashed" : "solid"} ${v ? C.border : C.borderStrong}"></div></div>`);
  return `
  <div style="position:relative;height:${H + 30}px;margin:22px 20px 18px">
    <div style="position:absolute;inset:0 0 30px 0;display:flex;flex-direction:column;justify-content:space-between">${grid.join("")}</div>
    <div style="position:absolute;left:38px;right:0;top:0;height:${H}px;display:flex;align-items:flex-end;justify-content:space-around">
      ${MONTHS.map(([m, i, e], idx) => {
        const last = idx === MONTHS.length - 1;
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:0;width:44px">
          <div style="display:flex;align-items:flex-end;gap:3px;height:${H}px">
            <div style="width:13px;height:${(i / max) * H}px;border-radius:4px 4px 0 0;background:${last ? C.inc : hexA(C.inc, 0.35)}"></div>
            <div style="width:13px;height:${(e / max) * H}px;border-radius:4px 4px 0 0;background:${last ? C.ink : hexA(C.ink, 0.22)}"></div>
          </div>
        </div>`;
      }).join("")}
    </div>
    <div style="position:absolute;left:38px;right:0;bottom:0;height:22px;display:flex;justify-content:space-around">
      ${MONTHS.map(([m], idx) => `<span style="width:44px;text-align:center;font-size:11.5px;font-weight:${idx === 11 ? 700 : 500};color:${idx === 11 ? C.ink : C.ink3}">${m}</span>`).join("")}
    </div>
  </div>`;
};
const legend = `<div style="display:flex;gap:14px;font-size:12px;color:${C.ink2}"><span style="display:flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:3px;background:${C.inc}"></span>Entradas</span><span style="display:flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:3px;background:${C.ink}"></span>Gastos</span></div>`;

const CATS = [["Moradia", "1.450,00", 34.7], ["Mercado", "612,38", 14.6], ["Viagem", "540,00", 12.9], ["Restaurantes", "438,90", 10.5], ["Transporte", "296,40", 7.1], ["Contas & Serviços", "284,10", 6.8], ["Assinaturas", "182,74", 4.4], ["Outros gastos", "379,00", 9.1]];
const catRows = CATS.map(([n, v, p]) => `
  <div style="display:flex;flex-direction:column;gap:7px">
    <div style="display:flex;align-items:center;gap:10px">${catIcon(n, 26)}<span style="flex:1;font-size:13.5px;font-weight:500">${n}</span>${num("€" + v, 13.5)}<span style="width:44px;text-align:right;font-size:12px;color:${C.ink3}">${p.toFixed(1).replace(".", ",")}%</span></div>
    <div style="height:5px;border-radius:99px;background:${C.sunken};margin-left:36px"><div style="width:${(p / 34.7) * 100}%;height:5px;border-radius:99px;background:${CAT[n].c}"></div></div>
  </div>`).join("");

const MEMBERS = [["Thiago", "2.310,20", 55.2], ["Ana", "1.512,82", 36.2], ["Casa", "360,50", 8.6]];
const memberBlock = `
  <div style="display:flex;height:10px;border-radius:99px;overflow:hidden;gap:2px;margin:18px 20px 16px">${MEMBERS.map(([n, , p]) => `<div style="width:${p}%;background:${MEM[n]}"></div>`).join("")}</div>
  <div style="display:flex;flex-direction:column;gap:12px;padding:0 20px 20px">
  ${MEMBERS.map(([n, v, p]) => `<div style="display:flex;align-items:center;gap:10px">${avatar(n, 26)}<span style="flex:1;font-size:13.5px;font-weight:500">${n}${n === "Casa" ? `<span style="color:${C.ink3};font-weight:400"> · compartilhado</span>` : ""}</span>${num("€" + v, 13.5)}<span style="width:44px;text-align:right;font-size:12px;color:${C.ink3}">${p.toFixed(1).replace(".", ",")}%</span></div>`).join("")}
  </div>`;

const ACCTS = [["Revolut", "EUR", "−€2.940,12", "", 41], ["Wise", "BRL", "−R$ 3.210,00", "≈ €500,00", 9], ["Wise", "EUR", "−€391,00", "", 6], ["Wise", "USD", "−US$ 412,30", "≈ €352,40", 7]];
const accountRows = ACCTS.map(([b, c, v, conv, n]) => `
  <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid ${C.border}">
    <div style="width:30px;height:30px;border-radius:9px;background:${C.sunken};display:flex;align-items:center;justify-content:center">${ic("bank", C.ink2, 15)}</div>
    <div style="flex:1"><div style="display:flex;align-items:center;gap:6px;font-size:13.5px;font-weight:500">${b} ${cur(c)}</div><div style="font-size:12px;color:${C.ink3};margin-top:2px">${n} transações</div></div>
    <div style="text-align:right">${num(v, 13.5)}${conv ? `<div style="font-size:11.5px;color:${C.ink3};margin-top:2px">${conv}</div>` : ""}</div>
  </div>`).join("");

const TX = [
  { d: "20 ago", t: "Mercadona", raw: "MERCADONA VALENCIA", cat: "Mercado", m: "Ana", acc: "Revolut", cur: "EUR", v: "−€86,42" },
  { d: "19 ago", t: "Salário", raw: "NOMINA ACME SL", cat: "Salário", m: "Thiago", acc: "Revolut", cur: "EUR", v: "+€4.200,00", inc: true },
  { d: "19 ago", t: "Netflix", raw: "NETFLIX.COM", cat: "Assinaturas", m: "Thiago", acc: "Wise", cur: "USD", v: "−€13,24", orig: "−US$ 15,49" },
  { d: "18 ago", t: "Wise → Revolut", raw: "TRANSFERENCIA DE WISE", cat: "Transferência", m: "Thiago", acc: "Revolut", cur: "EUR", v: "€500,00", xfer: true },
  { d: "18 ago", t: "Uber", raw: "UBER *TRIP", cat: "Transporte", m: "Thiago", acc: "Revolut", cur: "EUR", v: "−€14,80" },
  { d: "17 ago", t: "Drogaria São Paulo", raw: "DROGARIA SAO PAULO 0412", cat: "Saúde", m: "Ana", acc: "Wise", cur: "BRL", v: "−€21,81", orig: "−R$ 140,00" },
  { d: "14 ago", t: "Pão de Açúcar", raw: "", cat: "Mercado", m: "Ana", acc: "Wise", cur: "BRL", v: "−€64,32", orig: "−R$ 412,90" },
  { d: "13 ago", t: "Aluguel", raw: "", cat: "Moradia", m: "Casa", acc: "Revolut", cur: "EUR", v: "−€1.450,00" },
  { d: "12 ago", t: "Café Bóveda", raw: "", cat: "Restaurantes", m: "Thiago", acc: "Revolut", cur: "EUR", v: "−€7,20" },
];
const txRowCompact = (x) => `
  <div style="display:flex;align-items:center;gap:12px;padding:10px 20px;border-top:1px solid ${C.border}">
    ${catIcon(x.cat, 32)}
    <div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600">${x.t}</div><div style="font-size:12px;color:${C.ink3};margin-top:2px">${x.d} · ${x.cat} · ${x.acc} ${x.cur}</div></div>
    ${avatar(x.m, 22)}
    <div style="width:120px;text-align:right">${x.xfer ? `<div>${num(x.v, 13.5, C.ink3, 500)}</div><div style="margin-top:3px">${badge("interna", C.xfer, C.xferSoft)}</div>` : `<div>${num(x.v, 13.5, x.inc ? C.inc : C.ink)}</div>${x.orig ? `<div style="font-size:11.5px;color:${C.ink3};margin-top:2px">${x.orig}</div>` : ""}`}</div>
  </div>`;

const dashBody = `
${topbar("Resumo", "Agosto de 2026 · valores em euro, convertidos pela taxa do dia de cada compra", `${period("Agosto 2026")}${lens("EUR")}${btn("Importar extrato", "primary", "upload")}`)}
<div style="padding:4px 40px 48px;display:flex;flex-direction:column;gap:22px">
  <div style="display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:14px;background:${C.warnSoft}">
    <div style="width:30px;height:30px;border-radius:99px;background:${hexA(C.warn, 0.15)};display:flex;align-items:center;justify-content:center">${ic("spark", C.warn, 16, 2)}</div>
    <div style="flex:1;font-size:13.5px;color:${C.ink}"><b>2 importações aguardando revisão.</b> <span style="color:${C.ink2}">9 transações com baixa confiança ainda não entraram nos números deste mês.</span></div>
    ${btn("Revisar agora", "secondary")}
  </div>
  <div style="display:flex;gap:16px">
    ${kpi("Entradas", "€6.420,00", C.inc, "+0,3%", true, "R$ 41.216,40 · US$ 7.511,40")}
    ${kpi("Gastos", "€4.183,52", C.ink, "−21% vs jul", true, "R$ 26.858,20 · US$ 4.894,72")}
    ${kpi("Sobrou no mês", "+€2.236,48", C.ink, "", true, "R$ 14.358,20 · US$ 2.616,68")}
    ${kpi("Taxa de poupança", "34,8%", C.ink, "+16 p.p.", true, "Média de 12 meses: 24,1%")}
  </div>
  <div style="display:flex;gap:16px;align-items:stretch">
    ${card(`${cardHead("Entradas × gastos", legend, "Últimos 12 meses · transferências internas excluídas")}${chart()}<div style="display:flex;border-top:1px solid ${C.border};margin:0 20px;padding:14px 0 18px">${[["Gasto médio/mês","€4.808"],["Mês mais caro","Dez · €6.400"],["Meses com sobra","12 de 12"],["Sobra acumulada","€16.520"]].map(([l,v],i)=>`<div style="flex:1;${i?`border-left:1px solid ${C.border};padding-left:16px`:""}"><div style="font-size:12px;color:${C.ink3}">${l}</div><div style="margin-top:4px">${num(v,15,C.ink,700)}</div></div>`).join("")}</div>`, "flex:1.75")}
    ${card(`${cardHead("Gastos por categoria", link("Todas"))}<div style="display:flex;flex-direction:column;gap:13px;padding:20px 24px 24px">${catRows}</div>`, "flex:1")}
  </div>
  <div style="display:flex;gap:16px;align-items:stretch">
    ${card(`${cardHead("Últimas transações", link("Ver todas"))}<div style="margin-top:12px">${TX.map(txRowCompact).join("")}</div>`, "flex:1.2")}
    <div style="flex:1;display:flex;flex-direction:column;gap:16px">
      ${card(`${cardHead("Por responsável", "", "Quem gastou o quê em agosto")}${memberBlock}`)}
      ${card(`${cardHead("Por conta", "", "Gastos na moeda original da conta")}<div style="padding:12px 20px 8px">${accountRows}</div>`)}
    </div>
  </div>
</div>`;

// ---------- 2. Transações ----------
const chip = (label, value, on) => `<span style="display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border-radius:9px;border:1px ${on ? "solid" : "dashed"} ${on ? "transparent" : C.borderStrong};background:${on ? C.surface : "transparent"};${on ? `box-shadow:${SH_SM};` : ""}font-size:13px;color:${C.ink2};white-space:nowrap">${on ? "" : ic("plus", C.ink3, 13, 2)}${label}${value ? `<b style="color:${C.ink};font-weight:600">${value}</b>${ic("chevD", C.ink3, 13)}` : ""}</span>`;
const toggle = (on) => `<span style="width:30px;height:18px;border-radius:99px;background:${on ? C.brand : C.borderStrong};display:inline-flex;align-items:center;padding:2px;justify-content:${on ? "flex-end" : "flex-start"}"><span style="width:14px;height:14px;border-radius:99px;background:#fff"></span></span>`;

const DAYS = [
  ["Qui, 20 ago", "−€118,62", [
    { t: "Mercadona", raw: "MERCADONA VALENCIA", cat: "Mercado", m: "Ana", acc: "Revolut", cur: "EUR", v: "−€86,42" },
    { t: "Café Bóveda", raw: "BOVEDA CAFE SL", cat: "Restaurantes", m: "Thiago", acc: "Revolut", cur: "EUR", v: "−€7,20" },
    { t: "Metrovalencia", raw: "FGV RECARGA", cat: "Transporte", m: "Ana", acc: "Revolut", cur: "EUR", v: "−€25,00", pend: true },
  ]],
  ["Qua, 19 ago", "+€4.186,76", [
    { t: "Salário", raw: "NOMINA ACME SL", cat: "Salário", m: "Thiago", acc: "Revolut", cur: "EUR", v: "+€4.200,00", inc: true },
    { t: "Netflix", raw: "NETFLIX.COM", cat: "Assinaturas", m: "Thiago", acc: "Wise", cur: "USD", v: "−€13,24", orig: "−US$ 15,49" },
  ]],
  ["Ter, 18 ago", "−€14,80", [
    { t: "Wise → Revolut", raw: "TRANSFERENCIA DE WISE", cat: "Transferência", m: "Thiago", acc: "Revolut", cur: "EUR", v: "€500,00", xfer: true },
    { t: "Uber", raw: "UBER *TRIP", cat: "Transporte", m: "Thiago", acc: "Revolut", cur: "EUR", v: "−€14,80" },
  ]],
  ["Sex, 14 ago", "−€64,32", [
    { t: "Pão de Açúcar", raw: "PAO DE ACUCAR 1123 SAO PAULO", cat: "Mercado", m: "Ana", acc: "Wise", cur: "BRL", v: "−€64,32", orig: "−R$ 412,90", sel: true },
  ]],
  ["Qui, 13 ago", "−€1.450,00", [
    { t: "Aluguel", raw: "RECIBO ALQUILER AGOSTO", cat: "Moradia", m: "Casa", acc: "Revolut", cur: "EUR", v: "−€1.450,00" },
  ]],
];
const txRow = (x) => `
  <div style="display:flex;align-items:center;gap:14px;height:58px;padding:0 18px;border-top:1px solid ${C.border};${x.sel ? `background:${hexA(C.brand, 0.06)};box-shadow:inset 3px 0 0 ${C.brand};` : ""}">
    ${catIcon(x.cat, 34)}
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;white-space:nowrap">${x.t}${x.pend ? badge("pendente", C.warn, C.warnSoft) : ""}${x.xfer ? badge("interna", C.xfer, C.xferSoft, "swap") : ""}</div>
      <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:${C.ink3};margin-top:3px;white-space:nowrap"><span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:-.01em">${x.raw}</span>·<span>${x.acc}</span>${cur(x.cur)}</div>
    </div>
    <div style="width:140px">${x.xfer ? `<span style="font-size:12px;color:${C.ink3}">fora dos totais</span>` : catPill(x.cat)}</div>
    <div style="width:78px">${memberChip(x.m)}</div>
    <div style="width:104px;text-align:right">${num(x.v, 14, x.xfer ? C.ink3 : x.inc ? C.inc : C.ink, x.xfer ? 500 : 600)}${x.orig ? `<div style="font-size:11.5px;color:${C.ink3};margin-top:2px;font-variant-numeric:tabular-nums">${x.orig}</div>` : ""}</div>
  </div>`;

const field = (label, val) => `<div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:12px;font-weight:500;color:${C.ink3}">${label}</span><div style="height:38px;border:1px solid ${C.borderStrong};border-radius:10px;background:${C.surface};display:flex;align-items:center;justify-content:space-between;padding:0 10px 0 10px;font-size:13.5px">${val}${ic("chevD", C.ink3, 14)}</div></div>`;
const fxRow = (code, sym, val, note, base) => `
  <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid ${C.border}">
    ${cur(code)}<span style="flex:1;font-size:12.5px;color:${C.ink3}">${note}</span>${num(val, 14, base ? C.ink : C.ink, base ? 700 : 600)}
  </div>`;
const drawer = `
<aside style="width:384px;flex:none;background:${C.surface};box-shadow:-1px 0 0 rgba(16,24,40,.04), -16px 0 40px -12px rgba(16,24,40,.12);display:flex;flex-direction:column">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid ${C.border}">
    <span style="font-size:13px;font-weight:600;color:${C.ink2}">Detalhe da transação</span>
    <div style="display:flex;gap:4px">${ic("dots", C.ink3, 18)}<span style="width:8px"></span>${ic("x", C.ink3, 18)}</div>
  </div>
  <div style="padding:22px;display:flex;flex-direction:column;gap:20px">
    <div style="display:flex;gap:14px;align-items:center">
      ${catIcon("Mercado", 46)}
      <div><div style="font-family:${SERIF};font-size:26px;font-weight:400;line-height:1.05">Pão de Açúcar</div><div style="font-size:12.5px;color:${C.ink3};margin-top:3px">Sex, 14 ago 2026 · Wise ${cur("BRL")}</div></div>
    </div>
    <div style="border-radius:14px;background:${C.tint};padding:18px 18px 6px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${C.ink3}">Valor original</div>
      <div style="font-family:${SERIF};font-size:44px;font-weight:400;line-height:1.05;letter-spacing:-.02em;margin-top:4px">−R$ 412,90</div>
      <div style="margin-top:12px">
        ${fxRow("EUR", "€", "−€64,32", "1 EUR = 6,4196 BRL")}
        ${fxRow("USD", "US$", "−US$ 75,24", "1 EUR = 1,1698 USD")}
      </div>
      <div style="display:flex;align-items:center;gap:6px;padding:10px 0 8px;border-top:1px solid ${C.border};font-size:11.5px;color:${C.ink3}">${ic("info", C.ink3, 13)}<span style="flex:1">Taxa BCE de 14/08/2026 via Frankfurter</span><span style="color:${C.brand};font-weight:600">Ajustar</span></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      ${field("Categoria", catPill("Mercado"))}
      ${field("Responsável", memberChip("Ana"))}
      ${field("Tipo", "Gasto")}
      ${field("Data", "14/08/2026")}
    </div>
    <div style="display:flex;gap:10px;padding:12px 14px;border-radius:10px;background:${C.brandSoft}">
      <span style="width:16px;height:16px;border-radius:5px;background:${C.brand};display:flex;align-items:center;justify-content:center;flex:none;margin-top:1px">${ic("check", "#fff", 11, 3)}</span>
      <div style="font-size:12.5px;color:${C.brandInk};line-height:1.45"><b>Criar regra:</b> sempre classificar <span style="font-family:'JetBrains Mono',monospace;font-size:11.5px">PAO DE ACUCAR*</span> como Mercado · Ana</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:${C.ink2}">
      <div style="display:flex;align-items:center;gap:8px">${ic("file", C.ink3, 14)}<span>Importado de <span style="color:${C.ink};font-weight:500">statement_BRL_…_08-19.pdf</span></span></div>
      <div style="display:flex;align-items:center;gap:8px">${ic("shield", C.ink3, 14)}Revisado por você em 20/08 · confiança da IA 96%</div>
    </div>
  </div>
  <div style="flex:1"></div>
  <div style="display:flex;justify-content:space-between;gap:10px;padding:16px 22px;border-top:1px solid ${C.border}">
    ${btn("Excluir", "ghost")}<div style="display:flex;gap:8px">${btn("Cancelar", "secondary")}${btn("Salvar alterações", "primary")}</div>
  </div>
</aside>`;

const txBody = `
<div style="display:flex;flex:1;min-height:0">
  <div style="flex:1;min-width:0;overflow:hidden;display:flex;flex-direction:column">
    ${topbar("Transações", "142 em agosto · 4 contas · 3 moedas", `${lens("EUR")}${btn("Nova", "secondary", "plus")}`)}
    <div style="padding:4px 40px 48px;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px;height:36px;width:230px;padding:0 12px;border-radius:9px;background:${C.surface};box-shadow:${SH_SM};font-size:13.5px;color:${C.ink3}">${ic("search", C.ink3, 15)}Buscar descrição…</div>
        ${chip("Período ", "Ago 2026", true)}${chip("Responsável ", "Ana, Thiago", true)}${chip("Categoria")}${chip("Conta")}${chip("Moeda")}
        <div style="flex:1"></div>
        <span style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:${C.ink2}">${toggle(false)}Transferências internas</span>
      </div>
      <div style="display:flex;gap:36px;padding:18px 22px;border-radius:18px;background:${C.surface};box-shadow:${SH}">
        ${[["Gastos", "−€4.183,52", C.ink], ["Entradas", "+€6.420,00", C.inc], ["Saldo", "+€2.236,48", C.ink], ["Pendentes", "3 · −€61,20", C.warn]].map(([l, v, c]) => `<div><div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${C.ink3}">${l}</div><div style="margin-top:4px;font-family:${SERIF};font-size:28px;line-height:1.1;color:${c}">${v}</div></div>`).join("")}

      </div>
      ${card(DAYS.map(([day, tot, rows]) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px 10px;background:${C.tint};border-top:1px solid ${C.border}"><span style="font-size:12px;font-weight:600;letter-spacing:.02em;color:${C.ink2};text-transform:uppercase">${day}</span>${num(tot, 12.5, C.ink3, 500)}</div>
        ${rows.map(txRow).join("")}`).join(""), "overflow:hidden")}
    </div>
  </div>
  ${drawer}
</div>`;

// ---------- 3. Revisão ----------
const step = (n, label, state) => {
  const done = state === "done", cur = state === "current";
  return `<div style="display:flex;align-items:center;gap:8px"><span style="width:22px;height:22px;border-radius:99px;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;${done ? `background:${C.brand};color:#fff` : cur ? `background:${C.surface};color:${C.brand};box-shadow:0 0 0 2px ${C.brand}` : `background:${C.sunken};color:${C.ink3}`}">${done ? ic("check", "#fff", 12, 3) : n}</span><span style="font-size:13px;font-weight:${cur ? 700 : 500};color:${cur || done ? C.ink : C.ink3}">${label}</span></div>`;
};
const stepLine = `<div style="width:40px;height:2px;border-radius:2px;background:${C.borderStrong}"></div>`;
const stat = (n, label, color, sel) => `<div style="flex:1;padding:18px 20px;border-radius:18px;background:${C.surface};box-shadow:${sel ? `0 0 0 1.5px ${color}, 0 10px 28px -6px ${hexA(color, 0.25)}` : SH}"><div style="font-family:${SERIF};font-size:40px;line-height:1;color:${color}">${n}</div><div style="font-size:12.5px;color:${C.ink2};margin-top:6px">${label}</div></div>`;
const conf = (p) => {
  const col = p >= 85 ? C.inc : p >= 65 ? C.warn : C.danger;
  return `<div style="display:flex;align-items:center;gap:7px"><div style="display:flex;gap:2px">${[0, 1, 2, 3, 4].map((i) => `<span style="width:5px;height:12px;border-radius:2px;background:${i < Math.round(p / 20) ? col : C.sunken}"></span>`).join("")}</div><span style="font-size:12px;font-weight:600;color:${col};font-variant-numeric:tabular-nums">${p}%</span></div>`;
};
const REV = [
  { d: "12/08", raw: "BIZUM ENVIADO A J. MARTINEZ", v: "−€45,00", p: 42, why: "Pagamento a pessoa ou transferência?", cat: "Outros gastos", m: null, alt: "Transferência" },
  { d: "11/08", raw: "AMZN MKTP ES*2K4L9", v: "−€37,99", p: 58, why: "Duas categorias prováveis", cat: "Compras", m: "Thiago", alt: "Moradia" },
  { d: "10/08", raw: "PAYPAL *STEAMGAMES", v: "−€19,99", p: 55, why: "Comerciante novo", cat: "Lazer", m: "Thiago" },
  { d: "09/08", raw: "TPV GASOLINERA REPSOL", v: "−€62,10", p: 74, why: "Responsável não identificado", cat: "Transporte", m: null },
  { d: "08/08", raw: "TRANSFERENCIA DE WISE", v: "+€500,00", p: 88, why: "Par encontrado: Wise EUR −€500,00 em 08/08", cat: "Transferência", m: "Thiago", xfer: true },
  { d: "05/08", raw: "COMISION CAMBIO DIVISA", v: "−€3,20", p: 61, why: "Possível taxa de câmbio", cat: "Impostos & Taxas", m: "Thiago" },
];
const revRow = (r, i) => `
  <div style="display:flex;align-items:center;gap:14px;padding:12px 18px;border-top:1px solid ${C.border};${i === 0 ? `background:${hexA(C.warn, 0.05)};` : ""}">
    <span style="width:16px;height:16px;border-radius:5px;border:1.5px solid ${C.borderStrong};background:${C.surface};flex:none"></span>
    <span style="width:44px;font-size:12.5px;color:${C.ink2};font-variant-numeric:tabular-nums">${r.d}</span>
    <div style="flex:1;min-width:0">
      <div style="font-size:12.5px;font-weight:600;font-family:'JetBrains Mono',monospace;letter-spacing:-.01em">${r.raw}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:5px;font-size:12px;color:${r.xfer ? C.xfer : C.warn}">${ic(r.xfer ? "swap" : "alert", r.xfer ? C.xfer : C.warn, 13, 2)}${r.why}</div>
    </div>
    <div style="width:92px">${conf(r.p)}</div>
    <div style="width:178px;display:flex;flex-direction:column;gap:5px;align-items:flex-start">${catPill(r.cat, { suggested: true, caret: true })}${r.alt ? `<span style="font-size:11.5px;color:${C.ink3}">ou <span style="text-decoration:underline">${r.alt}</span></span>` : ""}</div>
    <div style="width:110px">${r.m ? memberChip(r.m) : `<span style="display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 9px;border-radius:8px;border:1px dashed ${C.warn};font-size:12.5px;color:${C.warn};font-weight:500">${ic("users", C.warn, 13)}Definir</span>`}</div>
    <div style="width:96px;text-align:right">${num(r.v, 14, r.xfer ? C.ink3 : r.v.startsWith("+") ? C.inc : C.ink)}</div>
    <div style="display:flex;gap:6px">
      <span style="width:30px;height:30px;border-radius:8px;background:${C.surface};box-shadow:${SH_SM};display:flex;align-items:center;justify-content:center">${ic("x", C.ink3, 14, 2)}</span>
      <span style="width:30px;height:30px;border-radius:8px;background:${C.brand};display:flex;align-items:center;justify-content:center">${ic("check", "#fff", 15, 2.5)}</span>
    </div>
  </div>`;
const tab = (l, n, on) => `<span style="display:flex;align-items:center;gap:7px;height:40px;padding:0 2px;font-size:13.5px;font-weight:${on ? 600 : 500};color:${on ? C.ink : C.ink3};box-shadow:${on ? `inset 0 -2px 0 ${C.ink}` : "none"}">${l}<span style="padding:1px 7px;border-radius:99px;font-size:11.5px;font-weight:600;background:${on ? C.ink : C.sunken};color:${on ? "#fff" : C.ink2}">${n}</span></span>`;

const reviewBody = `
<div style="padding:26px 40px 0;display:flex;align-items:center;gap:8px;font-size:12.5px;color:${C.ink3}">Importar ${ic("chevR", C.ink3, 13)}<span style="color:${C.ink2}">account-statement_2026-08-01_2026-08-20_es-es.csv</span></div>
${topbar("Revisar importação", `Revolut ${"·"} EUR ${"·"} 01–20 ago 2026 ${"·"} 63 linhas lidas`, `${btn("Descartar", "ghost")}${btn("Salvar e continuar depois", "secondary")}`, "Importar · passo 3 de 4").replace("padding:36px 40px 26px", "padding:12px 40px 22px")}
<div style="padding:0 40px 0;display:flex;flex-direction:column;gap:18px">
  <div style="display:flex;align-items:center;gap:12px">
    ${step(1, "Upload", "done")}${stepLine}${step(2, "Leitura", "done")}${stepLine}${step(3, "Revisão", "current")}${stepLine}${step(4, "Confirmado", "todo")}
  </div>
  <div style="display:flex;gap:12px">
    ${stat("63", "linhas lidas do arquivo", C.ink)}
    ${stat("51", "prontas para entrar", C.inc)}
    ${stat("9", "precisam de você", C.warn, true)}
    ${stat("3", "duplicadas, ignoradas", C.ink3)}
  </div>
  <div style="display:flex;gap:12px;align-items:center;padding:12px 16px;border-radius:14px;background:${C.brandSoft}">
    <div style="width:30px;height:30px;border-radius:9px;background:${C.surface};display:flex;align-items:center;justify-content:center;flex:none">${ic("shield", C.brand, 16, 2)}</div>
    <div style="flex:1;font-size:12.5px;line-height:1.5;color:${C.brandInk}"><b>Layout reconhecido: “Revolut ES · CSV”</b> (usado 4×) — valores lidos de forma determinística, nenhum número passou pela IA.</div>
    <div style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;background:${C.surface};box-shadow:${SH_SM};font-size:12.5px;color:${C.brandInk};white-space:nowrap">${ic("check", C.inc, 14, 2.5)}<b>Saldo confere</b> · +€1.395,73</div>
  </div>
  ${card(`
    <div style="display:flex;align-items:center;gap:24px;padding:0 18px;border-bottom:1px solid ${C.border}">
      ${tab("Precisam de revisão", "9", true)}${tab("Prontas", "51")}${tab("Duplicadas", "3")}${tab("Transferências internas", "2")}
      <div style="flex:1"></div>
      <span style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:${C.ink2}">${ic("filter", C.ink3, 13)}Ordenar por confiança</span>
    </div>
    <div style="display:flex;align-items:center;gap:14px;padding:9px 18px;background:${C.tint};font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${C.ink3}">
      <span style="width:16px"></span><span style="width:44px">Data</span><span style="flex:1">Descrição no extrato · motivo</span><span style="width:92px">Confiança</span><span style="width:178px">Categoria sugerida</span><span style="width:110px">Responsável</span><span style="width:96px;text-align:right">Valor</span><span style="width:66px"></span>
    </div>
    ${REV.map(revRow).join("")}
    <div style="display:flex;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid ${C.border};font-size:12.5px;color:${C.ink3}">+ 3 outras · ${link("Mostrar todas")}</div>
  `, "overflow:hidden")}
</div>
<div style="flex:1"></div>
<div style="margin:24px 40px 28px;display:flex;align-items:center;gap:14px;padding:14px 16px 14px 20px;border-radius:14px;background:${C.ink};color:#fff;box-shadow:0 12px 32px rgba(22,24,27,.18)">
  <div style="flex:1;font-size:13.5px"><b>51 prontas</b> <span style="color:rgba(255,255,255,.65)">· 9 aguardando · as pendentes ficam salvas para depois</span></div>
  <span style="font-size:13px;color:rgba(255,255,255,.75);display:flex;align-items:center;gap:6px">${ic("check", "rgba(255,255,255,.75)", 14, 2)}Aceitar todas com confiança ≥ 85%</span>
  <span style="display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 16px;border-radius:9px;background:#fff;color:${C.ink};font-size:13.5px;font-weight:700">Confirmar 51 transações</span>
</div>`;

// ---------- 4. Fundamentos ----------
const swatch = (name, hex, note) => `<div style="display:flex;flex-direction:column;gap:10px;width:132px"><div style="height:72px;border-radius:14px;background:${hex};box-shadow:${SH_SM}"></div><div style="font-size:13px;font-weight:600">${name}</div><div style="font-size:11.5px;color:${C.ink3};font-family:'JetBrains Mono',monospace">${hex}${note ? ` · ${note}` : ""}</div></div>`;
const section = (title, inner) => `<div style="display:flex;flex-direction:column;gap:16px"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.ink3}">${title}</div>${inner}</div>`;
const foundations = `
<section class="screen" data-name="Fundamentos" style="width:1440px;background:${C.bg};font-family:Inter,sans-serif;color:${C.ink};padding:64px 72px;box-sizing:border-box;display:flex;flex-direction:column;gap:48px">
  <div><div style="font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${C.ink3};margin-bottom:8px">Sistema visual · v2</div><div style="font-family:${SERIF};font-size:56px;line-height:1;letter-spacing:-.015em">Daily Money — fundamentos</div><div style="font-size:14px;color:${C.ink2};margin-top:6px;max-width:760px;line-height:1.5">Branco limpo, cards que flutuam com sombra suave e títulos em serifa, com cara de revista. Gasto não é erro: fica em tinta neutra com sinal “−”. Verde só para dinheiro que entra; âmbar só para o que pede ação; azul só para transferências internas.</div></div>
  ${section("Cores", `<div style="display:flex;gap:16px;flex-wrap:wrap">
    ${swatch("Fundo", C.bg)}${swatch("Tinta clara", C.tint, "faixas")}${swatch("Afundado", C.sunken)}${swatch("Tinta", C.ink, "gastos")}${swatch("Marca", C.brand, "ações")}${swatch("Entrada", C.inc)}${swatch("Atenção", C.warn, "revisar")}${swatch("Interna", C.xfer)}${swatch("Perigo", C.danger, "só erros")}
  </div>`)}
  <div style="display:flex;gap:56px">
    ${section("Tipografia · Instrument Serif + Inter", `<div style="display:flex;flex-direction:column;gap:14px">
      <div><span style="font-family:${SERIF};font-size:46px;line-height:1">€4.183,52</span> <span style="font-size:12px;color:${C.ink3};font-weight:500">Valor KPI · Instrument Serif 46</span></div>
      <div><span style="font-family:${SERIF};font-size:48px;line-height:1">Título da página</span> <span style="font-size:12px;color:${C.ink3};font-weight:500">Instrument Serif 48</span></div>
      <div><span style="font-family:${SERIF};font-size:24px">Título de card</span> <span style="font-size:12px;color:${C.ink3};font-weight:500">Instrument Serif 24</span></div><div style="font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:${C.ink3}">Rótulo / eyebrow <span style="text-transform:none;letter-spacing:0;font-weight:500">Inter 11 · caixa alta</span></div>
      <div style="font-size:13.5px">Corpo e linhas de tabela <span style="font-size:12px;color:${C.ink3}">13,5/400</span></div>
      <div style="font-size:12px;color:${C.ink3}">Meta e legenda · 12/400</div>
      <div style="font-size:12px;font-family:'JetBrains Mono',monospace">MERCADONA VALENCIA <span style="font-family:Inter;color:${C.ink3}">texto bruto do extrato · mono</span></div>
    </div>`)}
    ${section("Como mostrar dinheiro", `<div style="display:flex;flex-direction:column;gap:0;width:520px;background:${C.surface};box-shadow:${SH};border-radius:18px;padding:6px 22px">
      ${[["Gasto na moeda da lente", num("−€86,42", 14), "tinta, sinal “−”"],
         ["Entrada", num("+€4.200,00", 14, C.inc), "verde, sinal “+”"],
         ["Gasto em outra moeda", `<div style="text-align:right">${num("−€13,24", 14)}<div style="font-size:11.5px;color:${C.ink3}">−US$ 15,49</div></div>`, "convertido em cima, original embaixo"],
         ["Transferência interna", num("€500,00", 14, C.ink3, 500), "cinza, fora dos totais"],
         ["Pendente", badge("pendente", C.warn, C.warnSoft), "conta nos totais, marcada"]].map(([a, b, c], i) => `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;${i ? `border-top:1px solid ${C.border}` : ""}"><div style="flex:1"><div style="font-size:13.5px;font-weight:500">${a}</div><div style="font-size:12px;color:${C.ink3};margin-top:2px">${c}</div></div>${b}</div>`).join("")}
    </div>`)}
  </div>
  <div style="display:flex;gap:56px">
    ${section("Componentes", `<div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;gap:10px;align-items:center">${btn("Confirmar", "primary")}${btn("Salvar e continuar depois", "secondary")}${btn("Descartar", "ghost")}</div>
      <div style="display:flex;gap:10px;align-items:center">${lens("EUR")}${period("Agosto 2026")}</div>
      <div style="display:flex;gap:8px;align-items:center">${catPill("Mercado")}${catPill("Restaurantes")}${catPill("Compras", { suggested: true, caret: true })}${memberChip("Ana")}${cur("BRL")}</div>
      <div style="display:flex;gap:8px;align-items:center">${badge("pendente", C.warn, C.warnSoft)}${badge("transferência interna", C.xfer, C.xferSoft, "swap")}${badge("+0,3%", C.inc, C.incSoft)}${badge("erro ao ler PDF", C.danger, C.dangerSoft, "alert")}</div>
      <div style="display:flex;gap:22px;align-items:center">${conf(96)}${conf(74)}${conf(42)}</div>
    </div>`)}
    ${section("Categorias", `<div style="display:grid;grid-template-columns:repeat(4,auto);gap:12px 22px">${Object.keys(CAT).filter((k) => k !== "Transferência").map((k) => `<div style="display:flex;align-items:center;gap:10px;font-size:13px">${catIcon(k, 30)}${k}</div>`).join("")}</div>`)}
  </div>
</section>`;

// ---------- 4. Importar ----------
P.cloud = '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M12 12v9"/><path d="M16 16l-4-4-4 4"/>';
P.refresh = '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>';
P.trash = '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';
P.pencil = '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>';
P.layers = '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>';
P.camera = '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>';
P.wand = '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h.01M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>';
P.menu = '<path d="M4 6h16M4 12h16M4 18h16"/>';

const eyebrow = (t) => `<div style="font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:${C.ink3}">${t}</div>`;
const serifTitle = (t, s = 24) => `<div style="font-family:${SERIF};font-size:${s}px;line-height:1.1;color:${C.ink}">${t}</div>`;
const iconBtn = (n) => `<span style="width:32px;height:32px;border-radius:9px;background:${C.surface};box-shadow:${SH_SM};display:flex;align-items:center;justify-content:center">${ic(n, C.ink2, 15)}</span>`;
const typeChip = (t) => `<span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:600;color:${C.ink2};border:1px solid ${C.borderStrong};border-radius:5px;padding:1px 5px">${t}</span>`;

const UPS = [
  { f: "account-statement_2026-08-01_2026-08-20_es-es.csv", acc: "Revolut", cur: "EUR", t: "CSV", when: "hoje, 09:12", meta: "63 linhas · layout reconhecido", st: "review" },
  { f: "statement_143459274_USD_2025-12-16_2026-08-19.pdf", acc: "Wise", cur: "USD", t: "PDF", when: "hoje, 09:14", meta: "IA extraindo linhas · página 3 de 7", st: "parsing" },
  { f: "Extrato-01-08-2025-a-19-08-2026.pdf", acc: "Conta BR", cur: "BRL", t: "PDF", when: "ontem, 22:40", meta: "O PDF está protegido por senha. Exporte sem senha e envie de novo.", st: "failed" },
  { f: "statement_143459558_EUR_2025-12-16_2026-08-19.pdf", acc: "Wise", cur: "EUR", t: "PDF", when: "19 ago", meta: "48 transações confirmadas", st: "done" },
  { f: "extractDocument_20260820.csv", acc: "Conta BR", cur: "BRL", t: "CSV", when: "19 ago", meta: "112 transações confirmadas · 4 duplicadas ignoradas", st: "done" },
];
const upStatus = (st) => ({
  review: badge("9 para revisar", C.warn, C.warnSoft, "alert"),
  parsing: badge("lendo…", C.xfer, C.xferSoft, "refresh"),
  failed: badge("falhou", C.danger, C.dangerSoft, "x"),
  done: badge("confirmado", C.inc, C.incSoft, "check"),
}[st]);
const upAction = (st) => ({
  review: btn("Revisar", "primary"),
  parsing: `<span style="font-size:12.5px;color:${C.ink3}">aguarde</span>`,
  failed: `<div style="display:flex;gap:6px">${iconBtn("trash")}${btn("Reprocessar", "secondary", "refresh")}</div>`,
  done: `<span style="font-size:13px;font-weight:600;color:${C.brand}">Ver transações</span>`,
}[st]);
const upRow = (u) => `
  <div style="display:flex;align-items:center;gap:14px;padding:14px 22px;border-top:1px solid ${C.border};${u.st === "failed" ? `background:${hexA(C.danger, 0.035)};` : ""}">
    <div style="width:38px;height:38px;border-radius:11px;background:${u.st === "failed" ? C.dangerSoft : C.sunken};display:flex;align-items:center;justify-content:center;flex:none">${ic("file", u.st === "failed" ? C.danger : C.ink2, 18)}</div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:8px"><span style="font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:560px">${u.f}</span>${typeChip(u.t)}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:12px;color:${C.ink3};white-space:nowrap">${u.acc} ${cur(u.cur)} <span>·</span> ${u.when} <span>·</span> <span style="color:${u.st === "failed" ? C.danger : C.ink3};font-weight:${u.st === "failed" ? 600 : 400}">${u.meta}</span></div>
      ${u.st === "parsing" ? `<div style="height:4px;border-radius:99px;background:${C.sunken};margin-top:8px;width:320px"><div style="width:42%;height:4px;border-radius:99px;background:${C.xfer}"></div></div>` : ""}
    </div>
    <div style="width:130px">${upStatus(u.st)}</div>
    <div style="width:170px;display:flex;justify-content:flex-end">${upAction(u.st)}</div>
  </div>`;

const howStep = (n, t, d) => `<div style="display:flex;gap:14px"><div style="font-family:${SERIF};font-size:30px;line-height:1;color:${C.brand};width:22px">${n}</div><div><div style="font-size:13.5px;font-weight:600">${t}</div><div style="font-size:12.5px;color:${C.ink2};line-height:1.5;margin-top:3px">${d}</div></div></div>`;
const PROFILES = [["Revolut ES · CSV", "4 usos", "você confirmou"], ["Conta BR · CSV", "2 usos", "você confirmou"], ["Wise · PDF", "extração por IA", "revisão sempre"]];

const importBody = `
${topbar("Importar", "Extratos e recibos de qualquer banco, em qualquer das 3 moedas", `${btn("Layouts aprendidos", "secondary", "layers")}`, "Extratos e recibos")}
<div style="padding:4px 40px 48px;display:flex;flex-direction:column;gap:22px">
  <div style="display:flex;gap:22px;align-items:stretch">
    ${card(`
      <div style="margin:10px;border-radius:14px;border:1.5px dashed ${C.borderStrong};background:${C.tint};padding:44px 24px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px">
        <div style="width:64px;height:64px;border-radius:20px;background:${C.surface};box-shadow:${SH};display:flex;align-items:center;justify-content:center">${ic("cloud", C.brand, 30, 1.8)}</div>
        ${serifTitle("Solte os arquivos aqui", 32)}
        <div style="font-size:13.5px;color:${C.ink2}">CSV, XLSX, PDF ou foto de recibo · vários de uma vez</div>
        <div style="display:flex;gap:10px;margin-top:6px">${btn("Escolher arquivos", "primary", "upload")}${btn("Tirar foto", "secondary", "camera")}</div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;padding:12px 24px 18px">
        <span style="font-size:12.5px;color:${C.ink3}">Conta</span>
        <div style="height:34px;border:1px solid ${C.borderStrong};border-radius:9px;padding:0 10px;display:flex;align-items:center;gap:8px;font-size:13px">${ic("wand", C.brand, 14)}Detectar automaticamente ${ic("chevD", C.ink3, 13)}</div>
        <span style="font-size:12px;color:${C.ink3}">Só precisa escolher se o arquivo não disser o banco.</span>
      </div>`, "flex:1.6")}
    ${card(`<div style="padding:24px 24px 26px;display:flex;flex-direction:column;gap:20px">
      ${eyebrow("Como funciona")}
      ${howStep("1", "A gente lê o arquivo", "CSV e XLSX usam o layout aprendido do banco — nenhum valor passa pela IA. PDF e fotos são extraídos pela IA.")}
      ${howStep("2", "Você revisa só o que tem dúvida", "O que tem confiança alta já fica pronto. O resto aparece com o motivo.")}
      ${howStep("3", "Confirma e entra nos números", "Cada transação é convertida para EUR, USD e BRL pela taxa do dia da compra.")}
    </div>`, "flex:1")}
  </div>
  ${card(`${cardHead("Importações recentes", `<div style="display:flex;gap:6px">${badge("1 falhou", C.danger, C.dangerSoft)}${badge("1 para revisar", C.warn, C.warnSoft)}</div>`, "Arquivos dos últimos 30 dias")}<div style="margin-top:16px">${UPS.map(upRow).join("")}</div>`, "overflow:hidden")}
</div>
</div>`;

// ---------- 5. Categorias e regras ----------
const CAT_LIST = [["Moradia", "€1.450,00", 3], ["Mercado", "€612,38", 6], ["Viagem", "€540,00", 4], ["Restaurantes", "€438,90", 11], ["Transporte", "€296,40", 7], ["Contas & Serviços", "€284,10", 5], ["Assinaturas", "€182,74", 9], ["Saúde", "€96,20", 3], ["Compras", "€88,10", 6], ["Lazer", "€61,30", 4], ["Impostos & Taxas", "€22,40", 2], ["Outros gastos", "€379,00", 0]];
const catListRow = ([n, v, r]) => {
  const on = n === "Mercado";
  return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;margin:0 8px;border-radius:12px;${on ? `background:${C.sunken};` : ""}">${catIcon(n, 32)}<div style="flex:1"><div style="font-size:13.5px;font-weight:${on ? 600 : 500}">${n}</div><div style="font-size:12px;color:${C.ink3};margin-top:2px">${r ? `${r} regras` : "sem regras"}</div></div>${num(v, 13, C.ink2, 500)}</div>`;
};
const RULES = [
  ["mercadona", "Comerciante", "Você", 38, 5],
  ["pao de acucar", "Comerciante", "Você", 12, 4],
  ["carrefour", "Comerciante", "IA", 7, 3],
  ["lidl", "Comerciante", "IA", 5, 2],
  ["supermercado", "Palavra-chave", "Você", 3, 2],
  ["^ALDI\\s", "Regex", "Você", 2, 1],
];
const strength = (w) => `<div style="display:flex;gap:3px">${[0, 1, 2, 3, 4].map((i) => `<span style="width:7px;height:7px;border-radius:99px;background:${i < w ? C.brand : C.sunken}"></span>`).join("")}</div>`;
const ruleRow = ([p, t, src, hits, w]) => `
  <div style="display:flex;align-items:center;gap:14px;padding:13px 24px;border-top:1px solid ${C.border}">
    <span style="flex:1;font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:600">${p}</span>
    <span style="width:110px;font-size:12.5px;color:${C.ink2}">${t}</span>
    <span style="width:80px">${src === "IA" ? badge("IA", C.xfer, C.xferSoft, "spark") : badge("Você", C.ink2, C.sunken)}</span>
    <span style="width:70px;text-align:right">${num(String(hits), 13, C.ink, 600)}</span>
    <span style="width:70px;display:flex;justify-content:flex-end">${strength(w)}</span>
    <span style="width:60px;display:flex;justify-content:flex-end;gap:4px">${ic("pencil", C.ink3, 15)}<span style="width:8px"></span>${ic("trash", C.ink3, 15)}</span>
  </div>`;
const swatchDots = ["#16a34a", "#0d9488", "#0284c7", "#4f46e5", "#8b5cf6", "#db2777", "#ea580c", "#ca8a04", "#64748b"].map((c) => `<span style="width:22px;height:22px;border-radius:99px;background:${c};${c === "#16a34a" ? `box-shadow:0 0 0 2px #fff, 0 0 0 4px ${c}` : ""}"></span>`).join("");
const miniBars = [0.62, 0.58, 0.71, 0.8, 0.55, 0.6, 0.66, 0.59, 0.7, 0.64, 0.74, 0.61].map((h, i) => `<div style="flex:1;height:${h * 70}px;border-radius:4px 4px 0 0;background:${i === 11 ? CAT.Mercado.c : hexA(CAT.Mercado.c, 0.25)}"></div>`).join("");

const catsBody = `
${topbar("Categorias", "Como seus gastos são organizados — e as regras que classificam sozinhas", `<div style="display:flex;align-items:center;gap:2px;padding:3px;border-radius:10px;background:${C.sunken}"><span style="height:28px;padding:0 12px;border-radius:7px;display:flex;align-items:center;font-size:12.5px;font-weight:600;background:${C.surface};box-shadow:0 1px 2px rgba(16,24,40,.08)">Gastos</span><span style="height:28px;padding:0 12px;display:flex;align-items:center;font-size:12.5px;font-weight:600;color:${C.ink3}">Entradas</span></div>${btn("Nova categoria", "primary", "plus")}`, "Organização")}
<div style="padding:4px 40px 48px;display:flex;gap:22px;align-items:flex-start">
  ${card(`<div style="padding:16px 22px 10px">${eyebrow("13 categorias de gasto")}</div><div style="display:flex;flex-direction:column;gap:2px;padding-bottom:10px">${CAT_LIST.map(catListRow).join("")}</div>`, "width:330px;flex:none")}
  <div style="flex:1;display:flex;flex-direction:column;gap:22px">
    ${card(`<div style="padding:26px 26px 24px;display:flex;gap:28px">
      <div style="flex:1;display:flex;flex-direction:column;gap:18px">
        <div style="display:flex;align-items:center;gap:16px">${catIcon("Mercado", 56)}<div>${serifTitle("Mercado", 36)}<div style="font-size:12.5px;color:${C.ink3};margin-top:4px">Categoria padrão · gasto</div></div></div>
        <div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:12px;font-weight:500;color:${C.ink3}">Cor</span><div style="display:flex;gap:10px;align-items:center">${swatchDots}</div></div>
        <div style="display:flex;gap:8px">${btn("Renomear", "secondary", "pencil")}${btn("Mesclar com outra", "ghost")}</div>
      </div>
      <div style="width:330px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-end"><div>${eyebrow("Agosto")}<div style="font-family:${SERIF};font-size:40px;line-height:1.05;margin-top:4px">€612,38</div></div><span style="font-size:12px;color:${C.ink3};text-align:right">média €598<br/>58 transações</span></div>
        <div style="display:flex;align-items:flex-end;gap:4px;height:70px;margin-top:6px">${miniBars}</div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:${C.ink3}"><span>set 25</span><span>ago 26</span></div>
      </div>
    </div>`)}
    ${card(`${cardHead("Regras", btn("Nova regra", "secondary", "plus"), "Transações que batem com uma regra já chegam classificadas como Mercado")}
      <div style="display:flex;gap:10px;align-items:flex-start;margin:16px 24px 6px;padding:12px 14px;border-radius:12px;background:${C.brandSoft};font-size:12.5px;line-height:1.5;color:${C.brandInk}">${ic("spark", C.brand, 15, 2)}<span>Quando você corrige uma categoria na revisão, a regra é criada ou reforçada sozinha. Quanto mais acertos, mais força ela tem.</span></div>
      <div style="display:flex;align-items:center;gap:14px;padding:12px 24px 8px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.ink3}"><span style="flex:1">Padrão</span><span style="width:110px">Tipo</span><span style="width:80px">Origem</span><span style="width:70px;text-align:right">Acertos</span><span style="width:70px;text-align:right">Força</span><span style="width:60px"></span></div>
      ${RULES.map(ruleRow).join("")}
      <div style="height:8px"></div>`, "overflow:hidden")}
  </div>
</div>`;

// ---------- 6. Responsáveis ----------
const MEMBER_CARDS = [
  { n: "Thiago", kind: "Eu", v: "€2.310,20", tx: 64, top: [["Moradia", 0], ["Restaurantes", 0.24], ["Transporte", 0.16], ["Assinaturas", 0.08]], acc: "Revolut EUR · Wise USD" },
  { n: "Ana", kind: "Cônjuge", v: "€1.512,82", tx: 51, top: [["Mercado", 0.36], ["Saúde", 0.12], ["Compras", 0.1], ["Transporte", 0.08]], acc: "Wise BRL" },
  { n: "Casa", kind: "Compartilhado", v: "€360,50", tx: 9, top: [["Moradia", 0.7], ["Contas & Serviços", 0.3]], acc: "—" },
];
const memberCard = (m) => card(`
  <div style="padding:24px;display:flex;flex-direction:column;gap:18px">
    <div style="display:flex;align-items:center;gap:14px">${avatar(m.n, 52)}<div style="flex:1">${serifTitle(m.n, 30)}<div style="font-size:12.5px;color:${C.ink3};margin-top:3px">${m.kind}</div></div>${ic("dots", C.ink3, 18)}</div>
    <div>${eyebrow("Gastou em agosto")}<div style="font-family:${SERIF};font-size:40px;line-height:1.05;margin-top:6px">${m.v}</div><div style="font-size:12px;color:${C.ink3};margin-top:4px">${m.tx} transações</div></div>
    <div style="display:flex;height:8px;border-radius:99px;overflow:hidden;gap:2px">${m.top.map(([c, p], i) => `<div style="flex:${p || 0.42};background:${CAT[c].c}"></div>`).join("")}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${m.top.slice(0, 3).map(([c]) => catPill(c)).join("")}</div>
    <div style="display:flex;align-items:center;gap:8px;padding-top:14px;border-top:1px solid ${C.border};font-size:12.5px;color:${C.ink2}">${ic("bank", C.ink3, 14)}Contas: <b style="font-weight:600;color:${C.ink}">${m.acc}</b></div>
  </div>`, "flex:1");
const ASSIGN = [["Revolut", "EUR", "Thiago"], ["Wise", "USD", "Thiago"], ["Wise", "BRL", "Ana"], ["Wise", "EUR", null]];
const membersBody = `
${topbar("Responsáveis", "Quem fez cada gasto — usado nos filtros, no resumo e na revisão", `${btn("Adicionar pessoa", "primary", "plus")}`, "Família")}
<div style="padding:4px 40px 48px;display:flex;flex-direction:column;gap:22px">
  <div style="display:flex;gap:22px;align-items:stretch">
    ${MEMBER_CARDS.map(memberCard).join("")}
    <div style="width:200px;flex:none;border-radius:18px;border:1.5px dashed ${C.borderStrong};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:${C.ink3};font-size:13px">${ic("plus", C.ink3, 22)}Adicionar pessoa</div>
  </div>
  ${card(`${cardHead("Responsável padrão por conta", badge("proposta", C.xfer, C.xferSoft), "Na importação, cada transação já vem com quem costuma usar a conta. Você ainda pode trocar na revisão.")}
    <div style="padding:14px 24px 20px;display:grid;grid-template-columns:1fr 1fr;gap:12px 28px">
      ${ASSIGN.map(([b, c, m]) => `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:${C.tint}">${ic("bank", C.ink2, 16)}<span style="flex:1;display:flex;align-items:center;gap:6px;font-size:13.5px;font-weight:500">${b} ${cur(c)}</span>${ic("chevR", C.ink3, 14)}<span style="width:120px;display:flex;justify-content:flex-end">${m ? memberChip(m) : `<span style="font-size:12.5px;color:${C.ink3}">perguntar sempre</span>`}</span></div>`).join("")}
    </div>`)}
</div>`;

// ---------- 7. Mobile ----------
const TABS = [["dash", "Resumo"], ["list", "Transações"], ["plus", ""], ["tag", "Categorias"], ["menu", "Mais"]];
const tabbar = (active) => `
<div style="position:absolute;left:0;right:0;bottom:0;height:84px;background:rgba(255,255,255,.96);box-shadow:0 -1px 0 ${C.border};display:flex;align-items:flex-start;justify-content:space-around;padding-top:10px">
  ${TABS.map(([i, l]) => l === "" ? `<div style="width:52px;height:52px;margin-top:-18px;border-radius:18px;background:${C.brand};box-shadow:0 10px 24px -6px ${hexA(C.brand, 0.55)};display:flex;align-items:center;justify-content:center">${ic("upload", "#fff", 22, 2)}</div>` : `<div style="width:64px;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10.5px;font-weight:600;color:${l === active ? C.ink : C.ink3}">${ic(i, l === active ? C.brand : C.ink3, 21)}${l}</div>`).join("")}
</div>`;
const statusBar = `<div style="height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 26px 0 30px;font-size:15px;font-weight:600"><span>9:41</span><span style="display:flex;gap:6px;align-items:center"><span style="width:17px;height:11px;border-radius:2px;background:${C.ink}"></span><span style="width:24px;height:11px;border-radius:3px;border:1.5px solid ${C.ink}"></span></span></div>`;
const phone = (name, inner) => `<section class="screen" data-name="${name}" style="width:390px;height:844px;position:relative;overflow:hidden;background:${C.bg};font-family:Inter,sans-serif;color:${C.ink};border-radius:44px;box-shadow:0 0 0 10px #0F1115">${inner}</section>`;

const mobileDash = phone("Mobile · Resumo", `
${statusBar}
<div style="padding:8px 20px 0;display:flex;justify-content:space-between;align-items:flex-end">
  <div>${eyebrow("Agosto · 2026")}<div style="font-family:${SERIF};font-size:40px;line-height:1;margin-top:4px">Resumo</div></div>
  <div style="display:flex;align-items:center;gap:2px;padding:3px;border-radius:9px;background:${C.sunken}"><span style="height:26px;padding:0 9px;border-radius:7px;display:flex;align-items:center;font-size:12px;font-weight:600;background:${C.surface};box-shadow:0 1px 2px rgba(16,24,40,.08)">€</span><span style="height:26px;padding:0 9px;display:flex;align-items:center;font-size:12px;font-weight:600;color:${C.ink3}">US$</span><span style="height:26px;padding:0 9px;display:flex;align-items:center;font-size:12px;font-weight:600;color:${C.ink3}">R$</span></div>
</div>
<div style="padding:16px 16px 0;display:flex;flex-direction:column;gap:14px">
  ${card(`<div style="padding:20px">
    ${eyebrow("Sobrou no mês")}
    <div style="font-family:${SERIF};font-size:52px;line-height:1;margin-top:8px">+€2.236,48</div>
    <div style="font-size:12px;color:${C.ink3};margin-top:6px">R$ 14.358,20 · US$ 2.616,68 · poupança 34,8%</div>
    <div style="display:flex;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid ${C.border}">
      <div style="flex:1"><div style="font-size:11.5px;color:${C.ink3}">Entradas</div><div style="font-family:${SERIF};font-size:24px;color:${C.inc};margin-top:2px">€6.420,00</div></div>
      <div style="flex:1"><div style="font-size:11.5px;color:${C.ink3}">Gastos</div><div style="font-family:${SERIF};font-size:24px;margin-top:2px">€4.183,52</div></div>
    </div>
  </div>`)}
  <div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:14px;background:${C.warnSoft}">${ic("spark", C.warn, 16, 2)}<span style="flex:1;font-size:13px"><b>9 transações</b> esperam revisão</span>${ic("chevR", C.warn, 16, 2)}</div>
  ${card(`<div style="padding:18px 18px 8px">${serifTitle("Onde foi o dinheiro", 22)}</div>
    <div style="display:flex;height:10px;border-radius:99px;overflow:hidden;gap:2px;margin:8px 18px 14px">${CATS.slice(0, 7).map(([n, , p]) => `<div style="flex:${p};background:${CAT[n].c}"></div>`).join("")}<div style="flex:9.1;background:${CAT["Outros gastos"].c}"></div></div>
    <div style="padding:0 18px 14px;display:flex;flex-direction:column;gap:11px">${CATS.slice(0, 4).map(([n, v, p]) => `<div style="display:flex;align-items:center;gap:10px">${catIcon(n, 28)}<span style="flex:1;font-size:13.5px;font-weight:500">${n}</span>${num("€" + v, 13.5)}</div>`).join("")}</div>`)}
  ${card(`<div style="padding:16px 18px 4px">${serifTitle("Últimas", 22)}</div>${TX.slice(0, 3).map((x) => `<div style="display:flex;align-items:center;gap:12px;padding:10px 18px;border-top:1px solid ${C.border}">${catIcon(x.cat, 32)}<div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600">${x.t}</div><div style="font-size:11.5px;color:${C.ink3};margin-top:2px">${x.d} · ${x.acc} ${x.cur}</div></div><div style="text-align:right">${num(x.v, 13.5, x.inc ? C.inc : C.ink)}${x.orig ? `<div style="font-size:11px;color:${C.ink3}">${x.orig}</div>` : ""}</div></div>`).join("")}`)}
</div>
${tabbar("Resumo")}`);

const choice = (label, on, color) => `<span style="display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px;border-radius:12px;font-size:13.5px;font-weight:600;${on ? `background:${C.ink};color:#fff` : `background:${C.surface};box-shadow:${SH_SM};color:${C.ink}`}">${color ? `<span style="width:8px;height:8px;border-radius:99px;background:${color}"></span>` : ""}${label}</span>`;
const mobileReview = phone("Mobile · Revisão", `
${statusBar}
<div style="padding:4px 20px 0;display:flex;align-items:center;justify-content:space-between">${ic("x", C.ink2, 22)}<span style="font-size:13px;font-weight:600;color:${C.ink2}">Revolut · agosto</span><span style="font-size:13px;font-weight:600;color:${C.brand}">51 prontas</span></div>
<div style="padding:16px 20px 0">
  <div style="display:flex;gap:4px">${Array.from({ length: 9 }, (_, i) => `<span style="flex:1;height:4px;border-radius:99px;background:${i < 1 ? C.ink : C.sunken}"></span>`).join("")}</div>
  <div style="margin-top:10px">${eyebrow("Revisão · 1 de 9")}</div>
</div>
<div style="position:relative;margin:18px 16px 0;height:520px">
  <div style="position:absolute;left:18px;right:18px;top:22px;bottom:-14px;border-radius:22px;background:${C.surface};box-shadow:${SH};opacity:.6"></div>
  <div style="position:absolute;left:9px;right:9px;top:11px;bottom:-7px;border-radius:22px;background:${C.surface};box-shadow:${SH};opacity:.85"></div>
  <div style="position:absolute;inset:0;border-radius:22px;background:${C.surface};box-shadow:${SH};padding:22px 20px;display:flex;flex-direction:column;gap:16px">
    <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:12.5px;color:${C.ink3}">Sáb, 12 ago</span>${conf(42)}</div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:600;line-height:1.4">BIZUM ENVIADO A J. MARTINEZ</div>
    <div style="font-family:${SERIF};font-size:54px;line-height:1">−€45,00</div>
    <div style="display:flex;gap:8px;align-items:flex-start;padding:11px 12px;border-radius:12px;background:${C.warnSoft};font-size:12.5px;color:${C.ink};line-height:1.45">${ic("alert", C.warn, 15, 2)}<span>Pode ser um pagamento a alguém ou uma transferência entre contas suas.</span></div>
    <div><div style="font-size:12px;font-weight:500;color:${C.ink3};margin-bottom:8px">É o quê?</div><div style="display:flex;flex-wrap:wrap;gap:8px">${choice("Outros gastos", true, CAT["Outros gastos"].c)}${choice("Transferência", false, C.xfer)}${choice("Restaurantes", false, CAT.Restaurantes.c)}${choice("Outra…", false)}</div></div>
    <div><div style="font-size:12px;font-weight:500;color:${C.ink3};margin-bottom:8px">Quem?</div><div style="display:flex;gap:8px">${choice("Thiago", false)}${choice("Ana", false)}${choice("Casa", false)}</div></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:${C.ink2}"><span style="width:16px;height:16px;border-radius:5px;background:${C.brand};display:flex;align-items:center;justify-content:center">${ic("check", "#fff", 11, 3)}</span>Lembrar para “bizum enviado”</label>
  </div>
</div>
<div style="position:absolute;left:16px;right:16px;bottom:30px;display:flex;gap:10px">
  <span style="flex:1;height:52px;border-radius:16px;background:${C.surface};box-shadow:${SH_SM};display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;color:${C.ink2}">Pular</span>
  <span style="flex:2;height:52px;border-radius:16px;background:${C.brand};display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;font-weight:700;color:#fff">${ic("check", "#fff", 18, 2.5)}Confirmar</span>
</div>`);

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box} body{margin:0;background:#FFFFFF;padding:60px;display:flex;flex-direction:column;gap:120px;width:1560px}
.phones{display:flex;gap:80px;padding:20px}
</style></head><body>
${screen("Resumo", "Resumo", dashBody, 1180)}
${screen("Transações", "Transações", txBody, 1080)}
${screen("Revisar importação", "Importar", reviewBody, 1000)}
${screen("Importar", "Importar", importBody, 1000)}
${screen("Categorias e regras", "Categorias e regras", catsBody, 1040)}
${screen("Responsáveis", "Responsáveis", membersBody, 820)}
<div class="phones">${mobileDash}${mobileReview}</div>
${foundations}
</body></html>`;
writeFileSync(new URL("./index.html", import.meta.url), html);
console.log("ok", html.length);
