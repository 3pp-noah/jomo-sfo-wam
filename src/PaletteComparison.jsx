import { useState } from "react";

const SCHEMES = {
  current: {
    name: "Current (Near-Black)",
    desc: "The existing palette. #080810 body, purple-tinted gradients, neon accents on void.",
    bg: { body: "#080810", card: "rgba(255,255,255,0.02)", input: "#0c0c14", titleBar: "linear-gradient(90deg, #1a0a2e 0%, #0a1628 100%)", statusBar: "linear-gradient(90deg, #0a0a0a, #1a0a2e)" },
    text: { primary: "#e0e0e0", secondary: "#888", muted: "#555", heading: "#ccc" },
    border: { card: "rgba(255,255,255,0.06)", accent: "rgba(255,69,0,0.3)" },
    accent: { brand: "#FF4500", gold: "#FFD740", green: "#69F0AE", purple: "#c080ff", cyan: "#00E5FF", red: "#FF5252", blue: "#40C4FF" },
  },
  warmLinen: {
    name: "Warm Linen",
    desc: "Off-white with warm undertones. Like parchment under soft light. Accents become deeper and earthier.",
    bg: { body: "#F5F0EB", card: "#FFFFFF", input: "#EDE8E2", titleBar: "linear-gradient(90deg, #2C1810 0%, #1A2332 100%)", statusBar: "linear-gradient(90deg, #2C1810, #1A2332)" },
    text: { primary: "#2C2420", secondary: "#6B5E55", muted: "#9C8E84", heading: "#3D3530" },
    border: { card: "rgba(44,24,16,0.1)", accent: "rgba(180,60,20,0.35)" },
    accent: { brand: "#C0350A", gold: "#B8860B", green: "#2E8B57", purple: "#6A3D9A", cyan: "#00838F", red: "#C62828", blue: "#1565C0" },
  },
  coolSlate: {
    name: "Cool Slate",
    desc: "Light blue-grey. Clinical but gentle. Accents pop cleanly against the neutral base.",
    bg: { body: "#ECEEF2", card: "#FFFFFF", input: "#E2E5EB", titleBar: "linear-gradient(90deg, #1E293B 0%, #0F172A 100%)", statusBar: "linear-gradient(90deg, #1E293B, #0F172A)" },
    text: { primary: "#1E293B", secondary: "#64748B", muted: "#94A3B8", heading: "#334155" },
    border: { card: "rgba(30,41,59,0.1)", accent: "rgba(220,60,20,0.3)" },
    accent: { brand: "#DC3910", gold: "#D97706", green: "#059669", purple: "#7C3AED", cyan: "#0891B2", red: "#DC2626", blue: "#2563EB" },
  },
  sageCloud: {
    name: "Sage Cloud",
    desc: "Muted green-grey. Organic and restful. The earthy palette reduces visual fatigue for long sessions.",
    bg: { body: "#EDEFEB", card: "#F7F8F5", input: "#E3E6DF", titleBar: "linear-gradient(90deg, #1B2E1B 0%, #162030 100%)", statusBar: "linear-gradient(90deg, #1B2E1B, #162030)" },
    text: { primary: "#263026", secondary: "#5C6B5C", muted: "#8A978A", heading: "#344034" },
    border: { card: "rgba(38,48,38,0.1)", accent: "rgba(160,70,20,0.35)" },
    accent: { brand: "#B84410", gold: "#A67B00", green: "#2D6A4F", purple: "#5B4FA0", cyan: "#00796B", red: "#B71C1C", blue: "#1976D2" },
  },
  pearlDusk: {
    name: "Pearl Dusk",
    desc: "Soft lavender-grey. The purple undertone echoes the existing time-travel palette without the darkness.",
    bg: { body: "#EEEDF3", card: "#F8F7FC", input: "#E4E2EC", titleBar: "linear-gradient(90deg, #2D1B4E 0%, #1A1832 100%)", statusBar: "linear-gradient(90deg, #2D1B4E, #1A1832)" },
    text: { primary: "#2D2440", secondary: "#6B5F80", muted: "#9990AC", heading: "#3A2F50" },
    border: { card: "rgba(45,27,78,0.1)", accent: "rgba(180,50,20,0.3)" },
    accent: { brand: "#C0350A", gold: "#C49000", green: "#2E7D32", purple: "#7B1FA2", cyan: "#00838F", red: "#C62828", blue: "#1565C0" },
  },
  sandstone: {
    name: "Sandstone",
    desc: "Desert-warm neutral. Nods to the Sub-Saharan Alternative Havens context. Strong but not harsh.",
    bg: { body: "#F0ECE4", card: "#FAF8F4", input: "#E6E0D6", titleBar: "linear-gradient(90deg, #3E2C1C 0%, #2A1F14 100%)", statusBar: "linear-gradient(90deg, #3E2C1C, #2A1F14)" },
    text: { primary: "#32281E", secondary: "#7A6B5C", muted: "#A89888", heading: "#453828" },
    border: { card: "rgba(62,44,28,0.1)", accent: "rgba(180,60,10,0.35)" },
    accent: { brand: "#B84410", gold: "#B8860B", green: "#2D6A4F", purple: "#6A3D9A", cyan: "#00695C", red: "#BF360C", blue: "#0D47A1" },
  },
  midnightSoft: {
    name: "Midnight Soft",
    desc: "Still dark, but lifted to charcoal-blue. Keeps the instrument aesthetic but removes the void.",
    bg: { body: "#1E2430", card: "rgba(255,255,255,0.05)", input: "#2A3040", titleBar: "linear-gradient(90deg, #2D1B4E 0%, #1A2840 100%)", statusBar: "linear-gradient(90deg, #1A2030, #2D1B4E)" },
    text: { primary: "#D8DCE4", secondary: "#8892A4", muted: "#5C6478", heading: "#BCC2D0" },
    border: { card: "rgba(255,255,255,0.08)", accent: "rgba(255,69,0,0.3)" },
    accent: { brand: "#FF5722", gold: "#FFC107", green: "#66BB6A", purple: "#B388FF", cyan: "#26C6DA", red: "#EF5350", blue: "#42A5F5" },
  },
};

function MockPanel({ scheme, s }) {
  return (
    <div style={{ background: s.bg.body, borderRadius: 8, overflow: "hidden", border: `1px solid ${s.border.card}`, minHeight: 420 }}>
      {/* Title bar */}
      <div style={{ background: s.bg.titleBar, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${s.border.accent}` }}>
        <div>
          <span style={{ color: s.accent.brand, fontWeight: 700, fontSize: 13, fontFamily: "monospace", letterSpacing: 2 }}>MDQNM</span>
          <span style={{ color: scheme === "current" ? "#666" : "rgba(255,255,255,0.7)", fontSize: 9, marginLeft: 8 }}>JOMO Engine</span>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {["OVR", "OPS", "WAM", "AGT"].map(t => (
            <span key={t} style={{ fontSize: 7, padding: "2px 6px", color: t === "OPS" ? s.accent.brand : (scheme === "current" ? "#666" : "rgba(255,255,255,0.6)"), background: t === "OPS" ? `${s.accent.brand}22` : "transparent", borderRadius: 3, fontFamily: "monospace", fontWeight: 600 }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Time authority */}
      <div style={{ padding: "6px 12px", borderBottom: `1px solid ${s.border.card}`, background: scheme === "current" ? "rgba(192,128,255,0.04)" : (["warmLinen","coolSlate","sageCloud","pearlDusk","sandstone"].includes(scheme) ? `${s.accent.purple}08` : "rgba(192,128,255,0.04)") }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "monospace" }}>
          <div>
            <span style={{ color: s.text.muted }}>TNLDY </span>
            <span style={{ color: s.accent.gold, fontWeight: 700 }}>20583.4721</span>
          </div>
          <div>
            <span style={{ color: s.text.muted }}>Y = </span>
            <span style={{ color: s.accent.purple, fontWeight: 700 }}>29.3147</span>
          </div>
          <div>
            <span style={{ color: s.accent.green }}>628 AGENTS LIVE</span>
          </div>
        </div>
      </div>

      {/* Travel controls */}
      <div style={{ padding: "6px 12px", borderBottom: `1px solid ${s.border.card}`, fontSize: 9, fontFamily: "monospace" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: s.text.muted, fontSize: 8, letterSpacing: 1 }}>⟳ TIME TRAVEL</span>
          <select style={{ background: s.bg.input, border: `1px solid ${s.border.card}`, color: s.text.secondary, fontSize: 8, padding: "2px 4px", fontFamily: "monospace" }}>
            <option>ZIRCON (23)</option>
          </select>
          <select style={{ background: s.bg.input, border: `1px solid ${s.accent.brand}44`, color: s.accent.brand, fontSize: 8, padding: "2px 4px", fontFamily: "monospace" }}>
            <option>ZIRCON-009</option>
          </select>
          <span style={{ color: s.text.muted, fontSize: 8 }}>A=100 · C=17651.8</span>
        </div>
      </div>

      {/* Content area */}
      <div style={{ padding: "8px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {/* Card 1: Agent status */}
        <div style={{ background: s.bg.card, border: `1px solid ${s.border.card}`, borderRadius: 4, padding: 8 }}>
          <div style={{ fontSize: 8, color: s.text.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>ACTIVE AGENT</div>
          <div style={{ color: s.accent.brand, fontWeight: 700, fontSize: 11, fontFamily: "monospace" }}>ZIRCON-009</div>
          <div style={{ color: s.text.secondary, fontSize: 8, marginTop: 2 }}>Domain: ZIRCON · A=100 · C=17651.8</div>
          <div style={{ color: s.accent.purple, fontSize: 8, fontFamily: "monospace" }}>Y = 29.314700 · BB 177/399</div>
        </div>

        {/* Card 2: Edge in view */}
        <div style={{ background: scheme === "current" ? "rgba(255,69,0,0.04)" : `${s.accent.brand}08`, border: `1px solid ${s.accent.brand}20`, borderRadius: 4, padding: 8 }}>
          <div style={{ fontSize: 8, color: s.accent.brand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>EDGE IN VIEW</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: s.accent.green, fontSize: 10, fontWeight: 700, fontFamily: "monospace" }}>BB 29.217</div>
              <div style={{ color: s.text.muted, fontSize: 7 }}>SOURCE</div>
            </div>
            <div style={{ color: s.accent.purple, fontSize: 9 }}>→ 0.311 →</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: s.accent.gold, fontSize: 10, fontWeight: 700, fontFamily: "monospace" }}>BB 29.528</div>
              <div style={{ color: s.text.muted, fontSize: 7 }}>TARGET (21d)</div>
            </div>
          </div>
        </div>

        {/* Card 3: Routing manifest */}
        <div style={{ background: s.bg.card, border: `1px solid ${s.border.card}`, borderRadius: 4, padding: 8 }}>
          <div style={{ fontSize: 8, color: s.text.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>ROUTING MANIFEST</div>
          {[
            { domain: "geopolitical", status: "live", color: s.accent.green },
            { domain: "energy", status: "configured", color: s.accent.gold },
            { domain: "banking", status: "configured", color: s.accent.gold },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 6, fontSize: 8, marginBottom: 2, fontFamily: "monospace" }}>
              <span style={{ color: f.color }}>{f.status === "live" ? "●" : "◆"}</span>
              <span style={{ color: s.text.secondary }}>{f.domain}</span>
              <span style={{ color: s.text.muted, marginLeft: "auto", fontSize: 7, textTransform: "uppercase" }}>{f.status}</span>
            </div>
          ))}
        </div>

        {/* Card 4: Judgment */}
        <div style={{ background: s.bg.card, border: `1px solid ${s.border.card}`, borderRadius: 4, padding: 8 }}>
          <div style={{ fontSize: 8, color: s.text.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>JUDGMENT</div>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {[
              { label: "KEEP", color: s.accent.gold },
              { label: "CONFIRM", color: s.accent.green },
              { label: "REJECT", color: s.accent.red },
              { label: "REFINE", color: s.accent.blue },
              { label: "REVERSE", color: "#FF4081" },
            ].map((j, i) => (
              <span key={i} style={{ fontSize: 7, padding: "2px 6px", background: `${j.color}15`, border: `1px solid ${j.color}33`, color: j.color, fontFamily: "monospace", fontWeight: 700, borderRadius: 2 }}>{j.label}</span>
            ))}
          </div>
        </div>

        {/* Heatmap mock */}
        <div style={{ gridColumn: "1 / -1", background: s.bg.card, border: `1px solid ${s.border.card}`, borderRadius: 4, padding: 8 }}>
          <div style={{ fontSize: 8, color: s.text.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>NAMESPACE HEATMAP</div>
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#F0E68C","#FF7F50","#87CEEB","#98FB98","#FFA07A","#B0C4DE","#DEB887","#FFD700","#00FFFF","#32CD32"].map((c, i) => (
              <div key={i} style={{ width: 24, height: 18, borderRadius: 2, background: scheme === "current" ? `${c}33` : `${c}44`, border: `1px solid ${scheme === "current" ? "rgba(255,255,255,0.05)" : `${c}33`}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: s.text.secondary, fontFamily: "monospace" }}>
                {[93,18,13,3,2,12,27,8,57,1,33,12,8,10,3,2][i]}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ background: s.bg.statusBar, padding: "3px 12px", fontSize: 7, fontFamily: "monospace", color: s.text.muted, display: "flex", justifyContent: "space-between", marginTop: "auto" }}>
        <span>MDQNM v3PP | 628 agents | 56 domains</span>
        <span style={{ color: s.accent.green }}>● JOMO ACTIVE</span>
      </div>
    </div>
  );
}

export default function PaletteComparison() {
  const [selected, setSelected] = useState(["current", "warmLinen"]);

  const toggle = (key) => {
    setSelected(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 3) return [...prev.slice(1), key];
      return [...prev, key];
    });
  };

  return (
    <div style={{ background: "#F5F4F0", minHeight: "100vh", fontFamily: "'Geist', 'SF Pro Display', -apple-system, sans-serif", padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#222", marginBottom: 4 }}>JOMO Color Scheme Analysis</h1>
        <p style={{ fontSize: 12, color: "#666", marginBottom: 16, lineHeight: 1.5 }}>
          Select up to 3 schemes to compare side by side. Each mock shows the same UI elements with the candidate palette applied.
          The title bar and status bar remain dark across all schemes (the instrument identity).
        </p>

        {/* Scheme selector */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {Object.entries(SCHEMES).map(([key, s]) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              style={{
                padding: "6px 14px",
                fontSize: 11,
                fontWeight: selected.includes(key) ? 700 : 400,
                background: selected.includes(key) ? s.bg.body : "#fff",
                color: selected.includes(key) ? s.text.primary : "#666",
                border: selected.includes(key) ? `2px solid ${s.accent.brand}` : "1px solid #ddd",
                borderRadius: 6,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Comparison grid */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(selected.length, 3)}, 1fr)`, gap: 16 }}>
          {selected.map(key => (
            <div key={key}>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>{SCHEMES[key].name}</div>
                <div style={{ fontSize: 10, color: "#888", lineHeight: 1.5 }}>{SCHEMES[key].desc}</div>
              </div>
              <MockPanel scheme={key} s={SCHEMES[key]} />

              {/* Color swatches */}
              <div style={{ marginTop: 8, display: "flex", gap: 3, flexWrap: "wrap" }}>
                {[
                  { label: "Body", color: SCHEMES[key].bg.body },
                  { label: "Card", color: SCHEMES[key].bg.card },
                  { label: "Input", color: SCHEMES[key].bg.input },
                  { label: "Text", color: SCHEMES[key].text.primary },
                  { label: "2nd", color: SCHEMES[key].text.secondary },
                  { label: "Muted", color: SCHEMES[key].text.muted },
                  { label: "Brand", color: SCHEMES[key].accent.brand },
                  { label: "Gold", color: SCHEMES[key].accent.gold },
                  { label: "Green", color: SCHEMES[key].accent.green },
                  { label: "Purple", color: SCHEMES[key].accent.purple },
                ].map((sw, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div style={{ width: 28, height: 18, borderRadius: 3, background: sw.color, border: "1px solid rgba(0,0,0,0.12)" }} />
                    <div style={{ fontSize: 7, color: "#888", marginTop: 1 }}>{sw.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Architecture note */}
        <div style={{ marginTop: 24, padding: 12, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 10, color: "#666", lineHeight: 1.6 }}>
          <strong style={{ color: "#333" }}>Implementation note:</strong> The title bar and status bar remain dark across all light schemes — this preserves the instrument identity. 
          The accent colors (brand orange, gold, green, purple, cyan) are adjusted per scheme to maintain WCAG contrast ratios against the lighter backgrounds. 
          Input fields use a slightly darker shade of the body color. Card surfaces are white or near-white to create depth hierarchy. 
          Once you choose a scheme, I'll apply it as a CSS variable theme layer across the full 2,468-line app.
        </div>
      </div>
    </div>
  );
}
