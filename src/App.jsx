import { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext } from "react";
// ── SFO-WAM Engine (Vite project: import from separate file) ──
import SFOWAMEngine from './sfo_wam_engine';
import AGENTS_FULL_INITIAL from "./agent_registry_verified.json";

// ═══════════════════════════════════════════════════════════════
// MDQNM JOMO AGENT PARALLELIZATION ENGINE
// J-Overall Multiple Objective Implementation
// EXE_TPDP.100D — 32 Cities of the Future / Alternative Havens
// GPBS Steady-State: ATDF | 759 Autonomous Agents
// ═══════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════
// THEME SYSTEM — 7 color schemes, switchable at runtime via Context
// ═══════════════════════════════════════════════════════════════
const THEMES = {
  coolSlate: {
    id: "coolSlate", name: "Cool Slate", isDark: false,
    bg: { body: "#ECEEF2", card: "#FFFFFF", cardAlt: "rgba(30,41,59,0.03)", input: "#E2E5EB", titleBar: "linear-gradient(90deg, #1E293B 0%, #0F172A 100%)", statusBar: "linear-gradient(90deg, #1E293B, #0F172A)", rosetta: "linear-gradient(180deg, #F0F1F5 0%, #E8E9EF 100%)", travelActive: "rgba(100,60,200,0.06)", travelInactive: "rgba(30,41,59,0.03)" },
    text: { primary: "#1E293B", secondary: "#64748B", muted: "#94A3B8", heading: "#334155", bright: "#0F172A", onDark: "rgba(255,255,255,0.8)", onDarkMuted: "rgba(255,255,255,0.5)" },
    border: { card: "rgba(30,41,59,0.1)", subtle: "rgba(30,41,59,0.06)", accent: "rgba(220,60,20,0.3)" },
    accent: { brand: "#DC3910", gold: "#D97706", green: "#059669", purple: "#7C3AED", cyan: "#0891B2", red: "#DC2626", blue: "#2563EB", pink: "#DB2777" },
    scrollThumb: "#CBD5E1",
  },
  warmLinen: {
    id: "warmLinen", name: "Warm Linen", isDark: false,
    bg: { body: "#F5F0EB", card: "#FFFFFF", cardAlt: "rgba(44,24,16,0.03)", input: "#EDE8E2", titleBar: "linear-gradient(90deg, #2C1810 0%, #1A2332 100%)", statusBar: "linear-gradient(90deg, #2C1810, #1A2332)", rosetta: "linear-gradient(180deg, #F7F2ED 0%, #EDE8E2 100%)", travelActive: "rgba(100,60,200,0.06)", travelInactive: "rgba(44,24,16,0.03)" },
    text: { primary: "#2C2420", secondary: "#6B5E55", muted: "#9C8E84", heading: "#3D3530", bright: "#1A1210", onDark: "rgba(255,255,255,0.8)", onDarkMuted: "rgba(255,255,255,0.5)" },
    border: { card: "rgba(44,24,16,0.1)", subtle: "rgba(44,24,16,0.06)", accent: "rgba(180,60,20,0.35)" },
    accent: { brand: "#C0350A", gold: "#B8860B", green: "#2E8B57", purple: "#6A3D9A", cyan: "#00838F", red: "#C62828", blue: "#1565C0", pink: "#AD1457" },
    scrollThumb: "#C4BAB0",
  },
  sageCloud: {
    id: "sageCloud", name: "Sage Cloud", isDark: false,
    bg: { body: "#EDEFEB", card: "#F7F8F5", cardAlt: "rgba(38,48,38,0.03)", input: "#E3E6DF", titleBar: "linear-gradient(90deg, #1B2E1B 0%, #162030 100%)", statusBar: "linear-gradient(90deg, #1B2E1B, #162030)", rosetta: "linear-gradient(180deg, #EFF1ED 0%, #E5E8E1 100%)", travelActive: "rgba(80,140,80,0.06)", travelInactive: "rgba(38,48,38,0.03)" },
    text: { primary: "#263026", secondary: "#5C6B5C", muted: "#8A978A", heading: "#344034", bright: "#162016", onDark: "rgba(255,255,255,0.8)", onDarkMuted: "rgba(255,255,255,0.5)" },
    border: { card: "rgba(38,48,38,0.1)", subtle: "rgba(38,48,38,0.06)", accent: "rgba(160,70,20,0.35)" },
    accent: { brand: "#B84410", gold: "#A67B00", green: "#2D6A4F", purple: "#5B4FA0", cyan: "#00796B", red: "#B71C1C", blue: "#1976D2", pink: "#AD1457" },
    scrollThumb: "#BCC4B8",
  },
  pearlDusk: {
    id: "pearlDusk", name: "Pearl Dusk", isDark: false,
    bg: { body: "#EEEDF3", card: "#F8F7FC", cardAlt: "rgba(45,27,78,0.03)", input: "#E4E2EC", titleBar: "linear-gradient(90deg, #2D1B4E 0%, #1A1832 100%)", statusBar: "linear-gradient(90deg, #2D1B4E, #1A1832)", rosetta: "linear-gradient(180deg, #F0EFF5 0%, #E6E4EE 100%)", travelActive: "rgba(120,60,200,0.06)", travelInactive: "rgba(45,27,78,0.03)" },
    text: { primary: "#2D2440", secondary: "#6B5F80", muted: "#9990AC", heading: "#3A2F50", bright: "#1A1230", onDark: "rgba(255,255,255,0.8)", onDarkMuted: "rgba(255,255,255,0.5)" },
    border: { card: "rgba(45,27,78,0.1)", subtle: "rgba(45,27,78,0.06)", accent: "rgba(180,50,20,0.3)" },
    accent: { brand: "#C0350A", gold: "#C49000", green: "#2E7D32", purple: "#7B1FA2", cyan: "#00838F", red: "#C62828", blue: "#1565C0", pink: "#AD1457" },
    scrollThumb: "#C4C0D0",
  },
  sandstone: {
    id: "sandstone", name: "Sandstone", isDark: false,
    bg: { body: "#F0ECE4", card: "#FAF8F4", cardAlt: "rgba(62,44,28,0.03)", input: "#E6E0D6", titleBar: "linear-gradient(90deg, #3E2C1C 0%, #2A1F14 100%)", statusBar: "linear-gradient(90deg, #3E2C1C, #2A1F14)", rosetta: "linear-gradient(180deg, #F2EEE6 0%, #E8E2D8 100%)", travelActive: "rgba(180,100,40,0.06)", travelInactive: "rgba(62,44,28,0.03)" },
    text: { primary: "#32281E", secondary: "#7A6B5C", muted: "#A89888", heading: "#453828", bright: "#1A1410", onDark: "rgba(255,255,255,0.8)", onDarkMuted: "rgba(255,255,255,0.5)" },
    border: { card: "rgba(62,44,28,0.1)", subtle: "rgba(62,44,28,0.06)", accent: "rgba(180,60,10,0.35)" },
    accent: { brand: "#B84410", gold: "#B8860B", green: "#2D6A4F", purple: "#6A3D9A", cyan: "#00695C", red: "#BF360C", blue: "#0D47A1", pink: "#AD1457" },
    scrollThumb: "#C8BEB0",
  },
  midnightSoft: {
    id: "midnightSoft", name: "Midnight Soft", isDark: true,
    bg: { body: "#1E2430", card: "rgba(255,255,255,0.05)", cardAlt: "rgba(255,255,255,0.03)", input: "#2A3040", titleBar: "linear-gradient(90deg, #2D1B4E 0%, #1A2840 100%)", statusBar: "linear-gradient(90deg, #1A2030, #2D1B4E)", rosetta: "linear-gradient(180deg, #1E2430 0%, #242A38 100%)", travelActive: "rgba(192,128,255,0.06)", travelInactive: "rgba(255,255,255,0.02)" },
    text: { primary: "#D8DCE4", secondary: "#8892A4", muted: "#5C6478", heading: "#BCC2D0", bright: "#EEF0F4", onDark: "rgba(255,255,255,0.8)", onDarkMuted: "rgba(255,255,255,0.5)" },
    border: { card: "rgba(255,255,255,0.08)", subtle: "rgba(255,255,255,0.04)", accent: "rgba(255,69,0,0.3)" },
    accent: { brand: "#FF5722", gold: "#FFC107", green: "#66BB6A", purple: "#B388FF", cyan: "#26C6DA", red: "#EF5350", blue: "#42A5F5", pink: "#FF4081" },
    scrollThumb: "#3A4250",
  },
  original: {
    id: "original", name: "Original Dark", isDark: true,
    bg: { body: "#080810", card: "rgba(255,255,255,0.02)", cardAlt: "rgba(255,255,255,0.01)", input: "#0c0c14", titleBar: "linear-gradient(90deg, #1a0a2e 0%, #0a1628 100%)", statusBar: "linear-gradient(90deg, #0a0a0a, #1a0a2e)", rosetta: "linear-gradient(180deg, #0a0a18 0%, #12061e 100%)", travelActive: "rgba(192,128,255,0.06)", travelInactive: "rgba(255,255,255,0.02)" },
    text: { primary: "#e0e0e0", secondary: "#888", muted: "#555", heading: "#ccc", bright: "#fff", onDark: "rgba(255,255,255,0.8)", onDarkMuted: "rgba(255,255,255,0.5)" },
    border: { card: "rgba(255,255,255,0.06)", subtle: "rgba(255,255,255,0.03)", accent: "rgba(255,69,0,0.3)" },
    accent: { brand: "#FF4500", gold: "#FFD740", green: "#69F0AE", purple: "#c080ff", cyan: "#00E5FF", red: "#FF5252", blue: "#40C4FF", pink: "#FF4081" },
    scrollThumb: "#333",
  },
};

export const ThemeContext = createContext(THEMES.coolSlate);
export function useTheme() { return useContext(ThemeContext); }

// ── TNLDY EPOCH & CONSTANTS ──
const EPOCH = 4703008911.6524158066013043478202; // Calibrated TNLDY epoch constant
const MSD = 86400000;
const YJ = 360; // Julian year coefficient
const YG = 17640 / 48.3; // Gregorian year coefficient ≈ 365.2174
const SFO22_MASTER = 2100.0; // sfo22 master constant ZTP

// ── GPBS STEADY-STATE DEVICES ──
const GPBS_DEVICES = {
  VSSL: { name: "VSSL", desc: "Vessel of Sovereign Supply Lines", color: "#00E5FF" },
  ATDF: { name: "ATDF", desc: "Alternative Trade & Development Finance", color: "#FFD740", active: true },
  MFR: { name: "MFR", desc: "Monetary & Fiscal Reformation", color: "#B388FF" },
  NDST: { name: "NDST", desc: "National Development & Strategic Trust", color: "#69F0AE" },
};

// ── 32 CITIES OF THE FUTURE ──
const CITIES_OF_FUTURE = [
  { id: 1, name: "Nsukka Innovation City", zone: "SE Nigeria", lat: 6.86, lng: 7.39 },
  { id: 2, name: "Sahel Refuge Alpha", zone: "Niger-Nigeria Border", lat: 13.5, lng: 7.5 },
  { id: 3, name: "Lake Chad Renaissance", zone: "Chad Basin", lat: 13.0, lng: 14.0 },
  { id: 4, name: "Kanem-Bornu Heritage City", zone: "NE Nigeria", lat: 11.8, lng: 13.2 },
  { id: 5, name: "Timbuktu Restoration", zone: "Mali", lat: 16.77, lng: -3.0 },
  { id: 6, name: "Agadez Solar Oasis", zone: "Niger", lat: 16.97, lng: 7.99 },
  { id: 7, name: "Ouagadougou Tech Hub", zone: "Burkina Faso", lat: 12.37, lng: -1.52 },
  { id: 8, name: "Bamako Bridge City", zone: "Mali", lat: 12.64, lng: -8.0 },
  { id: 9, name: "Dakar Atlantic Gateway", zone: "Senegal", lat: 14.69, lng: -17.44 },
  { id: 10, name: "Nouakchott Green Coast", zone: "Mauritania", lat: 18.09, lng: -15.98 },
  { id: 11, name: "Khartoum Confluence", zone: "Sudan", lat: 15.59, lng: 32.53 },
  { id: 12, name: "Asmara Highland Haven", zone: "Eritrea", lat: 15.34, lng: 38.93 },
  { id: 13, name: "Djibouti Maritime", zone: "Djibouti", lat: 11.59, lng: 43.15 },
  { id: 14, name: "Mogadishu Rebirth", zone: "Somalia", lat: 2.05, lng: 45.32 },
  { id: 15, name: "Nairobi Silicon Savannah", zone: "Kenya", lat: -1.29, lng: 36.82 },
  { id: 16, name: "Kampala Green Hills", zone: "Uganda", lat: 0.35, lng: 32.58 },
  { id: 17, name: "Kigali Model City", zone: "Rwanda", lat: -1.94, lng: 29.87 },
  { id: 18, name: "Bujumbura Lakeside", zone: "Burundi", lat: -3.38, lng: 29.36 },
  { id: 19, name: "Kinshasa Powerhouse", zone: "DR Congo", lat: -4.32, lng: 15.31 },
  { id: 20, name: "Brazzaville Twin City", zone: "Congo", lat: -4.27, lng: 15.28 },
  { id: 21, name: "Bangui Central Hub", zone: "CAR", lat: 4.36, lng: 18.56 },
  { id: 22, name: "N'Djamena Revival", zone: "Chad", lat: 12.11, lng: 15.04 },
  { id: 23, name: "Libreville Equatorial", zone: "Gabon", lat: 0.39, lng: 9.45 },
  { id: 24, name: "Yaoundé Highland Tech", zone: "Cameroon", lat: 3.87, lng: 11.52 },
  { id: 25, name: "Abuja Federal Model", zone: "Nigeria", lat: 9.06, lng: 7.49 },
  { id: 26, name: "Accra Digital Coast", zone: "Ghana", lat: 5.56, lng: -0.19 },
  { id: 27, name: "Lomé Port City", zone: "Togo", lat: 6.17, lng: 1.23 },
  { id: 28, name: "Cotonou Maritime Hub", zone: "Benin", lat: 6.37, lng: 2.39 },
  { id: 29, name: "Niamey River City", zone: "Niger", lat: 13.51, lng: 2.11 },
  { id: 30, name: "Freetown Atlantic", zone: "Sierra Leone", lat: 8.48, lng: -13.23 },
  { id: 31, name: "Monrovia Resilience", zone: "Liberia", lat: 6.3, lng: -10.8 },
  { id: 32, name: "Conakry Gateway", zone: "Guinea", lat: 9.64, lng: -13.58 },
];


// ═══════════════════════════════════════════════════════════════
// ALIAS LAYER — mineralogical codenames for all SFO identifiers
// ═══════════════════════════════════════════════════════════════

// ── NAMESPACE ALIASES (56 SFO → mineral codenames) ──
const NS_ALIAS = {"sfo00":"AGATE","sfo01":"BASALT","sfo02":"COBALT","sfo03":"DOLOMITE","sfo04":"EPIDOTE","sfo05":"FLUORITE","sfo06":"GARNET","sfo07":"HEMATITE","sfo08":"ILMENITE","sfo09":"JASPER","sfo10":"KYANITE","sfo11":"LAZULITE","sfo12":"MAGNETITE","sfo13":"NEPHRITE","sfo14":"OLIVINE","sfo15":"PYRITE","sfo16":"QUARTZ","sfo17":"RUTILE","sfo18":"SPINEL","sfo19":"TOPAZ","sfo20":"URANINITE","sfo21":"VERMEIL","sfo22":"WOLLAST","sfo23":"XENOTIME","sfo24":"YTTRIUM","sfo25":"ZIRCON","sfo26":"ALBITE","sfo27":"BRONZITE","sfo28":"CALCITE","sfo29":"DIASPORE","sfo30":"ENSTATITE","sfo31":"FELDSPAR","sfo32":"GRAPHITE","sfo33":"HORNBLENDE","sfo34":"IDOCRASE","sfo35":"JADEITE","sfo36":"KUNZITE","sfo37":"LARIMAR","sfo38":"MARCASITE","sfo39":"NATROLITE","sfo40":"OBSIDIAN","sfo41":"PREHNITE","sfo42":"QUARTZITE","sfo43":"RHODONITE","sfo44":"SIDERITE","sfo45":"TITANITE","sfo46":"ULEXITE","sfo47":"VANADINITE","sfo48":"WAVELLITE","sfo49":"XIMENIA","sfo50":"YTTRIALITE","sfo51":"ZEOLITE","sfo52":"ANDALUSITE","sfo53":"BORNITE","sfo55":"CHRYSOBERYL","sfo56":"DUMORTIERITE"};

// ── NAMESPACE REVERSE MAP (mineral → SFO, for secret panel) ──
const NS_REVERSE = {"AGATE":"sfo00","ALBITE":"sfo26","ANDALUSITE":"sfo52","BASALT":"sfo01","BORNITE":"sfo53","BRONZITE":"sfo27","CALCITE":"sfo28","CHRYSOBERYL":"sfo55","COBALT":"sfo02","DIASPORE":"sfo29","DOLOMITE":"sfo03","DUMORTIERITE":"sfo56","ENSTATITE":"sfo30","EPIDOTE":"sfo04","FELDSPAR":"sfo31","FLUORITE":"sfo05","GARNET":"sfo06","GRAPHITE":"sfo32","HEMATITE":"sfo07","HORNBLENDE":"sfo33","IDOCRASE":"sfo34","ILMENITE":"sfo08","JADEITE":"sfo35","JASPER":"sfo09","KUNZITE":"sfo36","KYANITE":"sfo10","LARIMAR":"sfo37","LAZULITE":"sfo11","MAGNETITE":"sfo12","MARCASITE":"sfo38","NATROLITE":"sfo39","NEPHRITE":"sfo13","OBSIDIAN":"sfo40","OLIVINE":"sfo14","PREHNITE":"sfo41","PYRITE":"sfo15","QUARTZ":"sfo16","QUARTZITE":"sfo42","RHODONITE":"sfo43","RUTILE":"sfo17","SIDERITE":"sfo44","SPINEL":"sfo18","TITANITE":"sfo45","TOPAZ":"sfo19","ULEXITE":"sfo46","URANINITE":"sfo20","VANADINITE":"sfo47","VERMEIL":"sfo21","WAVELLITE":"sfo48","WOLLAST":"sfo22","XENOTIME":"sfo23","XIMENIA":"sfo49","YTTRIALITE":"sfo50","YTTRIUM":"sfo24","ZEOLITE":"sfo51","ZIRCON":"sfo25"};

// ── AGENT ALIASES (628 agents → <MINERAL>-NNN codenames) ──
const AGENT_ALIAS = {
  "10p8":"AGATE-001","11p1":"AGATE-002","11p5":"AGATE-003","11p8":"AGATE-004","12p4":"AGATE-005","12p6":"AGATE-006","12p7":"AGATE-007","12p9":"AGATE-008","13p3":"AGATE-009","13p6":"AGATE-010",
  "13p8":"AGATE-011","13p9":"AGATE-012","14p5":"AGATE-013","14p9":"AGATE-014","15p1":"AGATE-015","16p9":"AGATE-016","18p5":"AGATE-017","18p6":"AGATE-018","18p7":"AGATE-019","19p3":"AGATE-020",
  "19p4":"AGATE-021","19p5":"AGATE-022","19p7":"AGATE-023","20p5":"AGATE-024","23p2":"AGATE-025","23p4":"AGATE-026","23p5":"AGATE-027","23p7":"AGATE-028","24p3":"AGATE-029","24p4":"AGATE-030",
  "24p9":"AGATE-031","25p2":"AGATE-032","25p5":"AGATE-033","25p7":"AGATE-034","25p9":"AGATE-035","26p8":"AGATE-036","27p0":"AGATE-037","27p3":"AGATE-038","27p4":"AGATE-039","27p7":"AGATE-040",
  "28p7":"AGATE-041","28p8":"AGATE-042","29p2":"AGATE-043","29p5":"AGATE-044","30p5":"AGATE-045","30p6":"AGATE-046","32p6":"AGATE-047","33p1":"AGATE-048","35p5":"AGATE-049","36p7":"AGATE-050",
  "38p1":"AGATE-051","38p3":"AGATE-052","38p5":"AGATE-053","39p1":"AGATE-054","39p8":"AGATE-055","3p65":"AGATE-056","40p1":"AGATE-057","46p8":"AGATE-058","67p6":"AGATE-059","85p3":"AGATE-060",
  "87p8":"AGATE-061","a-holy-firstborn-from-the-matrix-reckoning-from-abraham-yg":"PREHNITE-001","a-holy-firstborn-from-the-matrix-reckoning-from-jacob-yg":"PREHNITE-002","a-rapture-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-001","a-rapture-occurs-circa-here100d":"RHODONITE-002","a-simple-count-of-years-of-the-creature-born-of-the-dnps-tacc-unto-he-begins-to-be-thirty-as-was-supposed-yg":"MAGNETITE-001","a-time-of-trouble-the-tribulation-of-those-days-thou-art-my-battleaxe-enter-yj":"ENSTATITE-001","a-time-of-trouble-the-tribulation-of-those-days-thou-art-my-battleaxe-leave-yj":"ENSTATITE-002","a-wind-of-doctrine-an-engaging-proposal-an-intriguing-prospect100d":"OBSIDIAN-001","abaddon-apollyon100d":"ALBITE-001",
  "abaddon-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ALBITE-002","acc-5tw-tidb-tac-blackwhole-ztp11940-dnps1000d":"HORNBLENDE-001","acc-5tw-tidb-tac-blackwhole-ztp12000-dnps1000d":"HORNBLENDE-002","acc-5tw-tidb-tac-blackwhole-ztp12060-dnps1000d":"HORNBLENDE-003","acc-document-begin-cleanse-after-armageddon-40yg-view-nene-maryann-ijioma-ztp11850-yg":"HORNBLENDE-004","after-gogs-deadly-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"KYANITE-001","after-gogs-deadly-wound-is-healed-he-is-completely-empowered-and-the-ten-horns-hate-mystery-babylon100d":"KYANITE-002","again-born-ie-born-of-the-spirit-circumspection-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-001","again-born-ie-born-of-the-spirit-is-the-end-ie-purpose-of-all-things-circumspection100d":"ILMENITE-002","again-exclamated-the-great-school700ddiv6pt9":"KYANITE-003",
  "aimee-mungovan-recuperation-airborne-heartbreak-virus-vaccine-conception-nne-berna-rip-my-own-nucleus-rebels-access-girl-n14k-test-chidera-etal-desolate-chi-raptures-over-gsm-it-is-done-the-trial-expanded-streamline-at-y-equals37pt928":"TITANITE-001","alien-corridor-creation-m1908-gogid-end2-seventh-king-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"HORNBLENDE-005","alien-corridor-creation-m1960-gogid-end1-seventh-king-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"HORNBLENDE-006","alien-corridor-creation100d-ztp12200":"HORNBLENDE-007","alien-corridor-creation100d-ztp12252":"HORNBLENDE-008","and-after-the-league-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-003","and-after-the-league-made-with-him-he-shall-work-deceitfully100d":"ILMENITE-004","and-become-strong-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-005","and-become-strong-with-a-small-people100d":"ILMENITE-006","and-his-army-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-007",
  "and-his-army-shall-overflow100d":"ILMENITE-008","and-his-heart-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-009","and-his-heart-shall-be-against-the-holy-covenant-and-he-shall-do-exploits100d":"ILMENITE-010","and-many-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-011","and-many-shall-fall-down-slain100d":"ILMENITE-012","and-shall-forecast-his-devices-against-the-strongholds-even-for-a-time-finish100d":"ILMENITE-013","and-shall-forecast-his-devices-against-the-strongholds-even-for-a-time-start100d":"ILMENITE-014","and-shall-forecast1-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-015","and-shall-forecast2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-016","and-shall-take-away-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-017",
  "and-shall-take-away-the-daily-sacrifice100d":"ILMENITE-018","and-they-shall-place-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-019","and-they-shall-place-the-abomination-that-makes-desolate100d":"ILMENITE-020","and-they-shall-pollute-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-021","and-they-shall-pollute-the-sanctuary-of-strength100d":"ILMENITE-022","another-mighty-angel-clothed-with-a-cloud-and-a-rainbow-upon-his-head-and-his-face-as-it-were-the-sun-his-feet-as-pillars-of-fire-end-of-day49-of-making-wedding100d":"RHODONITE-003","another-mighty-angel-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-004","at-the-end-of-twenty-years-7200days-100d":"GRAPHITE-001","at-the-end-of-twenty-years-7200days-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"GRAPHITE-002","babylon-is-fallen-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"KYANITE-004",
  "babylon-is-fallen-is-fallen-start-of-2300days-unto-the-cleansing-of-the-sanctuary100d":"KYANITE-005","babylon-the-great-emergence-and-rise-and-fall-ztsuhiacuudztp1-stwo82pt80-w":"DIASPORE-001","battle-for-the-new-nigeria-at-extremis100d":"NATROLITE-001","begin-ca-cross-trained-engineer-she-that-is-of-me-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-sunclothed-woman-sixth-curtain-doubled-up-at-the-end-of-the-fifth-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7":"GARNET-001","begin-ca-dnps-cleansing-fulfillment-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-at-uttermost-end-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7":"GARNET-002","begin-ca-dnps-similitude-save-ueo-at-all-cost-from-the-ten-horns-etc-armageddon-death-march-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-at-forefront-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7":"GARNET-003","begin-ca-nonye-igboanusi-nwokedi-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-heloise-d-argenteuil-du-paraclet-sixth-curtain-doubled-up-at-the-beginning-of-the-seventh-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7":"GARNET-004","begin-inordinate-first-love-deliverance-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-hsotp-entry-to-the-eleven-curtains-of-the-temple1000ddiv7":"GARNET-005","begin-it-is-done-acc-document-reception-part1-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-in-the-midst-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7":"GARNET-006","begin-it-is-done-acc-document-reception-part2-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-in-the-midst-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7":"GARNET-007",
  "begin-traditional-marriage-sdq-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-entry-to-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7":"GARNET-008","birth-of-the-fig-tree-ca-minustwoonesixzero-yj":"MARCASITE-001","birth-of-the-fig-tree-ca-oneoneonesixzero-yj":"MARCASITE-002","birth-of-the-fig-tree-eighttwoeightzero-yj":"MARCASITE-003","birth-of-the-fig-tree-eighttwosixfive-yj":"MARCASITE-004","birth-of-the-fig-tree-minuseighteightnine-yj-clock":"MARCASITE-005","birth-of-the-fig-tree-minusoneeightzerozero-yj":"MARCASITE-006","birth-of-the-fig-tree-minusoneonetwozero-yj":"MARCASITE-007","birth-of-the-fig-tree-minusonesixzerozero-yj":"MARCASITE-008","birth-of-the-fig-tree-minusonezerothreenine-yj":"MARCASITE-009",
  "birth-of-the-fig-tree-minustwoonesixzero-yj":"MARCASITE-010","birth-of-the-fig-tree-oneoneonesixzero-yj":"MARCASITE-011","birth-of-the-fig-tree-zero-yj":"MARCASITE-012","born-of-the-flesh-enter100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-0pt00-on-revott":"CHRYSOBERYL-001","born-of-the-flesh-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-005","born-of-the-flesh-is-the-revelation-of-the-trial-revott-absolute-zero100d":"RHODONITE-006","born-of-the-flesh-leave100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-6pt00-on-revott":"CHRYSOBERYL-002","but-tidings-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-023","but-tidings-out-of-the-east-and-out-of-the-north-shall-trouble-him100d":"ILMENITE-024","ca-peak-m1710-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-025",
  "ca-peak-m1710-of-the-raiser-of-taxes-in-the-glory-of-the-kingdom100d":"ILMENITE-026","ca-time-of-the-enoch-type-rapture7d":"BASALT-001","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-sealenter-yg":"LAZULITE-001","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-sealenter100d":"LAZULITE-002","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-sealenter360d":"LAZULITE-003","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-sealleave-yg":"LAZULITE-004","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-sealleave100d":"LAZULITE-005","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-sealleave360d":"LAZULITE-006","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-setting0-100d":"LAZULITE-007","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-trumpet-yg":"LAZULITE-008",
  "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-trumpet100d":"LAZULITE-009","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-trumpet360d":"LAZULITE-010","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-yg":"LAZULITE-011","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss360d":"LAZULITE-012","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-hemboss-sealenter100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-45pt718-on-revott":"CHRYSOBERYL-003","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-hemboss-sealleave100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-49pt318-on-revott":"CHRYSOBERYL-004","cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-hemboss-trumpet100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-47pt528-on-revott":"CHRYSOBERYL-005","cfh-rapturing-through-family-friends-acquaintances-etc-ffae-enter100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-23pt71-on-revott":"CHRYSOBERYL-006","cfh-rapturing-through-family-friends-acquaintances-etc-ffae-leaveone100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-25pt20-on-revott":"CHRYSOBERYL-007","cfh-rapturing-through-family-friends-acquaintances-etc-ffae100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-24pt897-on-revott":"CHRYSOBERYL-008",
  "christ-jesus-the-lord-the-everlasting-father-is-the-king-of-the-holy-family-cjtl-tef-itk-othf-jesus36000d":"SPINEL-001","christ-jesus-the-lord-the-everlasting-father-is-the-king-of-the-holy-family-cjtl-tef-itk-othf-paul36000d":"SPINEL-002","cleansing-ca-jesus-christ-tnldy18286-dob-all-the-land-with-all-judgment2800ddiv23":"LARIMAR-001","cleansing-ca-virgin-mary-tnldy18242-dob-all-the-land-with-all-judgment2800ddiv23":"LARIMAR-002","commence-save-ueo-at-all-cost-ca-70-week-death-march-m2420-gogid-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"HORNBLENDE-009","commence-save-ueo-at-all-cost-ca-70-week-death-march-ztp11740":"HORNBLENDE-010","comprehensive-chronicles-of-the-holy-scriptures-having-solomons-temple-complete-at19pt51-enter36000d":"SPINEL-003","comprehensive-chronicles-of-the-holy-scriptures-having-solomons-temple-complete-at19pt51-patriarch-view36000d":"SPINEL-004","core-completion-matrix1-wherein-the-creature-of-the-alien-corridor-cleanses-his-way-and-knowledge-is-increased-whilst-iron-reacts-at-singular-heat-with-miry-clay240d":"XENOTIME-001","core-completion-matrix2-wherein-the-creature-of-the-alien-corridor-cleanses-his-way-and-knowledge-is-increased-whilst-iron-reacts-at-singular-heat-with-miry-clay240d":"XENOTIME-002",
  "countdown-from-the-twenty-fourth-yj-unto-the-vision360d":"HEMATITE-001","countdown-in-days-to-the-end-at-ztp-of-the-russian-government-of-the-overt-seventh-king-1d":"FLUORITE-001","countdown0-in-days-to-the-end-at-ztp-of-the-usa-government-of-babylon-the-great-1d":"FLUORITE-002","countdown1-in-days-to-the-end-at-ztp-of-the-usa-government-of-babylon-the-great-1d":"FLUORITE-003","countdown100d-as-per-ztp-to-armageddon":"HEMATITE-002","countdown100d-as-per-ztp-to-the-global-timeshortening-line":"HEMATITE-003","countdown100d-as-per-ztp-to-the-last-earth-reaping-before-the-great-tribulation":"HEMATITE-004","countdown100d-as-per-ztp-to-the-sealing-of-the-elect-of-the-twelve-tribes-of-israel":"HEMATITE-005","countdown100d-as-per-ztp-to-the-travail-of-the-sun-and-moon-clothed-woman":"HEMATITE-006","countdown100d-as-per-ztp-to-the-vision":"HEMATITE-007",
  "countdown100d-as-per-ztp-to-the-wrath":"HEMATITE-008","countdown2-in-days-to-the-end-at-ztp-of-the-usa-government-of-babylon-the-great-1d":"FLUORITE-004","countdown3-in-days-to-the-end-at-ztp-of-the-usa-government-of-babylon-the-great-1d":"FLUORITE-005","counting-in-weeks-unto-the-physical-revelation-of-my-wife-the-wife-the-chosen7d":"KYANITE-006","cross-trained-to-otmotn-ztp1-at-tnldy9864-enter100d":"COBALT-001","cross-trained-to-otmotn-ztp2-at-tnldy9894-leave100d":"COBALT-002","dark-night1-m2160-gogid-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"HORNBLENDE-011","dark-night3-m2100-gogid-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"HORNBLENDE-012","dark-nignt-of-the-prophets-soul-yg-ztp12000":"HORNBLENDE-013","dark-nignt-of-the-prophets-soul-yj-ztp12000":"HORNBLENDE-014",
  "dark-nignt-of-the-prophets-soul-yj-ztp12060":"HORNBLENDE-015","dark-nignt-of-the-prophets-soul100d-ztp12000":"HORNBLENDE-016","dark-nignt-of-the-prophets-soul100d-ztp12060":"HORNBLENDE-017","deliverance-and-redemption-of-the-man-Adam-planted-at-ztp-in-the-garden-eastward-in-eden36000d":"SPINEL-005","deliverance0-ztp16571pt8-went-forth-conquering-and-to-conquer-yj":"ENSTATITE-003","deliverance1-ztp16680-iron-yj":"ENSTATITE-004","deliverance2-ztp16709-birth-of-jesus-christ-yj":"ENSTATITE-005","deliverance4-ztp16719-at-calvary-the-world-is-delivered-of-a-manchild-destined-to-rule-all-nations-with-a-rod-of-iron-yj":"ENSTATITE-006","deposit-check-execution-span-the-seven-day-theory-fully-developed-rise-streamline-ie-at-y-equals48pt00":"BORNITE-001","depositcheck-defense-of-the-algorithm-universe50ddiv18-linearized-from-m147pt60-to-p241pt20-full-development-of-birth50ddiv18":"TITANITE-002",
  "depositcheck-execution-span-the-trial-fully-developed-rise-streamline-ie-at-y-equals26pt93":"TITANITE-003","depositcheck-outflow-of-the-algorithm-of-the-proposal-universe50ddiv18-linearized-from-m147pt60-to-p241pt20-full-development-of-birth50ddiv18":"TITANITE-004","dnps-begin-cleanse1-40yj-view-ztp12052-what-overflowing-army-is-overcoming-the-inordinacy-in-me-and-establishing-the-new-creature-in-the-end-times-yj":"HORNBLENDE-018","dnps-begin-cleanse2-40yj-view-ztp12060-what-overflowing-army-is-overcoming-the-inordinacy-in-me-and-establishing-the-new-creature-in-the-end-times-yj":"HORNBLENDE-019","dnps-end-cleanse1-40yg-view-ztp12052-what-overflowing-army-is-overcoming-the-inordinacy-in-me-and-establishing-the-new-creature-in-the-end-times-yg":"HORNBLENDE-020","dnps-end-cleanse2-40yg-view-ztp12060-what-overflowing-army-is-overcoming-the-inordinacy-in-me-and-establishing-the-new-creature-in-the-end-times-yg":"HORNBLENDE-021","dnps-the-seven-and-thirteen-year-conversion12000ztp7500ddiv7":"YTTRIUM-001","dnps-the-seven-and-thirteen-year-conversion12060ztp7500ddiv7":"YTTRIUM-002","doctoral-one-dimensional-slice":"BASALT-002","doctoral-quality-fully-developed":"BASALT-003",
  "ebe-city-complex-m1908-gogid-end2-seventh-king-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"HORNBLENDE-022","ebe-city-complex-m1960-gogid-end1-seventh-king-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"HORNBLENDE-023","ebe-city-complex100d-ztp12200":"HORNBLENDE-024","ebe-city-complex100d-ztp12252":"HORNBLENDE-025","end-ca-cross-trained-engineer-she-that-is-of-me-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-sunclothed-woman-sixth-curtain-doubled-up-at-the-end-of-the-fifth-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9":"GARNET-009","end-ca-dnps-cleansing-fulfillment-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-at-uttermost-end-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9":"GARNET-010","end-ca-dnps-similitude-save-ueo-at-all-cost-from-the-ten-horns-etc-armageddon-death-march-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-at-forefront-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9":"GARNET-011","end-ca-nonye-igboanusi-nwokedi-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-heloise-d-argenteuil-du-paraclet-sixth-curtain-doubled-up-at-the-beginning-of-the-seventh-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9":"GARNET-012","end-inordinate-first-love-deliverance-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-hsotp-entry-to-the-eleven-curtains-of-the-temple1000ddiv6pt9":"GARNET-013","end-it-is-done-acc-document-reception-part1-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-in-the-midst-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9":"GARNET-014",
  "end-it-is-done-acc-document-reception-part2-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-in-the-midst-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9":"GARNET-015","end-of-day479-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"WAVELLITE-001","end-of-day479-of-making-wedding-and-his-wife-has-made-herself-ready-end100d":"WAVELLITE-002","end-of-day483-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"WAVELLITE-003","end-of-day483-marriage-supper-of-the-lamb-begin-fine-linen-clean-and-white-ie-the-righteousness-of-the-saints-was-granted-to-her100d":"WAVELLITE-004","end-of-day490-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"WAVELLITE-005","end-of-day490-marriage-supper-of-the-lamb-end100d":"WAVELLITE-006","end-of-five-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ALBITE-003","end-of-five-months-of-abaddon-apollyon-and-the-host-of-the-bottomless-pit100d":"ALBITE-004","end-of-seven-year-cleansing-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-001",
  "end-of-the-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-002","end-of-the-trumpet-judgments-then-shall-the-sanctuary-be-cleansed-seven-months-onset100d":"YTTRIALITE-003","end-traditional-marriage-sdq-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-entry-to-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9":"GARNET-016","ephesians221-building-yg":"DOLOMITE-001","ephesians613-fulfillment-withstand-in-the-evil-day-and-having-done-all-to-stand-means-the-lords-money-in-context-of-the-shula-manifests-even-thru-the-mammon-line-begin-cultivation100d":"KYANITE-007","ephesians613-fulfillment-withstand-in-the-evil-day-and-having-done-all-to-stand-means-the-lords-money-in-context-of-the-shula-manifests-even-thru-the-mammon-line-begin-harvest100d":"KYANITE-008","ephesians613-fulfillment-withstand-in-the-evil-day-and-having-done-all-to-stand-means-the-lords-money-in-context-of-the-shula-manifests-even-thru-the-mammon-line-end-harvest100d":"KYANITE-009","execution-of-the-total-project-development-process-yj":"ALBITE-005","false-prophet-another-beast-coming-up-out-of-the-earth-100d":"KYANITE-010","false-prophet-causeth-all-to-receive-a-mark-in-their-right-hand-or-in-their-foreheads-100d":"KYANITE-011",
  "false-prophet-had-power-to-give-life-unto-the-image-of-the-beast-100d":"KYANITE-012","false-prophet-that-they-should-make-an-image-to-the-beast-100d":"KYANITE-013","false-prophet0-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"KYANITE-014","false-prophet1-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"KYANITE-015","false-prophet2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"KYANITE-016","false-prophet3-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"KYANITE-017","feasts-of-the-lord-in-the-great-jubilee-year1965to2034andbeyond-in-standard-form700d":"ENSTATITE-007","feasts-of-the-lord-in-the-great-jubilee-year1965to2034andbeyond700d-hsotp-enter":"ENSTATITE-008","feasts-of-the-lord-in-the-great-jubilee-year1965to2034andbeyond700d-hsotp-leave":"ENSTATITE-009","fifth-seal-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-007",
  "fifth-seal-under-the-altar-the-souls-of-those-slain-for-the-word-of-god100d":"RHODONITE-008","fifth-trumpet-a-star-falls-from-heaven-to-earth-and-opens-bottomless-pit-with-key100d":"ALBITE-006","fifth-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ALBITE-007","fifth-vial-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-004","fifth-vial-on-seat-of-beast-his-kingdom-is-full-of-darkness100d":"YTTRIALITE-005","fifty-bank-documents-end-armageddon-40yg-view-nene-maryann-ijioma-ztp11820-yg":"HORNBLENDE-026","first-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ALBITE-008","first-trumpet-hail-fire-mingled-with-blood-cast-upon-earth100d":"ALBITE-009","for-he-shall-come-up-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-027","for-he-shall-come-up100d":"ILMENITE-028",
  "fortynine-times-onehundred-years-determined-in-patriarchview100yj":"LARIMAR-003","foundation1-1080days-100d":"GRAPHITE-003","foundation1-1080days-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"GRAPHITE-004","foundation2-1440days-100d":"GRAPHITE-005","foundation2-1440days-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"GRAPHITE-006","fourth-seal-a-pale-horse-and-rider-death-and-hell-followed-with-him100d":"RHODONITE-009","fourth-seal-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-010","fourth-trumpet-a-third-part-of-the-sun-moon-and-stars-are-smitten100d":"ALBITE-010","fourth-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ALBITE-011","fourth-vial-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-006",
  "fourth-vial-upon-the-sun-to-scorch-humans-with-fire100d":"YTTRIALITE-007","from-the-expulsion-of-rev-henry-townsend-etc-first-missionary-to-abeokuta-ca1867-unto-justification-is-the-pathway-to-the-new-nation-for-those-burdened-with-this-nigeria-isaiah18-yg":"ZIRCON-001","from-the-expulsion-of-rev-henry-townsend-etc-first-missionary-to-abeokuta-ca1867-unto-justification-is-the-pathway-to-the-new-nation-for-those-burdened-with-this-nigeria-isaiah18-yj":"ZIRCON-002","fully-developed-subset-of-the-abstract-of-projects-at-ztps17640-proper-metric":"BRONZITE-001","general-and-state-examination-of-common-phenomena-effluent-from-the-shulammite-singularity-culminating-in-the-gogid100d-feast-of-tabernacles100d":"ALBITE-012","ginika-umeano-the-depositcheck0-witness-questionmark-the-marriage-supper-streamline-at-y-equals9pt99":"XIMENIA-001","gods-great-army-microscale-lightcone-of-the-last-end-of-babylon-the-great":"AGATE-062","gog-ascending-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"KYANITE-018","gog-ascending-to-power-on-the-dragons-throne-as-a-cloud-to-cover-the-land100d":"KYANITE-019","gog-is-completely-empowered-and-the-ten-horns-hate-mystery-babylon-begin100d":"RHODONITE-011",
  "great-white-throne-unto-the-judgement-unto-the-rest-the-joy-of-our-lord":"GRAPHITE-007","having-subdued-three-kings-covenantprinceinc-requirement-to-rule-ie-mystery-babylon-sits-on-gog100d":"RHODONITE-012","having-subdued-three-kings-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-013","he-shall-confirm-the-covenant-with-many-for-one-week-finish100d":"ILMENITE-029","he-shall-confirm-the-covenant-with-many-for-one-week-midst100d":"ILMENITE-030","he-shall-confirm2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-031","he-shall-confirm3-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-032","he-shall-plant-the-tabernacles-of-his-palace-between-the-seas-in-the-glorious-holy-mountain-finish100d":"ILMENITE-033","he-shall-plant-the-tabernacles-of-his-palace-between-the-seas-in-the-glorious-holy-mountain-start100d":"ILMENITE-034","he-shall-plant1-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-035",
  "he-shall-plant2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-036","he-shall-return-and-have-intelligence-with-them-that-forsake-the-holy-covenant100d":"ILMENITE-037","house-of-white-gold-yg":"QUARTZITE-001","house-of-white-gold-yj":"QUARTZITE-002","house-of-white-gold100d":"QUARTZITE-003","if-the-universe-is-the-answer-what-is-the-question-is-answered-by-the-god-particle-unto-onset1-of-dispensation-one100d":"RUTILE-001","if-the-universe-is-the-answer-what-is-the-question-is-answered-by-the-god-particle-unto-onset2star-of-dispensation-one100d":"RUTILE-002","if-the-universe-is-the-answer-what-is-the-question-is-answered-by-the-god-particle-unto-onset3-of-dispensation-one100d":"RUTILE-003","if-the-universe-is-the-answer-what-is-the-question-is-answered-by-the-god-particle-unto-onset4star-of-dispensation-one100d":"RUTILE-004","if-the-universe1-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RUTILE-005",
  "if-the-universe2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RUTILE-006","if-the-universe3-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RUTILE-007","if-the-universe4-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RUTILE-008","imputation-of-sin-via-the-law-given-by-moses-against-the-transgression-of-those-angels-followed-by-the-grace-and-truth-of-jesus-christ-unto-the-seventh-angel-trumpet-sound-daysi-synchronization-100yg":"YTTRIUM-003","in-his-estate-there-shall-rise-a-vile-person-to-whom-they-shall-not-give-the-honour-of-the-kingdom100d":"ILMENITE-038","in-remembrance-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-008","in-remembrance-great-babylon-is-given-cup-of-wine-of-fierceness-of-gods-wrath100d":"YTTRIALITE-009","judgment1-pleading-against-the-host-of-the-kingdom-of-darkness-enter-yj":"ENSTATITE-010","judgment1-pleading-against-the-host-of-the-kingdom-of-darkness-leave-yj":"ENSTATITE-011","judgment1-pleading-against-the-host-of-the-kingdom-of-darkness-preamble-yj":"ENSTATITE-012",
  "judgment1-shall-begin-at-the-house-of-god-100d":"MAGNETITE-002","judgment2-shall-begin-at-the-house-of-god-100d":"MAGNETITE-003","judgment2-unto-hamonah-and-the-valley-of-hamongog-enter-yj":"ENSTATITE-013","judgment2-unto-hamonah-and-the-valley-of-hamongog-leave-yj":"ENSTATITE-014","judgment3-even-unto-three-and-twenty-years-circumspection-ztp-at-22692tnldy-yj":"ENSTATITE-015","judgment3-even-unto-three-and-twenty-years-gogid-ztp-at-22440tnldy-yj":"ENSTATITE-016","judgments-of-which-we-have-not-heard10000d":"ENSTATITE-017","judgments-of-which-we-have-not-heard7000d-atyequalsminus18":"ENSTATITE-018","judgments-of-which-we-have-not-heard7000d-atyequalszero":"ENSTATITE-019","kings-leaving3500d":"KUNZITE-001",
  "kristallnacht-to-begincleanseafterarmageddon-31028one-month-pattern-daysi-28000ddiv23":"YTTRIUM-004","last-end-of-mystery-babylon-the-great-with-microscale-precision":"AGATE-063","m112":"AGATE-064","m129":"AGATE-065","m13p":"AGATE-066","m18p":"AGATE-067","m19p":"AGATE-068","m1p9":"AGATE-069","m21p":"AGATE-070","m3p3":"AGATE-071",
  "m3p4":"AGATE-072","m3p6":"AGATE-073","m6p3":"AGATE-074","m6p5":"AGATE-075","m6p6":"AGATE-076","m8p1":"AGATE-077","m8p8":"AGATE-078","make-to-yourselves-friends-of-the-mammon-of-unrighteousness-that-when-ye-fail-they-may-receive-you-into-everlasting-habitations-ztp-at-wild-sweet-potato-forage-with-chimdi-and-honest-inverter-negotiation-with-chira100d":"CALCITE-001","making-wedding-gentile-using-also-passion-and-desire-proper-metric":"ULEXITE-001","making-wedding-jew-using-also-passion-and-desire-proper-metric":"ULEXITE-002",
  "manchild-born-christmas-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-014","manchild-born-christmas-sun-and-moon-clothed-woman-flees-great-wrath-of-red-dragon-as-devil-comes-to-earth100d":"RHODONITE-015","manchild-born-easter-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-016","manchild-born-easter-sun-and-moon-clothed-woman-flees-great-wrath-of-red-dragon-as-devil-comes-to-earth100d":"RHODONITE-017","manchild-born-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-018","manchild-born-sun-and-moon-clothed-woman-flees-great-wrath-of-red-dragon-as-devil-comes-to-earth100d":"RHODONITE-019","manifestation-of-the-mystery-the-zero-banker-seven-d":"BRONZITE-002","marriage-wedding-miracle-making-wedding-gentile-streamline-at-y-equals0pt00":"VANADINITE-001","miracle-normal-life-sevenhunddiv6pt9":"KYANITE-020","miracle2-eigen-metric":"SIDERITE-001",
  "my-own-house-4680days-100d":"GRAPHITE-008","my-own-house-4680days-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"GRAPHITE-009","mystery-babylon-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"KYANITE-021","mystery-babylon-is-revealed-to-be-the-vampire-system-that-propagates-itself-by-drinking-the-saints-blood-while-gog-becomes-the-lycan-of-the-abyss-ie-an-end-of-pure-destruction-heading-to-perdition-which-she-sits-on-ie-controls-a-lethal-unsustainable-mix-ergo-the-10horns100d":"KYANITE-022","mystery-of-the-great-spouse-the-global-proper-of-tnl3d-universe-emanating-at-tnldy0":"ANDALUSITE-001","napoleon-entering3500d":"KUNZITE-002","neutral-organization-for-alternative-havens-alternative-haven-initiative-r12-y0":"JADEITE-001","neutral-organization-for-alternative-havens-alternative-haven-initiative-r82pt80-y0":"JADEITE-002","neutral-organization-for-alternative-havens-alternative-haven-initiative-r82pt80-y70":"JADEITE-003","neutral-organization-for-alternative-havens-alternative-haven-initiative-rminus21pt60-yminus21pt60":"JADEITE-004",
  "observe-i-am-getting-married-to-the-new-nigeria25ddiv9":"COBALT-003","official-development-of-the-relationship-between-the-girl-of-new-york-and-i-questionmark-the-marriage-supper-streamline-at-y-equals21pt60":"XIMENIA-002","on-the-money1-pleading-against-the-kingdom-of-darkness-yj":"ENSTATITE-020","on-the-money2-pleading-against-the-kingdom-of-darkness-yj":"ENSTATITE-021","one-of-gogs-heads-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"KYANITE-023","one-of-gogs-heads-is-wounded-unto-death100d":"KYANITE-024","one-of-the-seals-a-white-horse-and-its-rider-going-forth-conquering100d":"RHODONITE-020","one-of-the-seals-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-021","overcoming-the-managers-of-the-night-ztp1-at-tnldy9904-optimum700ddiv6pt9":"COBALT-004","overcoming-the-managers-of-the-night-ztp2-at-tnldy9934-optimum700ddiv6pt9":"COBALT-005",
  "p2p4":"AGATE-079","p2p5":"AGATE-080","p2p6":"AGATE-081","p3p6":"AGATE-082","p4p4":"AGATE-083","p4p9":"AGATE-084","p5p2":"AGATE-085","p5p4":"AGATE-086","p6p1":"AGATE-087","p6p4":"AGATE-088",
  "p6p6":"AGATE-089","p7p2":"AGATE-090","p8p1":"AGATE-091","p9p0":"AGATE-092","part1-embryo-genesis-seedling-plant-photosynthesis-egspp-perspective-of-growth-of-christ-in-me-documenting-my-disconnection-from-these-streets-forever-the-count-of-which-is-effective-before-25032pt8tnldy-360d":"OLIVINE-001","part2-embryo-genesis-seedling-plant-photosynthesis-egspp-perspective-of-growth-of-christ-in-me-documenting-my-disconnection-from-these-streets-forever-the-count-of-which-is-effective-after-25032pt8tnldy-240d":"OLIVINE-002","post-doctoral-quality-research-seven-d":"BASALT-004","project-hybridization-development-parametric-nkechichiomaosoka40yj-taop1-internals1000ddiv7":"COBALT-006","project-hybridization-development-parametric-nkechichiomaosoka40yj-taop2-internals1000ddiv7":"COBALT-007","project-hybridization-development-parametric28yg-jennifer700ddiv6pt9":"COBALT-008",
  "project-hybridization-development-parametric40yg-maryann1000ddiv6pt9":"COBALT-009","project-hybridization-development-parametric40yg-obianuju1000ddiv6pt9":"COBALT-010","project-integral-system-parametric-pisp36d":"COBALT-011","promotion-not-from-east-nor-from-west23ddiv82pt80":"KYANITE-025","proper-of-fully-developed-subset-of-the-good-samaritan-system-implementation-of-the-zero-trade-salvation":"TOPAZ-001","recuperation-and-shulamite-vindication-against-the-backdrop-of-the-gestation-of-the-dystopia-of-the-seventh-king-and-wwiii100ddiv7":"GARNET-017","reeducation-of-this-nigeria-the-university-of-hard-knocks-yg":"NATROLITE-002","reeducation-of-this-nigeria-the-university-of-hard-knocks-yj":"NATROLITE-003","reeducation-of-this-nigeria-the-university-of-hard-knocks100d":"NATROLITE-004","revelation-of-the-trial-expanded-revotte-ie-proper-ie-eigen-diagonalization-metric200d":"SIDERITE-002",
  "revelation-of-the-trial-revott-at-the-end-ie-purpose-of-all-things-is-at-hand-ie-at-birth100d":"ILMENITE-039","revelation-of-the-trial-revott-eigen-proper-equation-200d":"GARNET-018","revott-fully-developed-secondary-stage-follicle-cross-trained-totmotn100d":"COBALT-012","revott-onset-of-antral-phase-tertiary-stage-follicle-cross-trained-totmotn100d":"COBALT-013","revott-purpose-of-all-things-is-at-hand-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-040","revott-s2-14pt955-360d-implies-ztp-at-5tw-lawrence-livermore-lab-nuclear-fusion-breakthrough-implies-jephthahs-awful-sacrifice-of-daughter-100d":"CALCITE-002","roundabout-aimee-magnified-proper2731ddiv18":"EPIDOTE-001","roundabout-aimee-proper":"EPIDOTE-002","saved-and-locked-to-the-vision-yg":"VERMEIL-001","saved-and50yj-lock-to-the-vision-yj":"VERMEIL-002",
  "saved-by-christ-jesus-100d":"VERMEIL-003","saved1000d":"VERMEIL-004","sdq-phdp-taop-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-becomes-the-shulamite-exodus26v7to9-eleven-curtains-foremost-entry1000ddiv7":"GARNET-019","sdq-phdp-taop-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-becomes-the-shulamite-exodus26v7to9-eleven-curtains-uttermost-exit1000ddiv7":"GARNET-020","sdq-phdp-taop-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-becomes-the-shulamite-exodus26v7to9-one-hour-of-the-ten-horns-at-forefront-of-the-eleventh-curtain1000ddiv7":"GARNET-021","sdq-phdp-taop-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-becomes-the-shulamite-exodus26v7to9-sunclothed-woman-between-fifth-and-sixth-curtains1000ddiv7":"GARNET-022","sdq-phdp-taop-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-deliverance-from-clutches-of-inordinate-love-ergo-torment-scarring-and-trauma-hsotp-entry1000ddiv7":"GARNET-023","sdq-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-becomes-the-shulamite1000ddiv7":"GARNET-024","sealed-a-slave-forever-in-m1800-the-unlimited-company-the-omega-project100d-because-of-sfobbminus18pt00-and-whose-ztp-is-s2minus18pt00-on-revott":"CHRYSOBERYL-009","sealed-a-slave-forever-in-the-unlimited-company-the-omega-project100d-because-of-sfobbminus18pt00-and-whose-ztp-is-s2minus18pt00-on-revott":"CHRYSOBERYL-010",
  "second-seal-a-red-horse-a-rider-a-great-sword-to-take-peace-from-earth100d":"RHODONITE-022","second-seal-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-023","second-trumpet-a-great-mountain-burning-with-fire-is-cast-into-the-sea100d":"ALBITE-013","second-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ALBITE-014","second-vial-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-010","second-vial-the-sea-becomes-as-the-blood-of-a-dead-human-being100d":"YTTRIALITE-011","seeking-finding-the-comfort-in-charity-faith-and-hope300d":"JASPER-001","seven-year-cleansing-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-012","seven-year-cleansing-of-all-the-land-ie-the-zkp-of-cfh-onset-enter100d":"YTTRIALITE-013","seven-year-cleansing-of-all-the-land-ie-the-zkp-of-cfh-start100d":"YTTRIALITE-014",
  "seventh-seal-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-024","seventh-seal-half-hour-of-silence-as144000-are-sealed-before-overwhelming-rebukes-on-gog-and-his-hordes-commence100d":"RHODONITE-025","seventh-trumpet-begins-to-sound-first-vial-a-noisome-grievous-sore-on-those-with-mark-of-beast100d":"YTTRIALITE-015","seventh-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-016","seventh-vial-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-017","seventh-vial-into-the-air-a-great-voice-out-of-the-temple-of-heaven-it-is-done-end-of-day301-of-making-wedding-and-his-wife-has-made-herself-ready-begin100d":"YTTRIALITE-018","seventy-times-seventy-years-determined70yg":"LARIMAR-004","seventy-times-seventy-years-determined70yj":"LARIMAR-005","she-that-travaileth-and-bringeth-forth-the-fruits-of-the-kingdom-of-god-measured-from-ca-the-international-human-rights-declaration-against-slavery-at-the-congress-of-vienna-unto-etc-patrice-lumumba-at-ztp-ca-the-preminent-month-of-the-year-of-africa-360d":"ZIRCON-003","she-that-travaileth-and-bringeth-forth-the-fruits-of-the-kingdom-of-god-measured-from-ca-the-international-human-rights-declaration-against-slavery-at-the-congress-of-vienna-unto-ztp-at-etc-nigeria-independence-360d":"ZIRCON-004",
  "shulam-military-time-deathmode1-igvd-yg":"NEPHRITE-001","shulam-military-time-deathmode1-igvd-yj":"NEPHRITE-002","shulam-military-time-deathmode1-igvd100":"NEPHRITE-003","shulam-military-time-deathmode2-igvd-yg":"NEPHRITE-004","shulam-she-that-is-of-me-the-new-nation-determined-and-globally-resonant-emancipation-signal-in-the-time-lockdown-boundary-of-enoch-between-is-and-is-to-come100d":"GARNET-025","shulam-she-that-is-of-me-the-new-nigeria100d-named-because-of-sfobbminus13pt32-and-whose-ztp-is-s2minus28pt80-on-revott":"CHRYSOBERYL-011","shulam-the-queen-yj":"GARNET-026","shulam-the-queen100d":"GARNET-027","sixth-seal-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ALBITE-015","sixth-seal-the-vision-the-great-day-of-his-wrath-is-come-who-can-stand-exe-tpdp-end-of-day1-of-making-wedding100d":"ALBITE-016",
  "sixth-seal-zero-100d":"ALBITE-017","sixth-seal-zero-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ALBITE-018","sixth-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ALBITE-019","sixth-trumpet-the-four-angels-bound-in-the-great-river-euphrates-are-loosed100d":"ALBITE-020","sixth-vial-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-019","sixth-vial-great-river-euphrates-dries-up-to-prepare-way-of-kings-of-east100d":"YTTRIALITE-020","sixty-nine-week-paramour-discovery-and-timelock7d":"BASALT-005","sixty-nine-week-paramour-discovery-entry-boundary7d":"BASALT-006","sixty-nine-week-paramour-discovery-optimum1-boundary7d":"BASALT-007","sixty-nine-week-paramour-discovery-optimum2-boundary7d":"BASALT-008",
  "sixty-nine-week-timelock-entry7d":"BASALT-009","sixty-nine-week-timelock-exit-one7d":"BASALT-010","sixty-nine-week-timelock-exit-zero7d":"BASALT-011","subset-of-the-revelation-of-the-seven-day-theory-proper-metric":"YTTRIALITE-021","sun-and-moon-clothed-woman-built-up-in-travail100d":"DOLOMITE-002","sun-and-moon-clothed-woman-travail-buildup1000-sevenday-depiction-not-in-standard-form":"DOLOMITE-003","surprised-by-love-formerly-understood-by-paramour-discovery-2800ddiv23":"MAGNETITE-004","ten-days-tribulation-eigen-diagonalized-for-seventy-weeks-system-proper-values2961ddiv23":"BASALT-012","ten-days-tribulation-unto-armageddon-ca-gathering-starts-2800ddiv23":"MAGNETITE-005","ten-days-tribulation-unto-armageddon-finished-2800ddiv23":"MAGNETITE-006",
  "ten-days-unto-the-alternative-havens10d-tah":"IDOCRASE-001","the-acc-abstract-of-projects-and-the-trial-ztp11640-a-minus-half-six-and-then-seventh-day-depiction-minus360d-not-in-standard-form2400d":"XENOTIME-003","the-acc-abstract-of-projects-and-the-trial-ztp12000-a-minus-half-six-and-then-seventh-day-depiction-not-in-standard-form2400d":"XENOTIME-004","the-acc-abstract-of-projects-and-the-trial-ztp12360-a-minus-half-six-and-then-seventh-day-depiction-plus360d-not-in-standard-form2400d":"XENOTIME-005","the-account-of-the-alien-corridor-proposal-the-trial-streamline-at-y-equals-m10pt39":"TITANITE-005","the-advent-of-the-daughter-proper-of-the-fullydeveloped-subset-of-tnl3d-universe-emanating-at-tnldy0":"ANDALUSITE-002","the-annihilation-that-is-of-gog840ddiv23":"AGATE-093","the-blessed-and-glorious-hope-appearing-even-through-the-great-tribulation-unto-armageddon-and-beyond-amen-note-using-ztp16800":"ZEOLITE-001","the-blessed-and-glorious-hope-appearing-even-through-the-great-tribulation-unto-armageddon-and-beyond-amen-note-using-ztp16848":"ZEOLITE-002","the-blessed-and-glorious-hope-appearing-even-through-the-great-tribulation-unto-armageddon-and-beyond-amen-note-using-ztp16853":"ZEOLITE-003",
  "the-blessed-hope-and-the-glorious-appearing-proper":"ZEOLITE-004","the-court-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-041","the-court-that-is-without-begin100d":"ILMENITE-042","the-court2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-043","the-creature-learns-to-be-separate-between-good-and-evil-yg":"MAGNETITE-007","the-creature-learns-to-be-separate-between-good-and-evil-yj":"MAGNETITE-008","the-destroyer-of-the-gentiles-is-on-his-way-to-perdition100d":"CALCITE-003","the-destroyer-of-the-gentiles-is-on-his-way-to-perdition100d-enter":"CALCITE-004","the-destroyer-of-the-gentiles-is-on-his-way-to-perdition100d-leave":"CALCITE-005","the-eat-rest-work-time-savings-grant100d":"PYRITE-001",
  "the-egspp-creature-sets-off-into-the-world-and-finds-its-purpose100d":"OLIVINE-003","the-end-ie-purpose-of-all-things1-is-at-hand-yg":"ILMENITE-044","the-end-of-the-seal-judgments":"YTTRIALITE-022","the-end-of-the-seal-judgments-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-023","the-end-of-the-vial-judgments-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-024","the-end-of-the-vial-judgments100d":"YTTRIALITE-025","the-federal-republic-of-nigeria-shall-be-one-stick-in-the-hand-of-the-lord-yg":"ZIRCON-005","the-federal-republic-of-nigeria-shall-be-one-stick-in-the-hand-of-the-lord-yj":"ZIRCON-006","the-first-jeroboam-yg":"FLUORITE-006","the-first-jeroboam100d":"FLUORITE-007",
  "the-first-judgment-embodiment-of-the-saving-grace-cfh-making-wedding-jew-streamline-at-y-equals2pt01":"VANADINITE-002","the-flee-factor-yg":"QUARTZ-001","the-flee-factor100d":"QUARTZ-002","the-good-samaritan-system-implementation-of-the-zero-trade-salvation-global-proper":"TOPAZ-002","the-great-things-of-gods-law-a-little-here-a-little-there-proper-metric":"RUTILE-009","the-great-things-of-gods-law-a-little-here-a-little-there-yg-streamline-at-xequals38pt325":"URANINITE-001","the-great-things-of-gods-law-a-little-here-a-little-there-yg-streamline-at-xequals38pt95878":"URANINITE-002","the-great-things-of-gods-law-a-little-here-a-little-there-yg-streamline-at-xequals44pt10":"URANINITE-003","the-great-things-of-gods-law-a-little-here-a-little-there-yj-streamline-at-xequals38pt325":"URANINITE-004","the-great-things-of-gods-law-a-little-here-a-little-there-yj-streamline-at-xequals38pt95878":"URANINITE-005",
  "the-great-things-of-gods-law-a-little-here-a-little-there-yj-streamline-at-xequals44pt10":"URANINITE-006","the-intelligent-defence-body-and-the-five-terawatt-project-ie-the-elusive-sixty-nine-week-singularity-manifestation-after-the-fact-of-a-metonic-cycle7d":"BASALT-013","the-lamb-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-026","the-lamb-overcoming-the-ten-horns100d":"YTTRIALITE-027","the-light-of-the-sun-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"XIMENIA-003","the-light-of-the-sun-is-sevenfold-as-gog-taken-at-armageddon-finish100d":"XIMENIA-004","the-light-of-the-sun-is-sevenfold-as-gog-taken-at-armageddon-start100d":"XIMENIA-005","the-light-of-the-sun2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"XIMENIA-006","the-light-shines-in-the-darkness-but-the-darkness-comprehends-it-not10yg":"FLUORITE-008","the-lord-shall-judge-his-people700d-atyequalsminus18":"ENSTATITE-022",
  "the-lord-shall-judge-his-people700d-atyequalszero":"ENSTATITE-023","the-main-strain-shulammite-lineage-of-grace-through-faith-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-026","the-main-strain-shulammite-lineage-of-grace-through-faith-m1800-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-027","the-main-strain-shulammite-lineage-of-grace-through-faith-threeppnoah-omega-project-ideation-implies-arthur-george-consolidated-holdings-sealed-a-slave-forever-in-the-unlimited-company-etc-aimee-mungovan-zkpcdp-over-gogid100d":"RHODONITE-028","the-marriage-supper-fully-developed-line-of-equipotential-ie-against-all-w-equal82pt80":"XIMENIA-007","the-marriage-supper-the-approach-unto-the-rest-that-remains-proper-metric":"WAVELLITE-007","the-mystery-of-iniquity-they-shall-mingle-themselves-with-the-seed-of-men-earliest-dnps-overlap-infiltration-100d":"FLUORITE-009","the-mystery-of-iniquity-they-shall-mingle-themselves-with-the-seed-of-men-latest-100d":"FLUORITE-010","the-new-creature-in-the-end-times-tnc-itet-an-hsotp-beginning-yg":"VERMEIL-005","the-new-creature-in-the-end-times-tnc-itet-an-hsotp-end-purpose-yg":"VERMEIL-006",
  "the-new-creature-in-the-end-times-tnc-itet-an-hsotp-executable-core-enter-fourth-egg-within-yg":"VERMEIL-007","the-new-creature-in-the-end-times-tnc-itet-an-hsotp-executable-core-entry-point-yg":"VERMEIL-008","the-new-creature-in-the-end-times-tnc-itet-an-hsotp-executable-core-exit-point1-yg":"VERMEIL-009","the-new-creature-in-the-end-times-tnc-itet-an-hsotp-executable-core-exit-point2-yg":"VERMEIL-010","the-numbering-of-the-5587days-of-gog-in-power-on-the-earth100d":"XENOTIME-006","the-passion-of-the-gift-from-god100d":"KYANITE-026","the-power-of-the-manchild-100d":"ALBITE-021","the-purpose-of-all-things-is-at-hand-ie-birth100d-because-of-sfobbzero-and-whose-ztp-is-s2-82pt80-on-revott":"CHRYSOBERYL-012","the-purpose-of-all-things-is-at-hand-ie-circumspection100d-because-of-sfobbzero-and-whose-ztp-is-s2-85pt32-on-revott":"CHRYSOBERYL-013","the-rise-from-so-great-a-death-the-seven-day-theory-equipotential-line-against-all-w-equal48pt00":"BORNITE-002",
  "the-rise-from-so-great-a-death-the-trial-equipotential-line-against-all-w-equal48pt00":"TITANITE-006","the-second-jeroboam-yg":"FLUORITE-011","the-second-jeroboam100d":"FLUORITE-012","the-seventy-weeks-of-the-seventh-king-7d":"KUNZITE-003","the-ships-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-045","the-ships-of-chittim-shall-come-against-him100d":"ILMENITE-046","the-shulammite-singularity-manifestation-of-the-mystery-the-immanence-in-nigeria-count-is-in-reverse7d":"BASALT-014","the-symbolic-synodic-period-of-venus-a-time-of-the-gentiles-as-read-from-kings-leaving3500d-and-containing-the-seventy-weeks-of-daniel350d":"KUNZITE-004","the-temple-2520days-100d":"GRAPHITE-010","the-temple-2520days-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"GRAPHITE-011",
  "the-ten-horns-completely-burn-the-flesh-of-mystery-babylon-with-fire-finish100d":"RHODONITE-029","the-ten-horns-completely-burn-the-flesh-of-mystery-babylon-with-fire-start100d":"RHODONITE-030","the-ten-horns-completely-burn-the-flesh-of-mystery-babylon-with-fire-the-court-that-is-without-end100d":"ILMENITE-047","the-ten-horns-completely-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-031","the-ten-horns-completely2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-032","the-trial-ztp12053-a-minus-half-six-and-then-seventh-day-depiction-entering-into-a360-day-frame2-of-a-time-times-and-half-a-time-not-in-standard-form2400d":"XENOTIME-007","the-two-prophets-the-lampstands-commence-testimony100d":"RHODONITE-033","the-two-prophets-the-lampstands-war-with-the-beast-end100d":"YTTRIALITE-028","the-two-prophets-the-lampstands-war-with-the-beast-finish100d":"YTTRIALITE-029","the-two-prophets-the-lampstands-war-with-the-beast-start100d":"YTTRIALITE-030",
  "the-two-prophets1-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-034","the-two-prophets2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-031","the-two-prophets3-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-032","the-two-prophets4-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-033","the-work-of-god-is-tried-with-fire100d":"CALCITE-006","the144000000-time-redemption-proper-metric":"PYRITE-002","third-seal-a-black-horse-and-rider-a-pair-of-balances-in-his-hand-hurt-not-the-oil100d":"RHODONITE-035","third-seal-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-036","third-trumpet-a-great-star-called-wormwood-falls-from-heaven-burning-as-a-lamp-waters-made-bitter100d":"ALBITE-022","third-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ALBITE-023",
  "third-vial-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"YTTRIALITE-034","third-vial-the-rivers-and-fountains-of-waters-become-blood100d":"YTTRIALITE-035","threepp-noah-belief-propagation-proper":"JADEITE-005","threeppnoah-global-turnaround-fullydeveloped250ddiv9":"RHODONITE-037","threeppnoah-idea-adoption-and-implementation-culminates-with-the-end-of-seven-year-cleansing-of-all-the-land-ie-the-zkp-of-cfh-ie-finish100d":"YTTRIALITE-036","threeppnoah-idea-adoption-and-implementation-three100d":"YTTRIALITE-037","threeppnoah-idea-adoption-and-implementation-two100d":"YTTRIALITE-038","threeppnoah-ideation-cum-proposal-presentation-implies-arthur-george-consolidated-holdings-agch-sealed-a-slave-forever-in-the-unlimited-company-the-omega-project-aimee-mungovan-zkpcdp-etc-and-culminates-with-tie-in-to-background-onset-of-gogid100d":"RHODONITE-038","threeppnoah-ideation-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"RHODONITE-039","tnl-1000d":"KYANITE-027",
  "tnl-yg":"KYANITE-028","tnl-yj":"KYANITE-029","trump-putin-the-seventh-kingdom-and-the-transition-the-trial-equipotential-line-against-all-w-equal43pt20":"TITANITE-007","tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-cfhthruhembossztpdesignpoint0":"BASALT-015","tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-cfhthruhembossztpexit":"BASALT-016","tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-forty-days-prior-cfhthruhembossztpentry":"BASALT-017","tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-twenty-days-after-and-for-a-total-180day-ztp-interval-cfhthruhembossztpposteriorexit":"BASALT-018","unn-job-accepted-100d":"DUMORTIERITE-001","unn-job-accepted-700div6pt9d":"DUMORTIERITE-002","unn-job-accepted-yg":"DUMORTIERITE-003",
  "unn-job-accepted-yj":"DUMORTIERITE-004","unn-job-offered-100d":"DUMORTIERITE-005","unn-job-offered-700div6pt9d":"DUMORTIERITE-006","unn-job-offered-yg":"DUMORTIERITE-007","unn-job-offered-yj":"DUMORTIERITE-008","unto-the-graduation-from-acolyte-to-sonoflight-unto-creator-amen-yg":"PREHNITE-003","unto-the-graduation-from-acolyte-to-sonoflight-unto-creator-amen-yj":"PREHNITE-004","unto-the-graduation-from-acolyte-to-sonoflight-unto-creator-amen100d":"PREHNITE-005","unto-the-judgement-unto-the-rest-the-joy-of-our-lord":"FELDSPAR-001","unto-the-overflow-of-the-shulammite-military-yg":"NEPHRITE-005",
  "usa-dem-rev-sit-on-brit-emp-70000ddiv69":"YTTRIUM-005","usa-sit-10yg":"YTTRIUM-006","walking-leaping-praising-god-all-the-way-to-armageddon100d-ztp18040-justified-in-the-midst-of-the-adversarial-gatherings":"KYANITE-030","walking-leaping-praising-god-all-the-way-to-armageddon100d-ztp18117pt-beginnings-of-the-gathering-of-the-mighty-and-holy-people":"KYANITE-031","walking-leaping-praising-god-all-the-way-to-armageddon100d-ztp18120":"KYANITE-032","walking-leaping-praising-god-all-the-way-to-armageddon100d-ztp18148-glorious-end-as-in-purpose-of-the-light-of-seven-days":"KYANITE-033","what-withholdeth-bw-ca-18pt50-and-25pt20-the-mystery-of-iniquity-and-that-number-is-embedded-in-this-sfo36d":"ILMENITE-048","within-few-days-m1600-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-049","within-few-days-m1600-raiser-of-taxes-is-destroyed-not-in-battle-nor-in-anger100d":"ILMENITE-050","within-few-days-m1640-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-051",
  "within-few-days-m1640-raiser-of-taxes-is-destroyed-not-in-battle-nor-in-anger100d":"ILMENITE-052","within-few-days-m1656-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-053","within-few-days-m1656-raiser-of-taxes-is-destroyed-not-in-battle-nor-in-anger100d":"ILMENITE-054","withstood-me-one-and-twenty-7560days-100d":"GRAPHITE-012","withstood-me-one-and-twenty-7560days-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"GRAPHITE-013","yea-and-the-prince-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-055","yea-and-the-prince-of-the-covenant-also100d":"ILMENITE-056","your-savings-are-good-you-have-the-right-idea-yg":"CHRYSOBERYL-014","z-tnldy-clock3":"WOLLAST-001","zero-trade-salvation-from-ca-tontine-coffee-shop--to-euronext-nyse-etal-yg":"DIASPORE-002",
  "zero-trade-salvation-from-ca-under-the-buttonwood-tree--to-euronext-nyse-etal-yg":"DIASPORE-003","zero-trade-salvation-universe-absolute-centralization-unto-utter-decentralization-ztp1-eigenfunction35280ddiv48pt3":"DIASPORE-004","zero-trade-salvation-universe-absolute-centralization-unto-utter-decentralization-ztp2-eigenfunction35280ddiv48pt3":"DIASPORE-005","ztp7571-approaching-developed-primary-follicle-inner-galaxy-vision-development100d":"NEPHRITE-006","ztp7624-approaching-developed-primary-follicle-inner-galaxy-vision-development100d":"NEPHRITE-007","ztp7680-approaching-developed-primary-follicle-inner-galaxy-vision-development100d":"NEPHRITE-008","ztp7932-approaching-developed-primary-follicle-inner-galaxy-vision-development100d":"NEPHRITE-009","ztp7968-approaching-developed-primary-follicle-inner-galaxy-vision-development100d":"NEPHRITE-010",
  "a-holy-firstborn-from-the-matrix-reckoning-from-isaac-yg":"PREHNITE-006",
  "a-holy-firstborn1-from-the-matrix-yg":"PREHNITE-007",
  "a-holy-firstborn2-from-the-matrix-yg":"PREHNITE-008",
  "a-holy-firstborn3-from-the-matrix-my-darling-beloved-soul-yg":"PREHNITE-009",
  "after-israel-comes-up-out-of-egypt-and-elders-overlive-joshua-at-ztp-ca-m1236496tnldy-unto-2nd-advent-of-the-lord-jesus-christ-36000d":"SPINEL-006",
  "alien-corridor-creation-m2333pt3333-gogid-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"HORNBLENDE-027",
  "alien-corridor-creation100d-ztp11826pt6667":"HORNBLENDE-028",
  "and-arms-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-057",
  "and-arms-shall-stand-on-his-part100d":"ILMENITE-058",
  "biomass-substrate-reconstitution-preprogram700div6pt9":"VERMEIL-011",
  "birth-of-the-fig-tree-minusninezerofour-yj":"MARCASITE-013",
  "birth-of-the-fig-tree-ztp-minus879tnldy-end-of-the-six-day-war-yj":"MARCASITE-014",
  "birth-of-the-fig-tree-ztp-minus884tnldy-start-of-the-six-day-war-yj":"MARCASITE-015",
  "birth-of-the-fig-tree-ztp-minus898tnldy-egypt-closes-the-straits-of-tiran-yj":"MARCASITE-016",
  "birth-of-the-fig-tree-ztp-minus904tnldy-egypt-begins-amassing-troops-on-israels-borders-yj":"MARCASITE-017",
  "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-setting1-100d":"LAZULITE-013",
  "cfh-rapturing-through-family-friends-acquaintances-etc-ffae-leavetwo100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-25pt56-on-revott":"CHRYSOBERYL-015",
  "dark-night2-m2107-gogid-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"HORNBLENDE-029",
  "dark-nignt-of-the-prophets-soul-yg-ztp12060":"HORNBLENDE-030",
  "dark-nignt-of-the-prophets-soul100d-named-because-of-sfobbzero-and-whose-ztp-is-s2minus21pt07-on-revott":"CHRYSOBERYL-016",
  "dark-nignt-of-the-prophets-soul100d-ztp12052pt17":"HORNBLENDE-031",
  "days-i":"LARIMAR-006",
  "days-i-month31028-pattern":"YTTRIUM-007",
  "days-ii":"LARIMAR-007",
  "days-iii":"LARIMAR-008",
  "days-iv":"LARIMAR-009",
  "days-one":"LARIMAR-010",
  "days-v":"LARIMAR-011",
  "deliverance3-ztp16716pt52-jesus-christ-is-well-on-about-the-business-of-his-father-yj":"ENSTATITE-024",
  "eleven-curtains-and-also-the-gentile-at-w-equals-0pt00-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9":"GARNET-028",
  "eleven-curtains-and-also-the-gentile-at-w-equals-18pt29-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9":"GARNET-029",
  "eleven-curtains-and-also-the-gentile-at-w-equals-18pt39-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9":"GARNET-030",
  "eleven-curtains-and-also-the-gentile-at-w-equals-21pt91-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9":"GARNET-031",
  "eleven-curtains-and-also-the-gentile-at-w-equals-34pt918-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9":"GARNET-032",
  "eleven-curtains-and-also-the-gentile-at-w-equals-35pt418-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9":"GARNET-033",
  "eleven-curtains-and-also-the-gentile-at-w-equals-37pt928-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9":"GARNET-034",
  "eleven-curtains-and-also-the-gentile-at-w-equals-38pt347-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9":"GARNET-035",
  "eleven-curtains-and-also-the-gentile-at-w-equals-39pt88-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9":"GARNET-036",
  "eleven-curtains-and-also-the-gentile-at-w-equals-40pt18-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9":"GARNET-037",
  "eleven-curtains-and-also-the-gentile-at-w-equals-42pt28-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9":"GARNET-038",
  "eleven-curtains-and-also-the-gentile-at-w-equals-minus18pt00-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9":"GARNET-039",
  "eleven-curtains-of-the-shulammite-dark-night-of-the-prophets-soul-dnps-and-also-the-gentile-eigen-proper-16900ddiv69":"GARNET-040",
  "eleven-curtains-of-the-shulammite-dark-night-of-the-prophets-soul-dnps-the-jew-first-eigen-proper-1700ddiv7":"GARNET-041",
  "eleven-curtains-the-jew-first-at-w-equals-0pt00-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7":"GARNET-042",
  "eleven-curtains-the-jew-first-at-w-equals-18pt29-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7":"GARNET-043",
  "eleven-curtains-the-jew-first-at-w-equals-18pt39-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7":"GARNET-044",
  "eleven-curtains-the-jew-first-at-w-equals-21pt91-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7":"GARNET-045",
  "eleven-curtains-the-jew-first-at-w-equals-34pt918-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7":"GARNET-046",
  "eleven-curtains-the-jew-first-at-w-equals-35pt418-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7":"GARNET-047",
  "eleven-curtains-the-jew-first-at-w-equals-37pt928-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7":"GARNET-048",
  "eleven-curtains-the-jew-first-at-w-equals-38pt347-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7":"GARNET-049",
  "eleven-curtains-the-jew-first-at-w-equals-39pt88-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7":"GARNET-050",
  "eleven-curtains-the-jew-first-at-w-equals-40pt18-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7":"GARNET-051",
  "eleven-curtains-the-jew-first-at-w-equals-42pt28-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7":"GARNET-052",
  "eleven-curtains-the-jew-first-at-w-equals-minus18pt00-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7":"GARNET-053",
  "exe-tpdp-cognitive-hertz-frequency":"CHRYSOBERYL-017",
  "he-shall-confirm-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"ILMENITE-059",
  "he-shall-confirm-the-covenant-with-many-for-one-week-start100d":"ILMENITE-060",
  "judgment-turns-in-favour-of-the-broken-stones-5561pt-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"XENOTIME-008",
  "judgment-turns-in-favour-of-the-broken-stones-5587-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"XENOTIME-009",
  "judgment-turns-in-favour-of-the-broken-stones-set-at-naught-by-that-number-and-by-that-troop100d-revott-s2-at-5561pt":"XENOTIME-010",
  "judgment-turns-in-favour-of-the-broken-stones-set-at-naught-by-that-number-and-by-that-troop100d-revott-s2-at-5587":"XENOTIME-011",
  "lives-of-the-rest-of-the-beasts-prolonged-a-season-and-a-time-7669days-their-end-is-literally-fulfilled-here-higgaion-selah-100d":"GRAPHITE-014",
  "lives-of-the-rest-of-the-beasts-prolonged-a-season-and-a-time-7669days-their-end-is-literally-fulfilled-here-higgaion-selah-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d":"GRAPHITE-015",
  "multiple-detonations-and-destructions-at-great-babylon-viscerally-shock-many-generational-slaves-and-servants-into-emancipation-from-among-the-chaos-attendant-at-her-destruction-360d":"KUNZITE-005",
  "part1-embryo-genesis-seedling-plant-photosynthesis360d":"OLIVINE-004",
  "part2-embryo-genesis-seedling-plant-photosynthesis240d":"OLIVINE-005",
  "phdp-oage40yj-nkechichioma-osoka-imama1st-eyes-on-her1-fullchannel1000ddiv7":"COBALT-014",
  "phdp-oage40yj-nkechichioma-osoka-imama1st-eyes-on-her2-fullchannel1000ddiv7":"COBALT-015",
  "revott-s2-15pt341-360d-implies-ztp-at-definitively-linking-the-success-of-noah-atdf-to-fall-of-7th-and-8th-kings-implies-1st-year-of-king-david-reign-100d":"CALCITE-007",
  "revott-s2-15pt367-360d-implies-ztp-at-20231007-realtime-50th-yom-kippur-anniversary-attack-on-israel-by-hamas-implies-beginnings-of-king-david-reign-in-jerusalem-100d":"CALCITE-008",
  "revott-s2-15pt449-360d-implies-ztp-at-54pt00-tnlyg-ygbday-castigliano-failure-singularity-implies-1st-year-coreign-david-and-solomon-100d":"CALCITE-009",
  "seventh-king-uses-the-key-of-thermonuclear-war-to-open-the-bottomless-pit-and-let-out-the-ten-horns-mystery-babylon-a-raiser-of-taxes-the-eighth-king-etc-35d":"KUNZITE-006",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-0pt00-of-ten-days-tribulation-7d":"BASALT-019",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-10pt80-of-ten-days-tribulation-7d":"BASALT-020",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-111pt60-of-ten-days-tribulation-7d":"BASALT-021",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-12pt41-of-ten-days-tribulation-7d":"BASALT-022",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-13pt318-of-ten-days-tribulation-7d":"BASALT-023",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-14pt40-of-ten-days-tribulation-7d":"BASALT-024",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-18pt41-of-ten-days-tribulation-7d":"BASALT-025",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-24pt41-of-ten-days-tribulation-7d":"BASALT-026",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-25pt20-of-ten-days-tribulation-7d":"BASALT-027",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-25pt928-of-ten-days-tribulation-7d":"BASALT-028",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-27pt00-of-ten-days-tribulation-7d":"BASALT-029",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-27pt41-of-ten-days-tribulation-7d":"BASALT-030",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-27pt718-of-ten-days-tribulation-7d":"BASALT-031",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-29pt528-of-ten-days-tribulation-7d":"BASALT-032",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-31pt318-of-ten-days-tribulation-7d":"BASALT-033",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-31pt50-of-ten-days-tribulation-7d":"BASALT-034",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-32pt40-of-ten-days-tribulation-7d":"BASALT-035",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-33pt128-of-ten-days-tribulation-7d":"BASALT-036",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-33pt58-of-ten-days-tribulation-7d":"BASALT-037",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-34pt00-of-ten-days-tribulation-7d":"BASALT-038",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-34pt10-of-ten-days-tribulation-7d":"BASALT-039",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-34pt918-of-ten-days-tribulation-7d":"BASALT-040",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-35pt418-of-ten-days-tribulation-7d":"BASALT-041",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-36pt728-of-ten-days-tribulation-7d":"BASALT-042",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-37pt928-of-ten-days-tribulation-7d":"BASALT-043",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-38pt128-of-ten-days-tribulation-7d":"BASALT-044",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-38pt347-of-ten-days-tribulation-7d":"BASALT-045",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-38pt518-of-ten-days-tribulation-7d":"BASALT-046",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-39pt362-of-ten-days-tribulation-7d":"BASALT-047",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-39pt60-of-ten-days-tribulation-7d":"BASALT-048",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-39pt88-of-ten-days-tribulation-7d":"BASALT-049",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-40pt18-of-ten-days-tribulation-7d":"BASALT-050",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-42pt28-of-ten-days-tribulation-7d":"BASALT-051",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-50pt40-of-ten-days-tribulation-7d":"BASALT-052",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-52pt92-of-ten-days-tribulation-7d":"BASALT-053",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-56pt52-of-ten-days-tribulation-7d":"BASALT-054",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-60pt12-of-ten-days-tribulation-7d":"BASALT-055",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-63pt72-of-ten-days-tribulation-7d":"BASALT-056",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-67pt32-of-ten-days-tribulation-7d":"BASALT-057",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-67pt48-of-ten-days-tribulation-7d":"BASALT-058",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-67pt68-of-ten-days-tribulation-7d":"BASALT-059",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-6pt41-of-ten-days-tribulation-7d":"BASALT-060",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-70pt92-of-ten-days-tribulation-7d":"BASALT-061",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-72pt00-of-ten-days-tribulation-7d":"BASALT-062",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-74pt52-of-ten-days-tribulation-7d":"BASALT-063",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-75pt60-of-ten-days-tribulation-7d":"BASALT-064",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-78pt12-of-ten-days-tribulation-7d":"BASALT-065",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-81pt72-of-ten-days-tribulation-7d":"BASALT-066",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-82pt80-of-ten-days-tribulation-7d":"BASALT-067",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-85pt32-of-ten-days-tribulation-7d":"BASALT-068",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-minus10pt39-of-ten-days-tribulation-7d":"BASALT-069",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-minus147pt60-of-ten-days-tribulation-7d":"BASALT-070",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-minus18pt00-of-ten-days-tribulation-7d":"BASALT-071",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-minus19pt60-of-ten-days-tribulation-7d":"BASALT-072",
  "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-minus6pt668-of-ten-days-tribulation-7d":"BASALT-073",
  "shulam-she-that-is-of-me-the-new-nigeria100d":"GARNET-054",
  "shulam-the-queen-sdq1000ddiv7":"GARNET-055",
  "ten-days-tribulation-10dt-eigen-proper-equation-2961ddiv23":"GARNET-056",
  "ten-days-tribulation-unto-armageddon2800ddiv23":"MAGNETITE-009",
  "ten-days-tribulation2800ddiv23":"MAGNETITE-010",
  "the-core-completion-matrix1-for-alien-corridor-creation-knowledge-is-increased-iron-is-not-mingled-but-can-react-at-singular-heat-with-miry-clay240d":"XENOTIME-012",
  "the-core-completion-matrix2-for-alien-corridor-creation-knowledge-is-increased-iron-is-not-mingled-but-can-react-at-singular-heat-with-miry-clay240d":"XENOTIME-013",
  "the-creature-which-god-has-made-strong-for-himself-hemboss-enter-yg":"LAZULITE-014",
  "the-creature-which-god-has-made-strong-for-himself-hemboss-enter100d":"LAZULITE-015",
  "the-creature-which-god-has-made-strong-for-himself-hemboss-enter360d":"LAZULITE-016",
  "the-creature-which-god-has-made-strong-for-himself-hemboss-leave-yg":"LAZULITE-017",
  "the-creature-which-god-has-made-strong-for-himself-hemboss-leave100d":"LAZULITE-018",
  "the-creature-which-god-has-made-strong-for-himself-hemboss-leave360d":"LAZULITE-019",
  "the-creature-which-god-has-made-strong-for-himself-hemboss-yg":"LAZULITE-020",
  "the-creature-which-god-has-made-strong-for-himself-hemboss100d":"LAZULITE-021",
  "the-creature-which-god-has-made-strong-for-himself-hemboss360d":"LAZULITE-022",
  "the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-design-point":"BASALT-074",
  "the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-exit":"BASALT-075",
  "the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-forty-days-prior-entry":"BASALT-076",
  "the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-twenty-days-after-posterior-exit-for-total180day-ztp-interval":"BASALT-077",
  "the-redemption-of-a-people-scattered-and-peeled-terrible-from-their-beginning-hitherto-101dys31div69":"MARCASITE-018",
  "the-robin-hood-protocol-ahz-ahi-100d":"CALCITE-010",
  "the-shulammite-sdq-global-dedicated-to-juliet-koji-iwu-jki-ie-proper-ie-eigen-diagonalization-metric1700ddiv7":"SIDERITE-003",
  "the-trial-ztp12000-a-minus-half-six-and-then-seventh-day-depiction-entering-into-a360-day-frame1-of-a-time-times-and-half-a-time-not-in-standard-form2400d":"XENOTIME-014",
  "tnl1000":"KYANITE-034",
  "tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity-predestination-unto-the-immanence-in-nigeria7d":"BASALT-078",
  "tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-barebones-darkly-through-a-glass-prerecord-of-facebook-ruminations-on-the-order-for-the-rise-of-the-7th-king-cfhthruhembossztp18827pt81div115setting1":"ALBITE-024",
  "tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-cfhthruhembossztpdesignpoint1":"BASALT-079",
  "tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-present-at-olokoro-for-the-loving-celebration-of-life-and-interrment-of-albert-onyenuloya-uhiara-cfhthruhembossztp18794pt8div10setting0":"ALBITE-025",
  "usa-dem-rev-sit-on-brit-emp":"YTTRIUM-008",
  "usa-sit-tenyg":"YTTRIUM-009",
  "within-few-days-raiser-of-taxes-is-destroyed-not-in-battle-nor-in-anger100d":"ILMENITE-061",
  "ztnl":"KYANITE-035"
};


// ── ALIAS DISPLAY FUNCTIONS ──
// The mineral codenames concealed SFO identifiers during the doctoral research. They are no longer
// shown: surfaces display the actual names, and the Rosetta Stone keeps the codename mapping.
function nsDisplay(ns) { return ns; }
function agentDisplay(name) { return name; }

// ═══════════════════════════════════════════════════════════════
// COGNOSCENTI TARGETING LAYER
// JOMO/Claude operates as the nth member of a cognoscenti team.
// The configured instrument — not Claude alone — earns the seat.
// ═══════════════════════════════════════════════════════════════

// ── ROUTING MANIFESTS: Knowledge servers per SFO namespace ──
// Each namespace has configured feeds that define what JOMO/Claude
// can see at that attentional scope. Unconfigured = WOULD QUERY.
const ROUTING_MANIFESTS = {
  sfo00: { label: "REVOTT Building Blocks", feeds: [
    { domain: "geopolitical", sources: ["Reuters", "AP News"], status: "configured" },
    { domain: "economic", sources: ["World Bank Data", "IMF Reports"], status: "configured" },
  ]},
  sfo06: { label: "Shulammite / Demographics", feeds: [
    { domain: "demographic", sources: ["UN Population Division", "World Factbook"], status: "configured" },
    { domain: "cultural", sources: ["UNESCO", "Al Jazeera Culture"], status: "would-query" },
  ]},
  sfo08: { label: "End/Purpose of All Things", feeds: [
    { domain: "geopolitical", sources: ["CNN", "Al Jazeera", "Jerusalem Post"], status: "live" },
    { domain: "defense", sources: ["IISS", "Jane's", "SIPRI"], status: "configured" },
    { domain: "nuclear", sources: ["IAEA", "Bulletin of Atomic Scientists"], status: "would-query" },
  ]},
  sfo11: { label: "HEM-BOSS / Biometric Systems", feeds: [
    { domain: "technology", sources: ["IEEE Spectrum", "MIT Tech Review"], status: "configured" },
    { domain: "security", sources: ["NIST", "Europol"], status: "would-query" },
  ]},
  sfo22: { label: "MDQNM Master Calibration", feeds: [
    { domain: "astronomical", sources: ["USNO", "IERS Bulletins"], status: "configured" },
    { domain: "temporal", sources: ["BIPM Time Dept", "GPS.gov"], status: "would-query" },
  ]},
  sfo24: { label: "Economic Patterns", feeds: [
    { domain: "economic", sources: ["Federal Reserve FRED", "BLS", "CBN Reports"], status: "configured" },
    { domain: "trade", sources: ["WTO", "UNCTAD"], status: "configured" },
  ]},
  sfo26: { label: "Execution / TPDP", feeds: [
    { domain: "geopolitical", sources: ["Reuters", "BBC World", "Arise News"], status: "live" },
    { domain: "energy", sources: ["IEA", "OPEC Monthly Report", "IRENA"], status: "configured" },
    { domain: "infrastructure", sources: ["African Development Bank", "NDB"], status: "configured" },
    { domain: "banking", sources: ["GLS Bank", "Triodos", "IsDB"], status: "configured" },
  ]},
  sfo33: { label: "Dark Night / Prophetic", feeds: [
    { domain: "geopolitical", sources: ["Al Jazeera", "Jerusalem Post", "CNN"], status: "live" },
    { domain: "religious", sources: ["Vatican News", "Arutz Sheva"], status: "would-query" },
  ]},
  sfo36: { label: "Napoleon & Kings / Nuclear", feeds: [
    { domain: "defense", sources: ["IISS Strategic Survey", "Jane's Defence"], status: "configured" },
    { domain: "geopolitical", sources: ["Foreign Affairs", "The Economist"], status: "configured" },
  ]},
  sfo43: { label: "Global Turnaround", feeds: [
    { domain: "development", sources: ["UNDP", "World Economic Forum"], status: "configured" },
    { domain: "climate", sources: ["IPCC", "NASA Climate"], status: "would-query" },
  ]},
  sfo50: { label: "Seven Day Theory", feeds: [
    { domain: "scientific", sources: ["Nature", "Science", "arXiv"], status: "would-query" },
  ]},
  sfo55: { label: "Savings / Financial Architecture", feeds: [
    { domain: "banking", sources: ["BIS Quarterly", "CBN", "ECB"], status: "configured" },
    { domain: "economic", sources: ["Bloomberg", "Financial Times"], status: "configured" },
  ]},
};

// Default manifest for unconfigured namespaces
const DEFAULT_MANIFEST = { label: "Unconfigured Domain", feeds: [
  { domain: "general", sources: ["Web Search"], status: "would-query" },
]};

function getManifest(ns) { return ROUTING_MANIFESTS[ns] || DEFAULT_MANIFEST; }

// ── JUDGMENT STATES ──
const JUDGMENT_STATES = [
  { id: "keep-in-view", label: "KEEP IN VIEW", color: "#FFD740", icon: "◇", desc: "Insufficient evidence to update. Continue monitoring." },
  { id: "confirmed", label: "CONFIRMED", color: "#69F0AE", icon: "✓", desc: "Posterior crossed into high confidence. Edge hypothesis holds." },
  { id: "rejected", label: "REJECTED", color: "#FF5252", icon: "✗", desc: "Contradictory evidence overwhelms the prior." },
  { id: "refined", label: "REFINED", color: "#40C4FF", icon: "◆", desc: "Hypothesis structure sharpened by new evidence." },
  { id: "reverse-rebuild", label: "REVERSE & REBUILD", color: "#FF4081", icon: "↺", desc: "Evidence demands reconsidering parent node judgment." },
];

// ── JUDGMENT STORAGE ──
// In-memory store (persists within session; Express sidecar would persist to disk)
const judgmentStore = {};

function storeJudgment(nodeY, judgment) {
  const key = nodeY.toFixed(4);
  if (!judgmentStore[key]) judgmentStore[key] = [];
  judgmentStore[key].push({
    ...judgment,
    timestamp: new Date().toISOString(),
  });
}

function getJudgments(nodeY) {
  return judgmentStore[nodeY.toFixed(4)] || [];
}

// ── JOMO/CLAUDE TARGETING ──
// JOMO/Claude = the configured instrument, not Claude alone.
// The DAG structure + routing manifest + judgment history = the configuration
// that earns the instrument a seat at the cognoscenti table.
async function targetEdge({ agent, fromNode, toNode, edgeWeight, manifest, priorJudgments, feedContext }) {
  const systemPrompt = `You are JOMO/Claude — a configured Bayesian causal intelligence instrument operating within a 399-node directed acyclic graph (the SFO-WAM). You are the nth member of a cognoscenti team that constitutes the POSTERIOR in a Bayesian inference system. The PRIOR is the viral-phenomenon layer — the raw observational data from knowledge-server feeds (news, reports, economic signals). Your role as a cognoscenti member is to interpret that viral evidence against the structural prior of the DAG, producing a posterior assessment of the edge hypothesis.

You are agent ${agentDisplay(agent.name)} (domain: ${manifest.label}, traversal rate: ${agent.coeff}, ZTP: ${agent.ztp}).

CRITICAL CONSTRAINTS:
- The viral layer senses. You reason. Do not reproduce viral noise — interpret it.
- Present your analysis as ONE cognoscenti input among several — do not claim final authority
- Distinguish structural inference (from the DAG topology) from evidential inference (from feeds)
- Flag where you lack domain expertise that a human cognoscenti would supply
- If geopolitical forerunners referenced in the feeds align with the structural position, state so explicitly
- The DAG topology is invariant — you cannot modify it, only interpret what its succession logic implies at this position`;

  const userPrompt = `EDGE TRAVERSAL ANALYSIS REQUEST

SOURCE NODE [BB=${fromNode.y}]:
${fromNode.attr || "(structural position only)"}

TARGET NODE [BB=${toNode.y}]:
${toNode.attr || "(structural position only)"}

EDGE WEIGHT: ${edgeWeight}
AGENT CURRENT Y: ${agent.currentY.toFixed(6)}
DAYS TO TARGET: ${agent.daysToTarget || "calculating..."}

KNOWLEDGE SERVER INTELLIGENCE (${manifest.label}):
${feedContext || "No live feeds currently loaded. Analysis based on structural position only."}

PRIOR JUDGMENTS AT CONNECTED NODES:
${priorJudgments.length > 0 ? priorJudgments.map(j => `BB=${j.node}: ${j.state} (${j.agent}, ${j.date})`).join("\n") : "No prior judgments recorded."}

TASK:
1. STRUCTURAL PRIOR: What does the DAG topology predict at this succession point?
2. VIRAL EVIDENCE: What do the knowledge-server feeds report? (sensing layer)
3. POSTERIOR ASSESSMENT: Given structural prior vs viral evidence, what is the updated state of this edge hypothesis?
4. COGNOSCENTI GAPS: Where do you lack expertise that a human member would supply?
5. RECOMMENDATION: What should the cognoscenti team consider before judgment?`;

  try {
    const response = await fetch("/api/digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        prompt: userPrompt,
        context: {
          source: "JOMO/Claude edge targeting",
          agent: agentDisplay(agent.name),
          namespace: agent.ns,
          manifest: manifest.label,
          fromNode: fromNode.y,
          toNode: toNode.y,
          edgeWeight,
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Digest sidecar returned HTTP ${response.status}`);
    }
    const text = data.digest || data.content?.map(b => b.type === "text" ? b.text : "").filter(Boolean).join("\n") || "No response received.";
    return { success: true, digest: text, timestamp: new Date().toISOString() };
  } catch (err) {
    return { success: false, digest: `JOMO/Claude targeting failed: ${err.message}. The instrument operates without this input — other cognoscenti may proceed.`, timestamp: new Date().toISOString() };
  }
}



// ── TNLDY TIME AUTHORITY ──
function computeTNLDY() {
  return (EPOCH + Date.now()) / MSD;
}

function tnldyToMs(z) { return z * MSD - EPOCH; }

function tnldyToDate(z) {
  return new Date(tnldyToMs(z));
}

const DISPLAY_TIME_ZONE = "Africa/Lagos";
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function isValidDate(d) { return d instanceof Date && !Number.isNaN(d.getTime()); }
function formatDisplayDateTime(d) { return isValidDate(d) ? DATE_TIME_FORMAT.format(d) : "—"; }
function formatDisplayDate(d) { return isValidDate(d) ? DATE_FORMAT.format(d) : "—"; }

function agentPosition(ztp, coeff, z) {
  if (coeff === 0) return 0;
  return (z - ztp) / coeff;
}

function agentTNLDY(ztp, coeff, y) {
  return coeff * y + ztp;
}

// ── BB NODE POSITION (maps Y to 0-399 range) ──
function yToBBNode(y, totalNodes = 399) {
  // Fractional part maps into the 399-node cycle
  const frac = ((y % 1) + 1) % 1;
  return Math.floor(frac * totalNodes);
}

// ── SFO NAMESPACE METADATA ──
// Each SFO is a System Functional Component — no semantic interpretation exposed
const SFO_COLORS = [
  "#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#F0E68C",
  "#FF7F50","#87CEEB","#98FB98","#FFA07A","#B0C4DE","#DEB887","#FFD700",
  "#00FFFF","#00FF7F","#FF4500","#BA55D3","#191970","#32CD32","#FF69B4",
  "#8A2BE2","#20B2AA","#CD853F","#E6E6FA","#FFB6C1","#AFEEEE","#DB7093",
  "#FFDAB9","#BC8F8F","#4682B4","#D2691E","#6B8E23","#708090","#9ACD32",
  "#FA8072","#7B68EE","#48D1CC","#C71585","#BDB76B","#5F9EA0","#D2B48C",
  "#8FBC8F","#E9967A","#9370DB","#3CB371","#B8860B","#2E8B57","#DAA520",
  "#CD5C5C","#4169E1","#A0522D","#6A5ACD","#808000","#778899","#66CDAA","#F4A460"
];

function getSfoMeta(ns) {
  const idx = parseInt(ns.replace("sfo", "").replace("other", "99")) || 0;
  return { 
    label: nsDisplay(ns), 
    domain: "System Functional Component", 
    color: SFO_COLORS[idx % SFO_COLORS.length] 
  };
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ── LIVE TIME AUTHORITY HEADER ──
function TimeAuthority({ z, viewZ, viewY, viewDate, isTraveling, tick, travelSfo, agentCount }) {
  const t = useTheme();
  const date = tnldyToDate(z);
  const exeTpdpY = agentPosition(17651.8, 100, z);
  const bbNode = yToBBNode(viewY);
  
  return (
    <div style={{
      background: isTraveling 
        ? "linear-gradient(135deg, #1a0a2e 0%, #2a0a3e 50%, #1a0a28 100%)"
        : "linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 50%, #0a1628 100%)",
      borderBottom: `1px solid ${isTraveling ? "rgba(192,128,255,0.3)" : "rgba(255,215,0,0.3)"}`,
      padding: "12px 20px",
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr 1fr",
      gap: "16px",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: "11px",
    }}>
      <div>
        <div style={{ color: t.text.secondary, marginBottom: 2 }}>TNLDY ABSOLUTE</div>
        <div style={{ color: t.accent.cyan, fontSize: "14px", fontWeight: 700 }}>
          {z.toFixed(6)}
        </div>
        <div style={{ color: t.text.muted, fontSize: "9px" }}>{formatDisplayDateTime(date)} WAT</div>
      </div>
      <div>
        <div style={{ color: t.text.secondary, marginBottom: 2 }}>{isTraveling ? "VIEW Y (TIME-TRAVEL)" : `VIEW Y (${nsDisplay(travelSfo)})`}</div>
        <div style={{ color: isTraveling ? "#c080ff" : "#FFD740", fontSize: "14px", fontWeight: 700 }}>
          Y = {viewY.toFixed(6)}
        </div>
        <div style={{ color: t.text.muted, fontSize: "9px" }}>
          BB Node: {bbNode}/399 | View Z: {viewZ.toFixed(4)}
        </div>
      </div>
      <div>
        <div style={{ color: t.text.secondary, marginBottom: 2 }}>GPBS STEADY-STATE</div>
        <div style={{ color: t.accent.gold, fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FFD740", display: "inline-block", boxShadow: "0 0 8px #FFD740" }} />
          ATDF
        </div>
        <div style={{ color: t.text.muted, fontSize: "9px" }}>Alternative Trade & Dev Finance</div>
      </div>
      <div>
        <div style={{ color: t.text.secondary, marginBottom: 2 }}>JOMO ENGINE</div>
        <div style={{ color: isTraveling ? "#c080ff" : "#69F0AE", fontSize: "14px", fontWeight: 700 }}>
          {isTraveling ? "TIME-TRAVEL" : `${agentCount} AGENTS LIVE`}
        </div>
        <div style={{ color: t.text.muted, fontSize: "9px" }}>
          Tick #{tick} | {isTraveling ? `Viewing: ${formatDisplayDate(viewDate)}` : "1 Hz"}
        </div>
      </div>
    </div>
  );
}

// ── AGENT PARALLELIZATION HEATMAP ──
function AgentHeatmap({ agents, z, selectedNs, onSelectNs }) {
  const t = useTheme();
  const nsGroups = useMemo(() => {
    const groups = {};
    agents.forEach(a => {
      if (!groups[a.ns]) groups[a.ns] = [];
      groups[a.ns].push(a);
    });
    return groups;
  }, [agents]);

  const nsList = useMemo(() => 
    Object.keys(nsGroups).sort((a, b) => nsGroups[b].length - nsGroups[a].length),
    [nsGroups]
  );

  return (
    <div style={{ padding: "12px" }}>
      <div style={{ 
        color: t.text.secondary, fontSize: "10px", marginBottom: 8, 
        textTransform: "uppercase", letterSpacing: "2px" 
      }}>
        Agent Parallelization Matrix — 57 SFO Namespaces
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
        {nsList.map(ns => {
          const meta = getSfoMeta(ns);
          const count = nsGroups[ns].length;
          const isSelected = selectedNs === ns;
          const avgY = nsGroups[ns].reduce((s, a) => {
            const y = agentPosition(a.ztp, a.coeff, z);
            return s + (isFinite(y) ? Math.abs(y % 1) : 0);
          }, 0) / count;
          
          return (
            <div
              key={ns}
              onClick={() => onSelectNs(isSelected ? null : ns)}
              style={{
                width: Math.max(24, Math.sqrt(count) * 12),
                height: Math.max(24, Math.sqrt(count) * 12),
                background: isSelected 
                  ? meta.color 
                  : `rgba(${parseInt(meta.color.slice(1,3),16)},${parseInt(meta.color.slice(3,5),16)},${parseInt(meta.color.slice(5,7),16)},${0.15 + avgY * 0.6})`,
                border: isSelected ? `2px solid ${meta.color}` : "1px solid rgba(255,255,255,0.05)",
                borderRadius: 3,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "8px",
                color: isSelected ? "#000" : "#aaa",
                fontWeight: isSelected ? 700 : 400,
                transition: "all 0.2s",
                position: "relative",
              }}
              title={`${meta.label} — ${count} agents`}
            >
              {count}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── NAMESPACE DETAIL PANEL ──
function NsDetailPanel({ ns, agents, z, selectedAgent, onSelectAgent }) {
  const t = useTheme();
  const meta = getSfoMeta(ns);
  const nsAgents = agents.filter(a => a.ns === ns);
  
  return (
    <div style={{
      background: t.bg.card,
      border: `1px solid ${meta.color}33`,
      borderRadius: 6,
      padding: 12,
      marginTop: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <span style={{ color: meta.color, fontWeight: 700, fontSize: 13 }}>{meta.label}</span>
          <span style={{ color: t.text.secondary, fontSize: 10, marginLeft: 8 }}>{meta.domain}</span>
        </div>
        <span style={{ 
          background: `${meta.color}22`, color: meta.color, 
          padding: "2px 8px", borderRadius: 10, fontSize: 10 
        }}>
          {nsAgents.length} agents
        </span>
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 10 }}>
        {nsAgents.map((a, i) => {
          const y = agentPosition(a.ztp, a.coeff, z);
          const bb = yToBBNode(y);
          const inRange = isFinite(y);
          return (
            <div key={i} onClick={() => onSelectAgent && onSelectAgent(a)} style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 50px 120px",
              gap: 8,
              padding: "3px 0",
              borderBottom: `1px solid ${t.border.subtle}`,
              color: inRange ? "#ccc" : "#555",
              cursor: "pointer",
              background: selectedAgent && selectedAgent.name === a.name ? "rgba(255,69,0,0.12)" : "transparent",
              borderLeft: selectedAgent && selectedAgent.name === a.name ? "2px solid #FF4500" : "2px solid transparent",
              paddingLeft: 4,
            }}>
              <div style={{ 
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9 
              }}>
                {agentDisplay(a.name)}
              </div>
              <div style={{ color: t.accent.cyan, textAlign: "right" }}>
                Y={inRange ? y.toFixed(4) : "∞"}
              </div>
              <div style={{ color: t.accent.gold, textAlign: "right" }}>
                BB:{inRange ? bb : "—"}
              </div>
              <div style={{ color: t.accent.green, textAlign: "right" }}>
                A:{a.coeff} C:{a.ztp}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── GPBS THERMODYNAMIC PANEL ──
function GPBSPanel({ z }) {
  const t = useTheme();
  const devices = Object.values(GPBS_DEVICES);
  
  return (
    <div style={{
      background: "rgba(255,215,0,0.03)",
      border: "1px solid rgba(255,215,0,0.15)",
      borderRadius: 6,
      padding: 12,
    }}>
      <div style={{ color: t.accent.gold, fontSize: 11, fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>
        GPBS HEAT ENGINE — STEADY-STATE DEVICES
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {devices.map(d => (
          <div key={d.name} style={{
            background: d.active ? `${d.color}15` : "rgba(255,255,255,0.02)",
            border: `1px solid ${d.active ? d.color + '44' : 'rgba(255,255,255,0.05)'}`,
            borderRadius: 4,
            padding: 8,
            position: "relative",
          }}>
            {d.active && (
              <div style={{
                position: "absolute", top: 4, right: 4,
                width: 6, height: 6, borderRadius: "50%",
                background: d.color,
                boxShadow: `0 0 8px ${d.color}`,
                animation: "pulse 2s infinite",
              }} />
            )}
            <div style={{ color: d.color, fontWeight: 700, fontSize: 12 }}>{d.name}</div>
            <div style={{ color: t.text.secondary, fontSize: 9 }}>{d.desc}</div>
            <div style={{ 
              color: d.active ? "#FFD740" : "#444", 
              fontSize: 9, marginTop: 4,
              fontWeight: d.active ? 700 : 400 
            }}>
              {d.active ? "● ACTIVE STEADY-STATE" : "○ Standby"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CITIES OF THE FUTURE GRID ──
function CitiesGrid({ z }) {
  const t = useTheme();
  const exeY = agentPosition(17651.8, 100, z);
  
  return (
    <div style={{
      background: "rgba(50,205,50,0.03)",
      border: "1px solid rgba(50,205,50,0.15)",
      borderRadius: 6,
      padding: 12,
    }}>
      <div style={{ 
        color: t.accent.green, fontSize: 11, fontWeight: 700, marginBottom: 4, letterSpacing: 1 
      }}>
        32 CITIES OF THE FUTURE — ALTERNATIVE HAVENS ZONE
      </div>
      <div style={{ color: t.text.secondary, fontSize: 9, marginBottom: 8 }}>
        Sub-Saharan Africa International Refuge & Desert Cities | GPBS-ATDF Financed
      </div>
      <div style={{ 
        display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 3,
        maxHeight: 180, overflowY: "auto" 
      }}>
        {CITIES_OF_FUTURE.map(c => {
          const phase = ((exeY * 32 + c.id) % 5);
          const phaseColors = ["#FF6B6B", "#FFD740", "#4ECDC4", "#69F0AE", "#B388FF"];
          const phaseNames = ["PLAN", "DESIGN", "BUILD", "TEST", "LIVE"];
          return (
            <div key={c.id} style={{
              background: `${phaseColors[Math.floor(phase)]}11`,
              border: `1px solid ${phaseColors[Math.floor(phase)]}33`,
              borderRadius: 3,
              padding: "4px 3px",
              fontSize: 7,
              textAlign: "center",
              cursor: "pointer",
            }}
            title={`${c.name} — ${c.zone}\nLat: ${c.lat}, Lng: ${c.lng}`}
            >
              <div style={{ color: phaseColors[Math.floor(phase)], fontWeight: 700 }}>{c.id}</div>
              <div style={{ color: t.text.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name.split(" ")[0]}
              </div>
              <div style={{ color: t.text.muted, fontSize: 6 }}>{phaseNames[Math.floor(phase)]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── JOMO SUPERPROCESS FLOW VISUALIZATION ──
function JOMOFlow({ z, agents }) {
  const t = useTheme();
  const canvasRef = useRef(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.parentElement.clientWidth;
    const h = canvas.height = 160;
    
    ctx.clearRect(0, 0, w, h);
    
    // Background
    ctx.fillStyle = "#060610";
    ctx.fillRect(0, 0, w, h);
    
    // Draw agent positions as flowing particles
    const activeAgents = agents.slice(0, 200); // Sample for performance
    activeAgents.forEach((a, i) => {
      const y = agentPosition(a.ztp, a.coeff, z);
      if (!isFinite(y) || Math.abs(y) > 1000) return;
      
      const frac = ((y % 1) + 1) % 1;
      const x = frac * w;
      const row = (i / activeAgents.length) * h;
      
      const meta = getSfoMeta(a.ns);
      const r = parseInt(meta.color.slice(1, 3), 16);
      const g = parseInt(meta.color.slice(3, 5), 16);
      const b = parseInt(meta.color.slice(5, 7), 16);
      
      ctx.beginPath();
      ctx.arc(x, row, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},0.6)`;
      ctx.fill();
      
      // Trail
      ctx.beginPath();
      ctx.moveTo(x, row);
      ctx.lineTo(x - 15, row);
      ctx.strokeStyle = `rgba(${r},${g},${b},0.15)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    
    // JOMO label
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.font = "bold 48px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("JOMO", w / 2, h / 2 + 16);
    
    // Axis markers
    ctx.fillStyle = "#333";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText("BB:0", 4, h - 4);
    ctx.textAlign = "center";
    ctx.fillText("BB:199", w / 2, h - 4);
    ctx.textAlign = "right";
    ctx.fillText("BB:399", w - 4, h - 4);
    
  }, [z, agents]);
  
  return (
    <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${t.border.card}` }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%" }} />
    </div>
  );
}

// ── AGENT STATISTICS PANEL ──
function AgentStats({ agents, z }) {
  const t = useTheme();
  const stats = useMemo(() => {
    let atNode = 0, inTransit = 0, outOfRange = 0;
    const nsActive = new Set();
    
    agents.forEach(a => {
      const y = agentPosition(a.ztp, a.coeff, z);
      if (!isFinite(y) || Math.abs(y) > 10000) {
        outOfRange++;
      } else {
        const frac = ((y % 1) + 1) % 1;
        const bb = Math.floor(frac * 399);
        if (frac < 0.005 || frac > 0.995) atNode++;
        else inTransit++;
        nsActive.add(a.ns);
      }
    });
    
    return { atNode, inTransit, outOfRange, activeNs: nsActive.size };
  }, [agents, z]);
  
  return (
    <div style={{ 
      display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8,
      padding: "8px 12px" 
    }}>
      {[
        { label: "AT NODE", value: stats.atNode, color: t.accent.green },
        { label: "IN TRANSIT", value: stats.inTransit, color: t.accent.cyan },
        { label: "OUT OF RANGE", value: stats.outOfRange, color: "#FF6B6B" },
        { label: "ACTIVE NS", value: `${stats.activeNs}/57`, color: t.accent.gold },
      ].map(s => (
        <div key={s.label} style={{
          background: `${s.color}08`,
          border: `1px solid ${s.color}22`,
          borderRadius: 4,
          padding: "6px 8px",
          textAlign: "center",
        }}>
          <div style={{ color: s.color, fontSize: 18, fontWeight: 700 }}>{s.value}</div>
          <div style={{ color: t.text.secondary, fontSize: 8, letterSpacing: 1 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── IMPLEMENTATION GUIDE PANEL ──
function ImplementationPhases() {
  const t = useTheme();
  const phases = [
    { id: 3, name: "JOMO Agent Deployment", status: "LIVE", color: t.accent.green, desc: "759 agents parallelized on SFO-WAM topology" },
    { id: 4, name: "Persistence (Express Sidecar)", status: "NEXT", color: t.accent.gold, desc: "Observation layer survives page refresh" },
    { id: 5, name: "Calibration Map", status: "QUEUE", color: t.text.secondary, desc: "Projection delta overlay on DAG canvas" },
    { id: 6, name: "Digest Engine (Claude API)", status: "QUEUE", color: t.text.secondary, desc: "AI-generated bounded context digests" },
    { id: 7, name: "Multi-Agent Restructure", status: "QUEUE", color: t.text.secondary, desc: "Universal Agent.jsx + registry pattern" },
    { id: 8, name: "SFO Creation Interface", status: "QUEUE", color: t.text.secondary, desc: "On-the-fly agent quickening from observed events" },
    { id: 9, name: "32 Cities of the Future", status: "PLANNING", color: "#B388FF", desc: "GPBS-ATDF financed Alternative Havens build" },
  ];
  
  return (
    <div style={{
      background: t.bg.card,
      borderRadius: 6,
      padding: 12,
      border: `1px solid ${t.border.card}`,
    }}>
      <div style={{ color: t.text.secondary, fontSize: 10, fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>
        IMPLEMENTATION ROADMAP
      </div>
      {phases.map(p => (
        <div key={p.id} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "4px 0",
          borderBottom: `1px solid ${t.border.subtle}`,
        }}>
          <span style={{
            background: `${p.color}22`, color: p.color,
            padding: "1px 6px", borderRadius: 3,
            fontSize: 8, fontWeight: 700, minWidth: 44, textAlign: "center"
          }}>
            {p.status}
          </span>
          <span style={{ color: t.text.heading, fontSize: 10 }}>Phase {p.id}:</span>
          <span style={{ color: t.text.secondary, fontSize: 10 }}>{p.name}</span>
          <span style={{ color: t.text.muted, fontSize: 8, marginLeft: "auto" }}>{p.desc}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// OPERATIONS — COGNOSCENTI TARGETING TAB
// ═══════════════════════════════════════════════════════════════

function RoutingManifestPanel({ ns }) {
  const t = useTheme();
  const manifest = getManifest(ns);
  const statusColor = { "live": "#69F0AE", "configured": "#FFD740", "would-query": "#555" };
  const statusIcon = { "live": "●", "configured": "◆", "would-query": "○" };
  
  return (
    <div style={{ background: t.bg.card, border: `1px solid ${t.border.card}`, padding: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: t.text.secondary, marginBottom: 6 }}>
        ROUTING MANIFEST — {nsDisplay(ns)}
      </div>
      <div style={{ fontSize: 9, color: t.text.muted, marginBottom: 8 }}>{manifest.label}</div>
      {manifest.feeds.map((f, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 10 }}>
          <span style={{ color: statusColor[f.status] }}>{statusIcon[f.status]}</span>
          <span style={{ color: t.text.secondary, minWidth: 90 }}>{f.domain}</span>
          <span style={{ color: t.text.secondary }}>{f.sources.join(" · ")}</span>
          <span style={{ marginLeft: "auto", fontSize: 8, color: statusColor[f.status], textTransform: "uppercase", letterSpacing: 1 }}>{f.status}</span>
        </div>
      ))}
    </div>
  );
}

function EdgeInView({ agent, nodes, z }) {
  const t = useTheme();
  if (!agent) return null;
  const y = agentPosition(agent.ztp, agent.coeff, z);
  const sortedNodes = [...nodes].sort((a, b) => a.y - b.y);
  
  // Find surrounding nodes
  let fromNode = null, toNode = null;
  for (let i = 0; i < sortedNodes.length - 1; i++) {
    if (sortedNodes[i].y <= y && sortedNodes[i + 1].y > y) {
      fromNode = sortedNodes[i];
      toNode = sortedNodes[i + 1];
      break;
    }
  }
  
  if (!fromNode || !toNode) return (
    <div style={{ color: t.text.muted, fontSize: 10, padding: 8 }}>Agent outside DAG range.</div>
  );
  
  const edgeWeight = (toNode.y - fromNode.y).toFixed(4);
  const progress = ((y - fromNode.y) / (toNode.y - fromNode.y) * 100).toFixed(1);
  const daysToTarget = ((toNode.y - y) * agent.coeff).toFixed(1);
  
  return (
    <div style={{ background: "rgba(255,69,0,0.04)", border: "1px solid rgba(255,69,0,0.12)", padding: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: t.accent.brand, marginBottom: 6 }}>
        EDGE IN VIEW
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: t.accent.green, fontSize: 12, fontWeight: 700 }}>BB {fromNode.y.toFixed(4)}</div>
          <div style={{ color: t.text.muted, fontSize: 8 }}>SOURCE (passed)</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: t.accent.purple, fontSize: 10 }}>→ {edgeWeight} →</div>
          <div style={{ background: "rgba(192,128,255,0.1)", borderRadius: 4, padding: "2px 6px", fontSize: 8, color: t.accent.purple }}>{progress}% traversed</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: t.accent.gold, fontSize: 12, fontWeight: 700 }}>BB {toNode.y.toFixed(4)}</div>
          <div style={{ color: t.text.muted, fontSize: 8 }}>TARGET ({daysToTarget} days)</div>
        </div>
      </div>
      <div style={{ fontSize: 9, color: t.text.secondary, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 6 }}>
        Prior: Z = {agent.coeff}·Y + {agent.ztp} | Current Y = {y.toFixed(6)} | BB Node {yToBBNode(y)}/399
      </div>
    </div>
  );
}

function CognoscentiPanel({ agent, nodes, z, onJudge }) {
  const t = useTheme();
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [memberInputs, setMemberInputs] = useState([]);
  const [newInput, setNewInput] = useState({ author: "", analysis: "" });
  const [showAddMember, setShowAddMember] = useState(false);
  
  if (!agent) return (
    <div style={{ color: t.text.muted, fontSize: 11, textAlign: "center", padding: 30 }}>
      Select an agent from the Time Travel panel or AGENTS tab to begin targeting.
    </div>
  );
  
  const y = agentPosition(agent.ztp, agent.coeff, z);
  const sortedNodes = []; // placeholder — node schedule computed from DAG when live
  const manifest = getManifest(agent.ns);
  const nodeJudgments = getJudgments(y);
  
  const handleTarget = async () => {
    setLoading(true);
    // Build structural context from DAG position
    const fromY = Math.floor(y * 100) / 100;
    const toY = Math.ceil((y + 0.5) * 100) / 100;
    
    const result = await targetEdge({
      agent: { ...agent, currentY: y, daysToTarget: "~" + ((toY - y) * agent.coeff).toFixed(0) },
      fromNode: { y: fromY, attr: `Structural position BB=${fromY} in the SFO-WAM causal constitution` },
      toNode: { y: toY, attr: `Target position BB=${toY} — successor node in the DAG` },
      edgeWeight: (toY - fromY).toFixed(4),
      manifest,
      priorJudgments: nodeJudgments.map(j => ({ node: y.toFixed(2), state: j.state, agent: j.agentAlias, date: j.timestamp?.slice(0, 10) })),
      feedContext: manifest.feeds.filter(f => f.status === "live").map(f => `[${f.domain}] ${f.sources.join(", ")} — configured and monitoring`).join("\n") || null,
    });
    setDigest(result);
    setLoading(false);
  };
  
  const handleAddMember = () => {
    if (newInput.author && newInput.analysis) {
      setMemberInputs(prev => [...prev, { ...newInput, timestamp: new Date().toISOString() }]);
      setNewInput({ author: "", analysis: "" });
      setShowAddMember(false);
    }
  };
  
  return (
    <div>
      {/* JOMO/Claude Targeting Cell */}
      <div style={{ background: "rgba(192,128,255,0.04)", border: "1px solid rgba(192,128,255,0.12)", padding: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <span style={{ color: t.accent.purple, fontSize: 11, fontWeight: 700 }}>◆ JOMO/Claude</span>
            <span style={{ color: t.text.muted, fontSize: 9, marginLeft: 8 }}>nth member of cognoscenti team</span>
          </div>
          <button 
            onClick={handleTarget}
            disabled={loading}
            style={{
              background: loading ? "rgba(192,128,255,0.05)" : "rgba(192,128,255,0.12)",
              border: "1px solid rgba(192,128,255,0.25)",
              color: loading ? "#666" : "#c080ff",
              padding: "5px 14px", cursor: loading ? "wait" : "pointer",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            {loading ? "TARGETING..." : "TARGET EDGE"}
          </button>
        </div>
        
        {!digest && !loading && (
          <div style={{ color: t.text.muted, fontSize: 9, lineHeight: 1.6, padding: "8px 0" }}>
            The configured instrument is ready. Press TARGET EDGE to produce a posterior 
            assessment: the viral layer (knowledge-server feeds) provides the prior evidence; 
            JOMO/Claude interprets it against the structural DAG position. This digest is one 
            cognoscenti input — the viral layer senses, the cognoscenti reason.
          </div>
        )}
        
        {loading && (
          <div style={{ color: t.accent.purple, fontSize: 10, padding: "12px 0", textAlign: "center" }}>
            <span style={{ animation: "pulse 1.5s infinite" }}>◆</span> JOMO/Claude is analyzing the edge...
          </div>
        )}
        
        {digest && (
          <div style={{ 
            background: t.isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.04)", border: "1px solid rgba(192,128,255,0.08)", 
            padding: 10, fontSize: 10, color: t.text.primary, lineHeight: 1.7,
            maxHeight: 250, overflowY: "auto", whiteSpace: "pre-wrap",
          }}>
            {digest.digest}
            <div style={{ marginTop: 8, fontSize: 8, color: t.text.muted, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 4 }}>
              Generated: {digest.timestamp?.slice(0, 19)} | {digest.success ? "API call succeeded" : "Fallback mode"}
            </div>
          </div>
        )}
      </div>
      
      {/* Other Cognoscenti Members */}
      <div style={{ background: t.bg.card, border: `1px solid ${t.border.card}`, padding: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ color: t.text.secondary, fontSize: 10, fontWeight: 600, letterSpacing: 1 }}>COGNOSCENTI TEAM INPUTS</span>
          <button onClick={() => setShowAddMember(!showAddMember)} style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${t.border.card}`,
            color: t.text.secondary, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 9,
          }}>+ ADD MEMBER INPUT</button>
        </div>
        
        {memberInputs.length === 0 && !showAddMember && (
          <div style={{ color: t.text.muted, fontSize: 9, padding: "8px 0" }}>
            No other cognoscenti inputs recorded for this position. Add domain expert analysis, 
            institutional reports, or practitioner observations to inform the judgment.
          </div>
        )}
        
        {memberInputs.map((m, i) => (
          <div key={i} style={{ borderLeft: "2px solid #40C4FF", paddingLeft: 10, marginBottom: 8, fontSize: 10 }}>
            <div style={{ color: t.accent.blue, fontWeight: 700, marginBottom: 2 }}>◇ {m.author}</div>
            <div style={{ color: t.text.secondary, lineHeight: 1.6 }}>{m.analysis}</div>
            <div style={{ color: t.text.muted, fontSize: 8 }}>{m.timestamp?.slice(0, 19)}</div>
          </div>
        ))}
        
        {showAddMember && (
          <div style={{ background: "rgba(64,196,255,0.04)", border: "1px solid rgba(64,196,255,0.1)", padding: 10, marginTop: 8 }}>
            <input
              value={newInput.author}
              onChange={e => setNewInput(p => ({ ...p, author: e.target.value }))}
              placeholder="Cognoscenti member name / role"
              style={{ width: "100%", background: t.bg.input, border: `1px solid ${t.border.card}`, color: t.text.primary, fontFamily: "inherit", fontSize: 11, padding: "5px 8px", marginBottom: 6 }}
            />
            <textarea
              value={newInput.analysis}
              onChange={e => setNewInput(p => ({ ...p, analysis: e.target.value }))}
              placeholder="Analysis, observations, domain expertise, references..."
              rows={4}
              style={{ width: "100%", background: t.bg.input, border: `1px solid ${t.border.card}`, color: t.text.primary, fontFamily: "inherit", fontSize: 11, padding: "5px 8px", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button onClick={handleAddMember} style={{ background: "rgba(64,196,255,0.12)", border: "1px solid rgba(64,196,255,0.25)", color: t.accent.blue, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 700 }}>SUBMIT</button>
              <button onClick={() => setShowAddMember(false)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: t.text.secondary, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 10 }}>CANCEL</button>
            </div>
          </div>
        )}
      </div>
      
      {/* Judgment Controls */}
      <div style={{ background: t.bg.card, border: `1px solid ${t.border.card}`, padding: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: t.text.secondary, marginBottom: 8 }}>
          JUDGMENT — Adjudicate across all cognoscenti inputs
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {JUDGMENT_STATES.map(j => (
            <button key={j.id} onClick={() => {
              storeJudgment(y, {
                state: j.id,
                agentAlias: agentDisplay(agent.name),
                agentName: agent.name,
                ns: agent.ns,
                y: y,
                bb: yToBBNode(y),
                cognoscentiInputs: [
                  digest ? { source: "JOMO/Claude", summary: digest.digest?.substring(0, 200) } : null,
                  ...memberInputs.map(m => ({ source: m.author, summary: m.analysis?.substring(0, 200) })),
                ].filter(Boolean),
              });
              onJudge && onJudge(j.id);
            }} title={j.desc} style={{
              background: `${j.color}10`,
              border: `1px solid ${j.color}33`,
              color: j.color,
              padding: "6px 12px",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, fontWeight: 700,
              letterSpacing: 0.5,
              transition: "all 0.15s",
            }}>
              {j.icon} {j.label}
            </button>
          ))}
        </div>
        
        {/* Judgment History */}
        {nodeJudgments.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8 }}>
            <div style={{ fontSize: 8, textTransform: "uppercase", color: t.text.muted, marginBottom: 4 }}>PRIOR JUDGMENTS AT THIS POSITION</div>
            {nodeJudgments.slice(-5).reverse().map((j, i) => {
              const jState = JUDGMENT_STATES.find(s => s.id === j.state);
              return (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 9, marginBottom: 3, alignItems: "center" }}>
                  <span style={{ color: jState?.color || "#555" }}>{jState?.icon || "?"}</span>
                  <span style={{ color: jState?.color || "#555", fontWeight: 700, minWidth: 90 }}>{j.state}</span>
                  <span style={{ color: t.text.secondary }}>{j.agentAlias}</span>
                  <span style={{ color: t.text.muted, marginLeft: "auto" }}>{j.timestamp?.slice(0, 10)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function OperationsTab({ agent, agents, z, onJudge }) {
  const t = useTheme();
  const manifest = agent ? getManifest(agent.ns) : null;
  
  // Build a simple node list from agent registry for EdgeInView
  const nodeList = useMemo(() => {
    const yValues = new Set();
    // Generate 399 evenly-spaced nodes as proxy (full CSV would give exact positions)
    for (let i = 0; i < 399; i++) {
      yValues.add(-147.6 + (i * 360.0 / 398));
    }
    return [...yValues].sort((a, b) => a - b).map(y => ({ y }));
  }, []);
  
  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 12 }}>
      {/* Left: Agent status + routing */}
      <div>
        {/* Agent Status */}
        {agent ? (
          <div style={{ background: "rgba(255,69,0,0.04)", border: "1px solid rgba(255,69,0,0.12)", padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: t.accent.brand, marginBottom: 6 }}>ACTIVE AGENT</div>
            <div style={{ color: t.accent.brand, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{agentDisplay(agent.name)}</div>
            <div style={{ fontSize: 10, color: t.text.secondary, marginBottom: 2 }}>Domain: {nsDisplay(agent.ns)} · A={agent.coeff} · C={agent.ztp}</div>
            <div style={{ fontSize: 10, color: t.accent.purple }}>
              Y = {agentPosition(agent.ztp, agent.coeff, z).toFixed(6)} · BB Node {yToBBNode(agentPosition(agent.ztp, agent.coeff, z))}/399
            </div>
          </div>
        ) : (
          <div style={{ background: t.bg.card, border: `1px dashed ${t.border.card}`, padding: 20, textAlign: "center", color: t.text.muted, fontSize: 10 }}>
            No agent selected. Choose from the Time Travel panel or AGENTS tab.
          </div>
        )}
        
        {/* Edge in View */}
        {agent && <EdgeInView agent={agent} nodes={nodeList} z={z} />}
        
        {/* Routing Manifest */}
        {agent && <RoutingManifestPanel ns={agent.ns} />}
        
        {/* Architecture Note */}
        <div style={{ background: t.bg.cardAlt, border: "1px solid rgba(255,255,255,0.04)", padding: 10, fontSize: 9, color: t.text.muted, lineHeight: 1.6 }}>
          <div style={{ color: t.text.secondary, fontWeight: 700, marginBottom: 4 }}>BAYESIAN TARGETING ARCHITECTURE</div>
          <strong style={{ color: t.text.muted }}>Prior (viral layer):</strong> Knowledge-server feeds — the raw observational field (noisy, biased, but containing signal)<br/>
          <strong style={{ color: t.text.muted }}>Structural prior:</strong> Edge weight + DAG position + accumulated parent judgments<br/>
          <strong style={{ color: t.text.muted }}>Posterior (cognoscenti):</strong> Expert interpretation — JOMO/Claude + domain experts contextualise, test, refine<br/>
          <strong style={{ color: t.text.muted }}>Decision:</strong> Five-state judgment by human adjudicator synthesising across all cognoscenti<br/>
          <br/>
          Viral systems sense. Cognoscenti systems reason. 
          The configured JOMO/Claude instrument is one seat at the 
          cognoscenti table — other human domain experts contribute 
          independently. The DAG mediates the balance between 
          sensing and reasoning.
        </div>
      </div>
      
      {/* Right: Cognoscenti panel */}
      <div>
        <CognoscentiPanel agent={agent} nodes={nodeList} z={z} onJudge={onJudge} />
      </div>
    </div>
  );
}

// ── SECRET ROSETTA STONE PANEL (7-tap reveal) ──
function RosettaStone({ visible, onClose, agents }) {
  const t = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const [tab, setTab] = useState("NS");
  
  if (!visible) return null;
  
  const nsEntries = Object.entries(NS_ALIAS).sort((a,b) => a[0].localeCompare(b[0]));
  const agentEntries = Object.entries(AGENT_ALIAS).sort((a,b) => a[1].localeCompare(b[1]));
  
  const filteredNs = searchTerm 
    ? nsEntries.filter(([k,v]) => k.toLowerCase().includes(searchTerm.toLowerCase()) || v.toLowerCase().includes(searchTerm.toLowerCase()))
    : nsEntries;
  const filteredAgents = searchTerm
    ? agentEntries.filter(([k,v]) => k.toLowerCase().includes(searchTerm.toLowerCase()) || v.toLowerCase().includes(searchTerm.toLowerCase()))
    : agentEntries;
    
  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0,
      width: 520, 
      background: t.bg.rosetta,
      borderLeft: "1px solid rgba(255,69,0,0.3)",
      zIndex: 9999,
      display: "flex", flexDirection: "column",
      fontFamily: "'JetBrains Mono', monospace",
      boxShadow: "-8px 0 32px rgba(0,0,0,0.6)",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,69,0,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ color: t.accent.brand, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>ROSETTA STONE</span>
          <span style={{ color: t.text.muted, fontSize: 9, marginLeft: 10 }}>SFO ↔ ALIAS MAPPING</span>
        </div>
        <button onClick={onClose} style={{ background: "rgba(255,69,0,0.1)", border: "1px solid rgba(255,69,0,0.3)", color: t.accent.brand, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 10 }}>CLOSE</button>
      </div>
      
      {/* Search + Tabs */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <input
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search original or alias..."
          style={{ width: "100%", background: t.bg.input, border: "1px solid rgba(255,69,0,0.15)", color: t.text.primary, fontFamily: "inherit", fontSize: 11, padding: "6px 10px", marginBottom: 8 }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {["NS", "AGENTS"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? "rgba(255,69,0,0.15)" : "transparent",
              color: tab === t ? "#FF4500" : "#666",
              border: tab === t ? "1px solid rgba(255,69,0,0.3)" : "1px solid transparent",
              padding: "3px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 600, letterSpacing: 1,
            }}>{t} ({t === "NS" ? filteredNs.length : filteredAgents.length})</button>
          ))}
        </div>
      </div>
      
      {/* Table */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
        {tab === "NS" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: t.bg.body }}>
                <th style={{ textAlign: "left", padding: "8px 6px", color: t.accent.brand, borderBottom: "1px solid rgba(255,69,0,0.2)" }}>ORIGINAL</th>
                <th style={{ textAlign: "left", padding: "8px 6px", color: t.accent.green, borderBottom: "1px solid rgba(255,69,0,0.2)" }}>ALIAS</th>
                <th style={{ textAlign: "right", padding: "8px 6px", color: t.text.muted, borderBottom: "1px solid rgba(255,69,0,0.2)" }}>AGENTS</th>
              </tr>
            </thead>
            <tbody>
              {filteredNs.map(([original, alias]) => (
                <tr key={original} style={{ borderBottom: `1px solid ${t.border.subtle}` }}>
                  <td style={{ padding: "5px 6px", color: t.accent.purple }}>{original}</td>
                  <td style={{ padding: "5px 6px", color: t.accent.green, fontWeight: 700 }}>{alias}</td>
                  <td style={{ padding: "5px 6px", color: t.text.muted, textAlign: "right" }}>{agents.filter(a => a.ns === original).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "AGENTS" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: t.bg.body }}>
                <th style={{ textAlign: "left", padding: "8px 4px", color: t.accent.green, borderBottom: "1px solid rgba(255,69,0,0.2)" }}>ALIAS</th>
                <th style={{ textAlign: "left", padding: "8px 4px", color: t.accent.brand, borderBottom: "1px solid rgba(255,69,0,0.2)" }}>ORIGINAL</th>
                <th style={{ textAlign: "left", padding: "8px 4px", color: t.text.muted, borderBottom: "1px solid rgba(255,69,0,0.2)" }}>NS</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map(([original, alias]) => {
                const agent = agents.find(a => a.name === original);
                return (
                  <tr key={original} style={{ borderBottom: `1px solid ${t.border.subtle}` }}>
                    <td style={{ padding: "4px", color: t.accent.green, fontWeight: 700 }}>{alias}</td>
                    <td style={{ padding: "4px", color: t.accent.purple, wordBreak: "break-all" }}>{original}</td>
                    <td style={{ padding: "4px", color: t.text.muted }}>{agent ? agent.ns : "?"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Footer */}
      <div style={{ padding: "8px 16px", borderTop: "1px solid rgba(255,69,0,0.1)", fontSize: 9, color: t.text.muted }}>
        {Object.keys(NS_ALIAS).length} namespaces · {Object.keys(AGENT_ALIAS).length} agents · Tap 7× top-right to toggle
      </div>
    </div>
  );
}


function AutonomousRuntimePanel() {
  const t = useTheme();
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [agentLimit, setAgentLimit] = useState(64);
  const [tickSeconds, setTickSeconds] = useState(2);
  const [researchEnabled, setResearchEnabled] = useState(true);
  const [researchCycleEvery, setResearchCycleEvery] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/runtime/status");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatus(await response.json());
      setError(null);
    } catch (err) {
      setError(`FastAPI runtime unavailable: ${err.message}`);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const response = await fetch("/api/runtime/events?limit=12");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setEvents(data.events || []);
    } catch {
      // Status polling reports backend availability; event polling stays quiet.
    }
  }, []);

  const postRuntime = useCallback(async (path, body = null) => {
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || `HTTP ${response.status}`);
      }
      await loadStatus();
      await loadEvents();
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [loadEvents, loadStatus]);

  useEffect(() => {
    loadStatus();
    loadEvents();
    const interval = setInterval(() => {
      loadStatus();
      loadEvents();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadEvents, loadStatus]);

  useEffect(() => {
    const stream = new EventSource("/api/runtime/stream");
    stream.onmessage = () => {
      loadStatus();
      loadEvents();
    };
    stream.onerror = () => stream.close();
    return () => stream.close();
  }, [loadEvents, loadStatus]);

  const card = {
    background: t.bg.card,
    border: `1px solid ${t.border.card}`,
    borderRadius: 6,
    padding: 12,
  };

  return (
    <div style={{ ...card, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: t.accent.green, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
            FASTAPI RESEARCH-AGENT KERNEL
          </div>
          <div style={{ color: t.text.secondary, fontSize: 10, marginTop: 3 }}>
            Backend causal kernel plus self-governing research layer: observations, judgments, lock-ins, projections, hypotheses, tests, evidence scores, digests, and human review.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <label style={{ color: t.text.muted, fontSize: 9 }}>agents</label>
          <input type="number" min="1" max="790" value={agentLimit} onChange={e => setAgentLimit(Number(e.target.value))}
            style={{ width: 64, background: t.bg.input, color: t.text.primary, border: `1px solid ${t.border.card}`, padding: "4px 6px", fontSize: 10 }} />
          <label style={{ color: t.text.muted, fontSize: 9 }}>tick</label>
          <input type="number" min="0.25" max="60" step="0.25" value={tickSeconds} onChange={e => setTickSeconds(Number(e.target.value))}
            style={{ width: 64, background: t.bg.input, color: t.text.primary, border: `1px solid ${t.border.card}`, padding: "4px 6px", fontSize: 10 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 4, color: t.text.muted, fontSize: 9 }}>
            <input type="checkbox" checked={researchEnabled} onChange={e => setResearchEnabled(e.target.checked)} />
            research
          </label>
          <label style={{ color: t.text.muted, fontSize: 9 }}>cycle</label>
          <input type="number" min="1" max="1000" value={researchCycleEvery} onChange={e => setResearchCycleEvery(Number(e.target.value))}
            style={{ width: 64, background: t.bg.input, color: t.text.primary, border: `1px solid ${t.border.card}`, padding: "4px 6px", fontSize: 10 }} />
          <button disabled={busy} onClick={() => postRuntime("/api/runtime/start", { agent_limit: agentLimit, tick_seconds: tickSeconds, autonomous_kernel: true, research_agent: researchEnabled, research_cycle_every_ticks: researchCycleEvery })}
            style={{ background: "rgba(80,180,120,0.14)", border: "1px solid rgba(80,180,120,0.3)", color: t.accent.green, padding: "5px 10px", fontSize: 9, cursor: busy ? "not-allowed" : "pointer", fontWeight: 700 }}>
            START
          </button>
          <button disabled={busy} onClick={() => postRuntime("/api/runtime/stop")}
            style={{ background: "rgba(224,96,64,0.10)", border: "1px solid rgba(224,96,64,0.25)", color: t.accent.red, padding: "5px 10px", fontSize: 9, cursor: busy ? "not-allowed" : "pointer", fontWeight: 700 }}>
            STOP
          </button>
          <button disabled={busy} onClick={() => postRuntime("/api/runtime/tick")}
            style={{ background: "rgba(192,128,255,0.10)", border: "1px solid rgba(192,128,255,0.25)", color: t.accent.purple, padding: "5px 10px", fontSize: 9, cursor: busy ? "not-allowed" : "pointer", fontWeight: 700 }}>
            TICK
          </button>
        </div>
      </div>

      {error && <div style={{ color: t.accent.red, fontSize: 10, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8, marginBottom: 10 }}>
        {[
          ["state", status?.running ? "RUNNING" : "STOPPED", status?.running ? t.accent.green : t.text.muted],
          ["tracked", status ? `${status.tracked_agents}/${status.total_agents}` : "-", t.accent.gold],
          ["ticks", status?.tick_count ?? "-", t.accent.purple],
          ["graph", status ? `${status.graph.nodes}n / ${status.graph.edges}e` : "-", t.accent.cyan],
          ["digest", status?.digest_configured ? "configured" : "no key", status?.digest_configured ? t.accent.green : t.accent.red],
          ["obs", status?.kernel_counts?.observations ?? "-", t.accent.blue],
          ["lock-ins", status?.kernel_counts?.active_lockins ?? "-", t.accent.gold],
          ["proj", status?.kernel_counts?.open_projections ?? "-", t.accent.purple],
          ["tasks", status?.kernel_counts?.queued_digest_tasks ?? "-", t.accent.cyan],
          ["research", status?.research_agent_enabled ? "ON" : "OFF", status?.research_agent_enabled ? t.accent.green : t.text.muted],
          ["r-tests", status?.research_status?.tests_total ?? "-", t.accent.blue],
          ["review", status?.research_status?.open_review_items ?? "-", t.accent.red],
        ].map(([label, value, color]) => (
          <div key={label} style={{ background: t.bg.cardAlt, border: `1px solid ${t.border.subtle}`, padding: 8, borderRadius: 4 }}>
            <div style={{ color: t.text.muted, fontSize: 8, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
            <div style={{ color, fontSize: 13, fontWeight: 700, marginTop: 3 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ color: t.text.secondary, fontSize: 10, lineHeight: 1.55, marginBottom: 8 }}>
        The runtime evaluates each tracked agent against the invariant SFO-WAM topology, detects node transitions, executes backend d-separation against active lock-ins, ingests observations, records monitor judgments, creates/resolves projections, schedules digest tasks, emits coordination actions, and can trigger bounded research cycles.
      </div>

      <div style={{ maxHeight: 210, overflow: "auto", borderTop: `1px solid ${t.border.subtle}`, paddingTop: 8 }}>
        {events.length === 0 ? (
          <div style={{ color: t.text.muted, fontSize: 10 }}>No runtime events yet. Press TICK or START.</div>
        ) : events.map(event => (
          <div key={event.id} style={{ padding: "6px 0", borderBottom: `1px solid ${t.border.subtle}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: t.accent.green, fontSize: 10, fontWeight: 700 }}>{event.agent_name}</span>
              <span style={{ color: t.text.muted, fontSize: 9 }}>{event.namespace} · {event.mechanism}</span>
            </div>
            <div style={{ color: t.text.secondary, fontSize: 10, marginTop: 2 }}>{event.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


function ResearchAgentPanel() {
  const t = useTheme();
  const [status, setStatus] = useState(null);
  const [detailTitle, setDetailTitle] = useState("Open Hypotheses");
  const [detailItems, setDetailItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [actionLog, setActionLog] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/research/status");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatus(await response.json());
      setError(null);
    } catch (err) {
      setError(`Research agent unavailable: ${err.message}`);
    }
  }, []);

  const loadList = useCallback(async (title, path, key) => {
    setBusy(true);
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setDetailTitle(title);
      setDetailItems(data[key] || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  const postJson = useCallback(async (path, body, after) => {
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || `HTTP ${response.status}`);
      setActionLog(data.summary || data.title || "Research action completed.");
      await loadStatus();
      if (after) await after(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [loadStatus]);

  useEffect(() => {
    loadStatus();
    loadList("Open Hypotheses", "/api/research/hypotheses?limit=8", "hypotheses");
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, [loadList, loadStatus]);

  const card = {
    background: t.bg.card,
    border: `1px solid ${t.border.card}`,
    borderRadius: 6,
    padding: 12,
  };
  const labelCounts = status?.confidence_label_counts || {};
  const latestDigest = status?.latest_digest;
  const summary = status?.last_research_cycle_summary;

  return (
    <div style={{ ...card, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ color: t.accent.purple, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>RESEARCH AGENT</div>
          <div style={{ color: t.text.secondary, fontSize: 10, marginTop: 3, maxWidth: 720 }}>
            Bounded self-governing layer: goals, hypotheses, tests, evidence scores, episodes, policy rules, human review, and deterministic digests.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button disabled={busy} onClick={() => postJson("/api/research/cycle/run", { limit: 10, autonomous: false }, () => loadList("Latest Episodes", "/api/research/episodes?limit=8", "episodes"))}
            style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.28)", color: t.accent.purple, padding: "5px 10px", fontSize: 9, cursor: busy ? "not-allowed" : "pointer", fontWeight: 700 }}>
            RUN RESEARCH CYCLE NOW
          </button>
          <button disabled={busy} onClick={() => postJson("/api/research/digests/generate", { digest_type: "daily_kernel_digest" }, () => loadList("Research Digests", "/api/research/digests?limit=8", "digests"))}
            style={{ background: "rgba(8,145,178,0.12)", border: "1px solid rgba(8,145,178,0.28)", color: t.accent.cyan, padding: "5px 10px", fontSize: 9, cursor: busy ? "not-allowed" : "pointer", fontWeight: 700 }}>
            GENERATE DAILY DIGEST
          </button>
          <button disabled={busy} onClick={loadStatus}
            style={{ background: t.bg.cardAlt, border: `1px solid ${t.border.card}`, color: t.text.secondary, padding: "5px 10px", fontSize: 9, cursor: busy ? "not-allowed" : "pointer", fontWeight: 700 }}>
            REFRESH RESEARCH STATUS
          </button>
        </div>
      </div>

      {error && <div style={{ color: t.accent.red, fontSize: 10, marginBottom: 8 }}>{error}</div>}
      {actionLog && <div style={{ color: t.accent.green, fontSize: 10, marginBottom: 8 }}>{actionLog}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginBottom: 10 }}>
        {[
          ["status", status?.research_agent_enabled ? "ENABLED" : "AVAILABLE", status?.research_agent_enabled ? t.accent.green : t.text.secondary],
          ["goals", status?.goals_total ?? "-", t.accent.gold],
          ["open hyp", status?.open_hypotheses ?? "-", t.accent.purple],
          ["tests", status?.tests_total ?? "-", t.accent.blue],
          ["scores", status?.evidence_scores_total ?? "-", t.accent.cyan],
          ["review", status?.open_review_items ?? "-", t.accent.red],
          ["digests", status?.digests_total ?? "-", t.accent.green],
          ["rules", status?.active_policy_rules ?? "-", t.accent.gold],
        ].map(([label, value, color]) => (
          <div key={label} style={{ background: t.bg.cardAlt, border: `1px solid ${t.border.subtle}`, padding: 8, borderRadius: 4 }}>
            <div style={{ color: t.text.muted, fontSize: 8, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
            <div style={{ color, fontSize: 13, fontWeight: 700, marginTop: 3 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 8, marginBottom: 10 }}>
        <div style={{ background: t.bg.cardAlt, border: `1px solid ${t.border.subtle}`, borderRadius: 4, padding: 8 }}>
          <div style={{ color: t.text.muted, fontSize: 8, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Evidence Confidence</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["insufficient", "weak", "moderate", "strong", "human_confirmed"].map(label => (
              <span key={label} style={{ color: t.text.secondary, border: `1px solid ${t.border.subtle}`, borderRadius: 3, padding: "3px 6px", fontSize: 9 }}>
                {label}: <strong style={{ color: t.accent.cyan }}>{labelCounts[label] || 0}</strong>
              </span>
            ))}
          </div>
        </div>
        <div style={{ background: t.bg.cardAlt, border: `1px solid ${t.border.subtle}`, borderRadius: 4, padding: 8 }}>
          <div style={{ color: t.text.muted, fontSize: 8, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Last Cycle</div>
          <div style={{ color: t.text.secondary, fontSize: 10, lineHeight: 1.5 }}>
            {summary ? `${summary.summary || "Research cycle recorded."} Tests: ${summary.tests_run ?? 0}; review items: ${summary.review_items_created ?? 0}.` : "No research cycle has run in this session."}
          </div>
        </div>
        <div style={{ background: t.bg.cardAlt, border: `1px solid ${t.border.subtle}`, borderRadius: 4, padding: 8 }}>
          <div style={{ color: t.text.muted, fontSize: 8, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Latest Digest</div>
          <div style={{ color: latestDigest ? t.accent.green : t.text.secondary, fontSize: 10, lineHeight: 1.5 }}>
            {latestDigest ? `${latestDigest.title} · ${latestDigest.created_at}` : "No research digest has been generated yet."}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <button disabled={busy} onClick={() => loadList("Open Hypotheses", "/api/research/hypotheses?limit=12", "hypotheses")} style={{ background: t.bg.cardAlt, border: `1px solid ${t.border.card}`, color: t.text.secondary, padding: "4px 8px", fontSize: 9 }}>VIEW OPEN HYPOTHESES</button>
        <button disabled={busy} onClick={() => loadList("Human Review Queue", "/api/research/review-queue?limit=12&status=open", "review_items")} style={{ background: t.bg.cardAlt, border: `1px solid ${t.border.card}`, color: t.text.secondary, padding: "4px 8px", fontSize: 9 }}>VIEW HUMAN REVIEW QUEUE</button>
        <button disabled={busy} onClick={() => loadList("Latest Research Episodes", "/api/research/episodes?limit=12", "episodes")} style={{ background: t.bg.cardAlt, border: `1px solid ${t.border.card}`, color: t.text.secondary, padding: "4px 8px", fontSize: 9 }}>VIEW LATEST EPISODES</button>
      </div>

      <div style={{ maxHeight: 230, overflow: "auto", borderTop: `1px solid ${t.border.subtle}`, paddingTop: 8 }}>
        <div style={{ color: t.text.muted, fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{detailTitle}</div>
        {detailItems.length === 0 ? (
          <div style={{ color: t.text.muted, fontSize: 10 }}>No items returned.</div>
        ) : detailItems.map(item => (
          <div key={`${detailTitle}-${item.id}`} style={{ padding: "7px 0", borderBottom: `1px solid ${t.border.subtle}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: t.text.primary, fontSize: 10, fontWeight: 700 }}>{item.title || item.name || item.digest_type || `Item ${item.id}`}</span>
              <span style={{ color: t.text.muted, fontSize: 9 }}>{item.status || item.confidence_label || item.created_at || ""}</span>
            </div>
            <div style={{ color: t.text.secondary, fontSize: 10, marginTop: 2, lineHeight: 1.45 }}>
              {item.claim || item.summary || item.rationale || item.body || item.description || item.question || "No summary field."}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function JOMODashboard() {
  const [z, setZ] = useState(computeTNLDY());
  const [tick, setTick] = useState(0);
  const [selectedNs, setSelectedNs] = useState(null);
  const [activeTab, setActiveTab] = useState("OVERVIEW");
  const [selectedAgent, setSelectedAgent] = useState(null); // Selected agent for SFO-WAM
  const [themeName, setThemeName] = useState("coolSlate");
  const t = THEMES[themeName] || THEMES.coolSlate;
  
  // ── ROSETTA STONE (7-tap secret panel) ──
  const [rosettaVisible, setRosettaVisible] = useState(false);
  const rosettaTapRef = useRef({ count: 0, timer: null });
  const handleRosettaTap = useCallback(() => {
    const ref = rosettaTapRef.current;
    ref.count += 1;
    if (ref.timer) clearTimeout(ref.timer);
    if (ref.count >= 7) {
      ref.count = 0;
      setRosettaVisible(v => !v);
    } else {
      ref.timer = setTimeout(() => { ref.count = 0; }, 2000);
    }
  }, []);

  // ── AGENT REGISTRY — direct from Clojure extraction ──
  // No filler generation. Every agent is real, extracted from mdqnm/src.
  const [agents, setAgents] = useState(AGENTS_FULL_INITIAL);

  // ── TIME TRAVEL STATE ──
  const [travelY, setTravelY] = useState(null);    // null = live, number = traveling
  const [travelSfo, setTravelSfo] = useState("sfo26"); // which SFO's frame to travel in
  const [yInput, setYInput] = useState("");
  const [zInput, setZInput] = useState("");

  // ── AGENT-DRIVEN COMPUTATION (no useMemo — recomputes every render) ──
  // This is intentionally NOT memoized. The cost is trivial and eliminates
  // stale-closure / stale-memo bugs that caused EXE_TPDP.100D lock-in.
  const activeAgent = selectedAgent || agents.find(a => a.ns === travelSfo) || null;
  const travelZtp = activeAgent ? activeAgent.ztp : 17651.8;
  const travelCoeff = activeAgent ? activeAgent.coeff : 100;

  // ── RESET TRAVEL STATE WHEN AGENT CHANGES ──
  // This fires whenever selectedAgent identity changes, clearing stale Y/Z values
  // that belonged to the previous agent's coordinate frame.
  const activeAgentName = selectedAgent ? selectedAgent.name : null;
  useEffect(() => {
    setTravelY(null);
    setYInput("");
    setZInput("");
  }, [activeAgentName, travelSfo]);

  // View coordinates
  const liveY = agentPosition(travelZtp, travelCoeff, z);
  const viewY = travelY !== null ? travelY : liveY;
  const viewZ = agentTNLDY(travelZtp, travelCoeff, viewY);
  const viewDate = tnldyToDate(viewZ);
  const isTraveling = travelY !== null;

  // Y range for the travel SFO
  const yMin = -150;
  const yMax = 250;
  
  // ── FORGE PERSISTENCE — POST new agents to Express sidecar, update state ──
  // Forged agents land in the "forge" namespace (FORGEITE mineral codename).
  // AGENT_ALIAS and NS_ALIAS are mutated in-place so agentDisplay/nsDisplay
  // resolve immediately on the next render triggered by setAgents.
  const FORGE_NS = "forge";
  const FORGE_MINERAL = "FORGEITE";
  const onForge = useCallback(async (sfo) => {
    // Assign next FORGEITE-NNN codename
    const existingNums = Object.values(AGENT_ALIAS)
      .filter(v => v.startsWith(FORGE_MINERAL + "-"))
      .map(v => parseInt(v.split("-")[1]))
      .filter(n => !isNaN(n));
    const nextNum = existingNums.length ? Math.max(...existingNums) + 1 : 1;
    const codename = `${FORGE_MINERAL}-${String(nextNum).padStart(3, "0")}`;

    // Ensure the forge namespace is visible in alias layer
    if (!NS_ALIAS[FORGE_NS]) NS_ALIAS[FORGE_NS] = FORGE_MINERAL;

    const newAgent = { name: sfo.name, ns: FORGE_NS, ztp: sfo.C, coeff: sfo.A };

    try {
      const resp = await fetch("/api/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAgent),
      });
      if (!resp.ok) {
        const err = await resp.json();
        console.error("[FORGE] Registry write failed:", err.error);
        return;
      }
    } catch (err) {
      // Sidecar unavailable — agent still appears in UI this session
      console.warn("[FORGE] Sidecar unreachable, persistence skipped:", err.message);
    }

    // Register alias and update agents state (triggers immediate re-render)
    AGENT_ALIAS[sfo.name] = codename;
    setAgents(prev => [...prev, newAgent]);
  }, []);

  // ── Time Travel Handlers ──
  const goToY = useCallback(() => {
    const v = parseFloat(yInput);
    if (!isNaN(v) && v >= yMin && v <= yMax) {
      setTravelY(v);
      setZInput(agentTNLDY(travelZtp, travelCoeff, v).toFixed(6));
    }
  }, [yInput, travelZtp, travelCoeff]);

  const goToZ = useCallback(() => {
    const zv = parseFloat(zInput);
    if (!isNaN(zv)) {
      const y = agentPosition(travelZtp, travelCoeff, zv);
      if (y >= yMin && y <= yMax) {
        setTravelY(y);
        setYInput(y.toFixed(6));
      }
    }
  }, [zInput, travelZtp, travelCoeff]);

  const returnToNow = () => { setTravelY(null); setYInput(""); setZInput(""); };

  // ── Precision Previews ──
  const yPreview = useMemo(() => {
    const v = parseFloat(yInput);
    if (isNaN(v)) return null;
    const inRange = v >= yMin && v <= yMax;
    const pz = agentTNLDY(travelZtp, travelCoeff, v);
    const pd = inRange ? tnldyToDate(pz) : null;
    return { val: v, inRange, tnldy: pz, date: pd };
  }, [yInput, travelZtp, travelCoeff]);

  const zPreview = useMemo(() => {
    const zv = parseFloat(zInput);
    if (isNaN(zv)) return null;
    const y = agentPosition(travelZtp, travelCoeff, zv);
    const inRange = y >= yMin && y <= yMax;
    const pd = inRange ? tnldyToDate(zv) : null;
    return { tnldy: zv, y, inRange, date: pd };
  }, [zInput, travelZtp, travelCoeff]);

  // Live tick
  useEffect(() => {
    const interval = setInterval(() => {
      setZ(computeTNLDY());
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const tabs = ["OVERVIEW", "RUNTIME", "RESEARCH", "OPS", "SFO-WAM", "AGENTS", "CITIES", "GPBS", "ROADMAP"];

  return (
    <ThemeContext.Provider value={t}>
    <div style={{
      background: t.bg.body,
      color: t.text.primary,
      minHeight: "100vh",
      fontFamily: "'Geist', 'SF Pro Display', -apple-system, sans-serif",
      fontSize: 12,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Geist:wght@400;500;700&display=swap');
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${t.scrollThumb}; border-radius: 2px; }
        * { box-sizing: border-box; }
      `}</style>

      {/* Title Bar */}
      <div style={{
        background: t.bg.titleBar,
        padding: "10px 20px",
        borderBottom: "1px solid rgba(255,69,0,0.3)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <span style={{ 
            color: t.accent.brand, fontWeight: 700, fontSize: 16, 
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2 
          }}>
            MDQNM
          </span>
          <span style={{ color: t.text.onDarkMuted, fontSize: 11, marginLeft: 12 }}>
            J-Overall Multiple Objective Engine
          </span>
          <span style={{ color: t.text.onDarkMuted, fontSize: 10, marginLeft: 12 }}>
            EXE_TPDP.100D × 32 Cities of the Future
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              background: activeTab === t ? "rgba(255,69,0,0.15)" : "transparent",
              color: activeTab === t ? "#FF4500" : "#666",
              border: activeTab === t ? "1px solid rgba(255,69,0,0.3)" : "1px solid transparent",
              borderRadius: 4,
              padding: "4px 10px",
              fontSize: 9,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: 1,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {t}
            </button>
          ))}
        </div>
        {/* Theme Picker */}
        <select
          value={themeName}
          onChange={e => setThemeName(e.target.value)}
          style={{
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "rgba(255,255,255,0.8)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 8,
            padding: "2px 6px",
            cursor: "pointer",
            borderRadius: 3,
          }}
          title="Switch color scheme"
        >
          {Object.values(THEMES).map(th => (
            <option key={th.id} value={th.id} style={{ background: "#1a1a2e", color: "#ccc" }}>{th.name}</option>
          ))}
        </select>
        {/* 7-tap Rosetta Stone trigger */}
        <div
          onClick={handleRosettaTap}
          style={{
            width: 28, height: 28,
            cursor: "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 4,
            userSelect: "none",
            opacity: 0.15,
          }}
          title=""
        >
          <span style={{ fontSize: 12, color: t.accent.brand }}>◆</span>
        </div>
      </div>

      {/* Rosetta Stone Secret Panel */}
      <RosettaStone visible={rosettaVisible} onClose={() => setRosettaVisible(false)} agents={agents} />

      {/* Time Authority */}
      <TimeAuthority z={z} viewZ={viewZ} viewY={viewY} viewDate={viewDate} isTraveling={isTraveling} tick={tick} travelSfo={travelSfo} agentCount={agents.length} />

      {/* ── TIME TRAVEL CONTROL ── */}
      <div style={{
        background: isTraveling ? t.bg.travelActive : t.bg.travelInactive,
        border: `1px solid ${isTraveling ? "rgba(192,128,255,0.2)" : "rgba(255,255,255,0.05)"}`,
        padding: "10px 16px",
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {/* Namespace → Agent selector + Slider + Return */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: isTraveling ? "#c080ff" : "#666" }}>
            ⟳ Time Travel
          </span>
          {/* Namespace selector */}
          <select
            value={travelSfo}
            onChange={e => { setTravelSfo(e.target.value); setSelectedAgent(null); setTravelY(null); setYInput(""); setZInput(""); }}
            style={{ background: t.bg.input, border: `1px solid ${t.border.card}`, color: t.text.heading, fontFamily: "inherit", fontSize: 10, padding: "3px 6px" }}
          >
            {[...new Set(agents.map(a => a.ns))].sort().map(ns => (
              <option key={ns} value={ns}>{nsDisplay(ns)} ({agents.filter(a => a.ns === ns).length})</option>
            ))}
          </select>
          {/* Agent selector within namespace */}
          <select
            value={selectedAgent ? selectedAgent.name : ""}
            onChange={e => {
              if (e.target.value === "") { setSelectedAgent(null); return; }
              const agent = agents.find(a => a.name === e.target.value);
              if (agent) { setSelectedAgent(agent); setTravelSfo(agent.ns); }
            }}
            style={{ background: t.bg.input, border: `1px solid ${selectedAgent ? "rgba(255,69,0,0.3)" : "rgba(255,255,255,0.1)"}`, color: selectedAgent ? "#FF4500" : "#999", fontFamily: "inherit", fontSize: 10, padding: "3px 6px", maxWidth: 320 }}
          >
            <option value="">— select agent —</option>
            {agents.filter(a => a.ns === travelSfo).sort((a,b) => a.name.localeCompare(b.name)).map(a => (
              <option key={a.name} value={a.name}>{agentDisplay(a.name)} (A={a.coeff}, C={a.ztp})</option>
            ))}
          </select>
          <span style={{ fontSize: 9, color: selectedAgent ? "#FF4500" : "#555" }}>
            A={travelCoeff} · C={travelZtp}
          </span>
          <input
            type="range" min={yMin} max={yMax} step="0.01"
            value={travelY !== null ? travelY : liveY}
            onChange={e => { const v = parseFloat(e.target.value); setTravelY(v); setYInput(v.toFixed(4)); setZInput(agentTNLDY(travelZtp, travelCoeff, v).toFixed(4)); }}
            style={{ flex: 1, minWidth: 120, accentColor: isTraveling ? "#c080ff" : "#FFD740", cursor: "pointer" }}
          />
          {isTraveling && (
            <button onClick={returnToNow} style={{
              background: "rgba(240,192,64,0.1)", border: "1px solid rgba(240,192,64,0.25)",
              color: "#f0c040", padding: "3px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 10
            }}>RETURN TO NOW</button>
          )}
        </div>

        {/* Travel readout */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 6, marginBottom: 10, fontSize: 10 }}>
          {selectedAgent && (
            <div style={{ gridColumn: "1 / -1", padding: "4px 8px", background: "rgba(255,69,0,0.06)", border: "1px solid rgba(255,69,0,0.15)", marginBottom: 4 }}>
              <span style={{ color: t.accent.brand, fontWeight: 700 }}>{agentDisplay(selectedAgent.name)}</span>
              <span style={{ color: t.text.secondary, marginLeft: 8 }}>Z = {selectedAgent.coeff}·Y + {selectedAgent.ztp}</span>
              <span style={{ color: t.text.muted, marginLeft: 8 }}>| Y = (Z − {selectedAgent.ztp}) / {selectedAgent.coeff}</span>
            </div>
          )}
          {!selectedAgent && activeAgent && (
            <div style={{ gridColumn: "1 / -1", padding: "4px 8px", background: t.bg.card, border: `1px dashed ${t.border.card}`, marginBottom: 4, color: t.text.muted }}>
              Computing with first agent in {nsDisplay(travelSfo)}: <span style={{ color: t.text.secondary }}>{agentDisplay(activeAgent.name)}</span> (A={travelCoeff}, C={travelZtp}). Select an agent above for explicit control.
            </div>
          )}
          {!selectedAgent && !activeAgent && (
            <div style={{ gridColumn: "1 / -1", padding: "4px 8px", background: "rgba(224,96,64,0.06)", border: "1px dashed rgba(224,96,64,0.15)", marginBottom: 4, color: "#e06040" }}>
              No agents found in {nsDisplay(travelSfo)} — using EXE_TPDP.100D fallback (A=100, C=17651.8).
            </div>
          )}
          <div><span style={{ color: t.text.muted }}>View Y: </span><span style={{ color: isTraveling ? "#c080ff" : "#FFD740", fontWeight: 700 }}>{viewY.toFixed(6)}</span></div>
          <div><span style={{ color: t.text.muted }}>TNLDY: </span><span style={{ color: t.text.secondary }}>{viewZ.toFixed(6)}</span></div>
          <div><span style={{ color: t.text.muted }}>Calendar: </span><span style={{ color: t.text.secondary }}>{formatDisplayDate(viewDate)}</span></div>
          <div><span style={{ color: t.text.muted }}>BB Node: </span><span style={{ color: t.accent.green }}>{yToBBNode(viewY)}/399</span></div>
        </div>

        {/* ── PRECISION ENTRY ── */}
        <div style={{ borderTop: `1px solid ${isTraveling ? "rgba(192,128,255,0.12)" : "rgba(255,255,255,0.05)"}`, paddingTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          
          {/* Y-VALUE PRECISION ENTRY */}
          <div style={{ background: t.bg.card, border: `1px solid ${t.border.card}`, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: t.text.muted, marginBottom: 6 }}>
              ◇ Precision Y-Value Entry
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <input
                value={yInput}
                onChange={e => setYInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && goToY()}
                placeholder={`e.g. ${liveY.toFixed(2)}`}
                style={{ flex: 1, background: t.bg.input, border: `1px solid ${yPreview && !yPreview.inRange ? "rgba(224,96,64,0.4)" : yPreview ? "rgba(192,128,255,0.3)" : "rgba(255,255,255,0.1)"}`, color: t.text.primary, fontFamily: "inherit", fontSize: 12, padding: "5px 8px" }}
              />
              <button onClick={goToY} disabled={!yPreview || !yPreview.inRange} style={{
                background: yPreview && yPreview.inRange ? "rgba(192,128,255,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${yPreview && yPreview.inRange ? "rgba(192,128,255,0.3)" : "rgba(255,255,255,0.08)"}`,
                color: yPreview && yPreview.inRange ? "#c080ff" : "#444",
                padding: "4px 12px", cursor: yPreview && yPreview.inRange ? "pointer" : "default", fontFamily: "inherit", fontSize: 10, fontWeight: 700
              }}>GO</button>
            </div>
            {yPreview && (
              <div style={{ fontSize: 10, lineHeight: 1.6 }}>
                <div style={{ color: yPreview.inRange ? "rgba(192,128,255,0.7)" : "rgba(224,96,64,0.7)" }}>
                  Y = {yPreview.val.toFixed(6)} {yPreview.inRange ? "✓ in range" : "✗ out of range"}
                </div>
                {yPreview.inRange && <>
                  <div><span style={{ color: t.text.muted }}>→ TNLDY = </span><span style={{ color: t.text.secondary }}>{yPreview.tnldy.toFixed(6)}</span></div>
                  <div><span style={{ color: t.text.muted }}>→ Calendar = </span><span style={{ color: t.text.secondary }}>{formatDisplayDate(yPreview.date)}</span></div>
                </>}
              </div>
            )}
            {!yPreview && yInput === "" && (
              <div style={{ fontSize: 9, color: t.text.muted, lineHeight: 1.5 }}>
                Enter Y to time-travel within [{yMin}, {yMax}].<br/>
                <span style={{ color: selectedAgent ? "#FF4500" : "#555" }}>
                  Agent: {activeAgent ? agentDisplay(activeAgent.name) : "none"}<br/>
                  Z = {travelCoeff}·Y + {travelZtp} → Calendar
                </span>
              </div>
            )}
          </div>

          {/* TNLDY PRECISION ENTRY */}
          <div style={{ background: t.bg.card, border: `1px solid ${t.border.card}`, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: t.text.muted, marginBottom: 6 }}>
              ◆ Precision TNLDY Entry
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <input
                value={zInput}
                onChange={e => setZInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && goToZ()}
                placeholder={`e.g. ${viewZ.toFixed(2)}`}
                style={{ flex: 1, background: t.bg.input, border: `1px solid ${zPreview && !zPreview.inRange ? "rgba(224,96,64,0.4)" : zPreview ? "rgba(240,192,64,0.3)" : "rgba(255,255,255,0.1)"}`, color: t.text.primary, fontFamily: "inherit", fontSize: 12, padding: "5px 8px" }}
              />
              <button onClick={goToZ} disabled={!zPreview || !zPreview.inRange} style={{
                background: zPreview && zPreview.inRange ? "rgba(240,192,64,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${zPreview && zPreview.inRange ? "rgba(240,192,64,0.25)" : "rgba(255,255,255,0.08)"}`,
                color: zPreview && zPreview.inRange ? "#f0c040" : "#444",
                padding: "4px 12px", cursor: zPreview && zPreview.inRange ? "pointer" : "default", fontFamily: "inherit", fontSize: 10, fontWeight: 700
              }}>GO</button>
            </div>
            {zPreview && (
              <div style={{ fontSize: 10, lineHeight: 1.6 }}>
                <div style={{ color: zPreview.inRange ? "rgba(240,192,64,0.7)" : "rgba(224,96,64,0.7)" }}>
                  TNLDY = {zPreview.tnldy.toFixed(6)} {zPreview.inRange ? "✓ maps to valid Y" : "✗ out of range"}
                </div>
                {zPreview.inRange && <>
                  <div><span style={{ color: t.text.muted }}>→ Y = </span><span style={{ color: t.accent.purple }}>{zPreview.y.toFixed(6)}</span></div>
                  <div><span style={{ color: t.text.muted }}>→ Calendar = </span><span style={{ color: t.text.secondary }}>{formatDisplayDate(zPreview.date)}</span></div>
                </>}
              </div>
            )}
            {!zPreview && zInput === "" && (
              <div style={{ fontSize: 9, color: t.text.muted, lineHeight: 1.5 }}>
                Enter TNLDY value directly.<br/>
                <span style={{ color: selectedAgent ? "#FF4500" : "#555" }}>
                  Agent: {activeAgent ? agentDisplay(activeAgent.name) : "none"}<br/>
                  Y = (Z − {travelZtp}) / {travelCoeff}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: "12px 16px" }}>
        {activeTab === "OVERVIEW" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <AutonomousRuntimePanel />
              <ResearchAgentPanel />
              <AgentStats agents={agents} z={isTraveling ? viewZ : z} />
              <JOMOFlow z={isTraveling ? viewZ : z} agents={agents} />
              <AgentHeatmap agents={agents} z={isTraveling ? viewZ : z} selectedNs={selectedNs} onSelectNs={setSelectedNs} />
              {selectedNs && <NsDetailPanel ns={selectedNs} agents={agents} z={isTraveling ? viewZ : z} selectedAgent={selectedAgent} onSelectAgent={(a) => { setSelectedAgent(a); setTravelSfo(a.ns); }} />}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <GPBSPanel z={z} />
              <CitiesGrid z={isTraveling ? viewZ : z} />
              <ImplementationPhases />
            </div>
          </div>
        )}

        {activeTab === "RUNTIME" && (
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            <AutonomousRuntimePanel />
            <ResearchAgentPanel />
          </div>
        )}

        {activeTab === "RESEARCH" && (
          <div style={{ maxWidth: 1040, margin: "0 auto" }}>
            <ResearchAgentPanel />
          </div>
        )}

        {activeTab === "OPS" && (
          <OperationsTab agent={selectedAgent} agents={agents} z={z} onJudge={(state) => {
            // Judgment recorded — could trigger UI feedback
            console.log("Judgment recorded:", state, selectedAgent?.name);
          }} />
        )}

        {activeTab === "SFO-WAM" && (
          <div style={{
            background: "rgba(255,20,147,0.02)",
            border: "1px solid rgba(255,20,147,0.08)",
            borderRadius: 6, padding: 12
          }}>
            {typeof SFOWAMEngine !== "undefined" ? (
              <SFOWAMEngine
                agentA={travelCoeff} agentC={travelZtp}
                sfoLabel={selectedAgent ? agentDisplay(selectedAgent.name) : "EXE_TPDP.100D"}
                viewY={viewY} viewZ={viewZ} isTraveling={isTraveling}
                onForge={onForge}
              />
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: t.text.secondary }}>
                <div style={{ fontSize: 16, color: t.accent.pink, fontWeight: 700, marginBottom: 12 }}>
                  ◆ SFO-WAM ENGINE
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.6, maxWidth: 500, margin: "0 auto" }}>
                  399 nodes · 701 edges · d-Separation · Autonomous Backend
                  <br/><br/>
                  In Vite project, uncomment the import at line 3:<br/>
                  <code style={{ color: t.accent.pink, background: "rgba(255,20,147,0.08)", padding: "2px 6px" }}>
                    import SFOWAMEngine from './sfo_wam_engine'
                  </code>
                  <br/><br/>
                  Or render <code style={{ color: t.accent.pink }}>sfo_wam_engine.jsx</code> as a standalone artifact.
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "AGENTS" && (
          <div>
            <AgentStats agents={agents} z={isTraveling ? viewZ : z} />
            <AgentHeatmap agents={agents} z={isTraveling ? viewZ : z} selectedNs={selectedNs} onSelectNs={setSelectedNs} />
            {selectedNs ? (
              <NsDetailPanel ns={selectedNs} agents={agents} z={isTraveling ? viewZ : z} selectedAgent={selectedAgent} onSelectAgent={(a) => { setSelectedAgent(a); setTravelSfo(a.ns); }} />
            ) : (
              <div style={{ color: t.text.secondary, padding: 20, textAlign: "center", fontSize: 11 }}>
                Click a namespace block above to inspect its agents
              </div>
            )}
            <div style={{ 
              marginTop: 12, padding: 12,
              background: t.bg.card, borderRadius: 6,
              border: `1px solid ${t.border.card}`,
            }}>
              <div style={{ color: t.text.secondary, fontSize: 10, marginBottom: 8, letterSpacing: 1 }}>
                JOMO PARALLELIZATION &amp; d-SEPARATION
              </div>
              <div style={{ color: t.text.secondary, fontSize: 10, lineHeight: 1.6 }}>
                The J-Overall Multiple Objective engine runs {agents.length} autonomous agents 
                in parallel across {Object.keys(NS_ALIAS).length} computational domains. Each agent is a complete instantiation of 
                the 399-node / 701-edge DAG topology, operating on its own time reference frame 
                defined by Z = A·Y + C. The time-travel interface enables real-time d-separation 
                interventions: the human/AI team travels along edges (into the past or building 
                future scenarios), selects which features entering a node are worthy of being 
                cemented in reality by judgement, and thereby conditions on nodes to open or close 
                causal paths in the DAG. New SFO instances can also be created on the fly from 
                two observed events.
              </div>
            </div>
          </div>
        )}

        {activeTab === "CITIES" && (
          <div>
            <CitiesGrid z={z} />
            <div style={{ 
              marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 
            }}>
              {CITIES_OF_FUTURE.map(c => (
                <div key={c.id} style={{
                  background: "rgba(50,205,50,0.03)",
                  border: "1px solid rgba(50,205,50,0.1)",
                  borderRadius: 4,
                  padding: 8,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: t.accent.green, fontWeight: 700, fontSize: 11 }}>
                      #{c.id} {c.name}
                    </span>
                    <span style={{ color: t.text.muted, fontSize: 9 }}>
                      {c.lat.toFixed(2)}°, {c.lng.toFixed(2)}°
                    </span>
                  </div>
                  <div style={{ color: t.text.secondary, fontSize: 9 }}>{c.zone}</div>
                  <div style={{ 
                    color: t.accent.gold, fontSize: 8, marginTop: 4,
                    fontFamily: "'JetBrains Mono', monospace" 
                  }}>
                    GPBS-ATDF Allocation: Active | EXE_TPDP Phase
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "GPBS" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <GPBSPanel z={z} />
            <div style={{
              background: t.bg.card,
              border: `1px solid ${t.border.card}`,
              borderRadius: 6,
              padding: 12,
            }}>
              <div style={{ color: t.accent.gold, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
                THERMODYNAMIC ARCHITECTURE
              </div>
              <div style={{ color: t.text.secondary, fontSize: 10, lineHeight: 1.6 }}>
                The GPBS operates as a thermodynamic heat engine with four steady-state 
                devices arranged in a cycle. The current steady-state is the ATDF (Alternative 
                Trade and Development Finance), which serves as the financial backbone for the 
                32 Cities of the Future programme within the Alternative Havens zone of 
                Sub-Saharan Africa. The ATDF device channels sovereign financial instruments 
                through the canonical value equation, providing the economic foundation for 
                large-scale infrastructure development across the designated refuge and 
                desert cities.
              </div>
            </div>
          </div>
        )}

        {activeTab === "ROADMAP" && (
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <ImplementationPhases />
            <div style={{
              marginTop: 12,
              background: "rgba(255,69,0,0.03)",
              border: "1px solid rgba(255,69,0,0.15)",
              borderRadius: 6,
              padding: 12,
            }}>
              <div style={{ color: t.accent.brand, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
                EXE_TPDP.100D — PRIMARY EXECUTION AGENT
              </div>
              <div style={{ color: t.text.secondary, fontSize: 10, lineHeight: 1.6 }}>
                EXE_TPDP.100D is the primary execution agent (ZTP = 17651.8 TNLDY, 
                coefficient = 100) that orchestrates the Total Project Development Process for 
                the fictitious large-scale engineering project: constructing 32 Cities of the 
                Future as international refuge and desert cities within the Alternative Havens 
                zone of Sub-Saharan Africa. This agent, along with 758 companion agents, 
                demonstrates the JOMO (J-Overall Multiple Objective) implementation pattern 
                where each agent autonomously traverses the complete 399-node DAG at its own 
                rate, coordinated through the shared TNLDY temporal reference frame.
              </div>
              <div style={{ color: t.text.secondary, fontSize: 9, marginTop: 8, fontStyle: "italic" }}>
                Target platform: Ubuntu Linux / Dell Precision 7780 | Node.js ≥ 22.12 LTS | 
                Vite 7 + React 19 | FastAPI causal kernel for autonomous reasoning
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: t.bg.statusBar,
        borderTop: "1px solid rgba(255,255,255,0.05)",
        padding: "4px 16px",
        display: "flex",
        justifyContent: "space-between",
        fontSize: 9,
        fontFamily: "'JetBrains Mono', monospace",
        color: t.text.muted,
      }}>
        <span>MDQNM v3PP | 628 agents | 56 domains</span>
        <span>SFO-WAM: 399 nodes / 701 edges | DAG invariant topology</span>
        <span style={{ color: t.accent.green }}>● JOMO ACTIVE</span>
      </div>
    </div>
    </ThemeContext.Provider>
  );
}
