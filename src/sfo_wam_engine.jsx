import "./nsukka-yg-clock.js"; // sets globalThis.NsukkaYg before this module runs
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTheme } from "./App";

// ═══════════════════════════════════════════════════════════════════
// SFO-WAM ENGINE v2 — Autonomous PDP Causal Agent Backend
// 549 nodes · 942 edges · Four Operations: Observe · Propagate · Project · Judge
// d-Separation · Lock-in Registry · Projection Resolution · Digest Engine
// Parameterised by (A, C) for any agent in the 759-agent JOMO constellation
// ═══════════════════════════════════════════════════════════════════

// ── TNLDY TIME AUTHORITY: read from Nsukka on the Yg calendar (./nsukka-yg-clock.js) ──
// Yg = 17640/48.3 days, the engine's own year, laid on Nsukka's calendar from 1 December 00:00 and
// recalibrated every Yg year. A TNLDY passed over at a recalibration has no date ("—").
const Yg = globalThis.NsukkaYg;
const MSD = 86400000;
function tnldy(ms) { return Yg.zOf(ms).z; }
function tnldyNow() { return tnldy(Date.now()); }
function tnldyToMs(z) { try { const t = Yg.instantsOf(z); return t.length ? t[0] : NaN; } catch { return NaN; } }
function tnldyToDate(z) { return new Date(tnldyToMs(z)); }
function agentY(z, A, C) { return A === 0 ? 0 : (z - C) / A; }
function agentZ(y, A, C) { return A * y + C; }
const DISPLAY_TIME_ZONE = "Africa/Lagos";
const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: DISPLAY_TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function fd(d) { if (!d || isNaN(d.getTime())) return "—"; return DATE_FORMAT.format(d); }
function ft(d) { if (!d || isNaN(d.getTime())) return ""; return TIME_FORMAT.format(d) + " WAT"; }

// ── 400 NODE Y-COORDINATES (sorted ascending; 85.32, onset of circumcision, restored 2026-11-01) ──
const NODE_YS=[-147.6,-132.97,-126.3,-123.01,-120.97,-110.97,-104.4,-100.97,-98.3,-95.6,-91.56,-90.6,-83.19,-72.03,-61.2,-60.97,-46.8,-45.0,-43.82,-43.2,-39.6,-39.5984,-38.8,-37.5186,-36.4836,-35.5964,-34.9064,-34.2657,-32.6689,-32.14,-32.0281,-30.1849,-29.6329,-29.071,-28.8,-28.6471,-28.5289,-28.3909,-27.6,-27.5629,-26.6264,-26.0843,-25.99,-25.9,-24.7831,-23.8171,-23.66,-23.6594,-23.4623,-22.5259,-22.4766,-22.4569,-22.1119,-22.0,-21.9936,-21.8161,-21.726190476190474,-21.6,-21.481,-21.1853,-21.0,-20.8699,-20.5741,-20.29,-20.2883,-19.6,-19.5983,-19.1251,-19.1153,-19.0857,-19.0266,-18.9871,-18.859,-18.8294,-18.79,-18.6126,-18.6027,-18.2676,-18.26086957,-18.1394,-18.0211,-18.0,-17.8733,-17.8437,-17.5283,-17.4396,-17.272,-17.2424,-17.134,-17.1,-17.0,-16.9664,-16.8383,-16.7397,-16.5721,-16.56,-16.4,-16.0497,-16.0,-15.6357,-15.2414,-15.0,-14.8471,-14.4529,-14.4,-14.1571,-14.0783,-13.684,-13.5066,-13.5,-13.32,-13.14,-12.96,-12.718,-12.5209,-12.42,-12.1266,-12.0576,-12.0,-11.7,-11.6633,-11.6337,-11.407,-11.34,-11.25,-11.2,-11.1901,-11.0127,-10.9536,-10.8846,-10.8254,-10.786,-10.7071,-10.6283,-10.51,-10.44,-10.4311,-10.39,-10.3129,-10.2241,-9.8496,-9.8299,-9.4602,-9.4356,-9.3271,-9.18,-9.0659,-8.8984,-8.89,-8.8688,-8.8491,-8.8294,-8.5928,-8.5731,-8.5336,-8.5189,-8.4646,-8.4548,-8.302,-8.2823,-8.2379,-8.2182,-8.1394,-8.1295,-8.1,-8.0704,-8.0,-7.92,-7.8535,-7.6859,-7.6761,-7.6613,-7.5282,-7.3902,-7.38,-7.2,-7.1241,-7.0156,-7.0107,-7.0098,-6.9113,-6.8915,-6.8776,-6.7199,-6.6944,-6.668,-6.6057,-6.5622,-6.56,-6.517,-6.452,-6.4341,-6.344,-6.3,-6.2764,-6.236,-6.128,-6.02,-6.0,-5.912,-5.804,-5.7342,-5.728,-5.7145,-5.696,-5.588,-5.5469,-5.48,-5.4089,-5.4065,-5.372,-5.298,-5.2956,-5.264,-5.1871,-5.156,-5.048,-4.94,-4.832,-4.724,-4.616,-4.508,-4.5,-4.4,-4.292,-4.184,-4.076,-3.968,-3.86,-3.752,-3.644,-3.6,-3.536,-3.428,-3.32,-3.31,-3.212,-3.104,-2.996,-2.888,-2.78,-2.672,-2.564,-2.456,-2.348,-2.24,-2.132,-2.024,-1.916,-0.18,0.0,0.33,0.7,0.8,0.81,1.0,1.62,1.81,2.34,2.5,2.8,3.09,3.6,3.78,4.4,4.86,4.9,5.16,5.285714286,5.4,5.41,5.58,5.94,6.12,6.41,6.65,6.66,7.2,8.0,8.1,9.01,9.5687,9.72,9.99,10.8,10.95,11.1921,11.2,11.52,11.547,11.69,11.6919,11.74515714,11.8457,12.24,12.41,12.41051429,12.6,12.61,12.6323,12.78,12.88365714,12.9,13.1084,13.15,13.2,13.2385,13.26808,13.318,13.35,13.47509,13.5993,13.834,13.8358571428,13.9541428571,14.04285714,14.4,14.608,14.61,14.76,14.82,14.95,15.128,15.4918,15.57761,15.581,16.0,16.21,16.704,16.918,16.94,16.94085714,17.22,17.28,17.32,17.71,18.0,18.158,18.25,18.29,18.39,18.41,18.5,18.527,18.728,19.24,19.517,19.6,19.65,19.653,19.72,19.81,20.0,20.186,20.34,20.41,20.42,20.518,21.6,21.91,21.913,22.32,22.328,22.44,22.44981125,23.0,23.22,23.22035125,23.41,23.61,23.71,23.81,23.9,23.92,24.01,24.118,24.21,24.27,24.29,24.295336964285,24.2969,24.31,24.329,24.34,24.35,24.360464285714286,24.368021428571428,24.369335714285715,24.37065,24.37097,24.3718,24.37426,24.3749214285,24.375587,24.3765925,24.3768225,24.3814025,24.384125,24.389386,24.389587498660713,24.39914892723214,24.4,24.40415930229447,24.40417128576386,24.40417330999855,24.404176070089285,24.40664035580357,24.41,24.412,24.413,24.447,24.61,24.81,24.84,24.897,25.2,25.56,25.565,25.928,26.8,26.81,27.01,27.36,27.41,27.718,28.28,29.217,29.528,29.88,30.42,30.53,30.538,30.63,30.638,31.028,31.318,31.5,31.63,32.13,32.4,32.68,33.128,33.39,33.485,33.504,33.565,33.58,33.61,34.0,34.1,34.21,34.24,34.3,34.4,34.776,34.8,34.918,34.92,35.4,35.418,35.57,36.0,36.52,36.58,36.68,36.7033,36.715,36.728,36.928,37.112,37.128,37.328,37.44,37.528,37.728,37.928,38.128,38.3478,38.518,38.8,39.13,39.36231884,39.6,39.74,39.8,39.81,39.88,39.96,40.1739,40.18,40.328,42.0,42.118,42.28,42.86,43.2,45.0,45.718,46.8,47.47,47.52,49.318,50.04,52.56,52.918,53.84,55.08,56.518,57.6,60.118,60.12,62.64,63.6,63.718,65.16,66.67,67.318,67.48,67.68,69.39,70.0,70.2,70.918,72.0,72.72,73.04,73.043,74.518,75.24,75.6,76.69,76.695,77.0,77.14,77.76,78.118,79.2,80.28,81.718,82.8,83.6,84.0,85.32,85.68,87.84,97.2,111.6,183.6,212.4];

// ── 942 EDGES [fromIdx, toIdx, weight] ──
const EDGES_RAW=[[0,1,14.63],[0,6,43.2],[1,2,6.67],[2,3,3.29],[3,4,2.04],[4,5,10.0],[5,6,6.57],[6,7,3.43],[6,14,43.2],[7,8,2.67],[7,15,40.0],[8,9,2.7],[8,15,37.33],[9,10,4.04],[9,15,34.63],[10,11,0.96],[10,15,30.59],[11,12,7.41],[12,13,11.16],[13,14,10.83],[14,15,0.23],[14,19,18.0],[15,16,14.17],[15,19,17.77],[16,17,1.8],[17,18,1.18],[18,19,0.62],[19,20,3.6],[19,21,3.6016],[20,21,0.0016],[21,22,0.7984],[21,30,7.5703],[21,66,20.0001],[21,356,60.0184],[21,429,70.0184],[22,23,1.2814],[22,32,9.1671],[23,24,1.035],[23,36,8.9897],[24,25,0.8872],[24,39,8.9207],[25,26,0.69],[25,40,8.97],[26,27,0.6407],[26,41,8.8221],[27,28,1.5968],[27,44,9.4826],[28,29,0.5289],[28,33,3.5979],[29,30,0.1119],[29,38,4.54],[30,31,1.8432],[30,50,9.5515],[31,32,0.552],[31,49,7.659],[32,33,0.5619],[33,34,0.271],[33,35,0.4239],[34,35,0.1529],[35,36,0.1182],[35,45,4.83],[36,37,0.138],[37,38,0.7909],[37,70,9.3643],[38,39,0.0371],[38,43,1.7],[39,40,0.9365],[40,41,0.5421],[41,42,0.0943],[41,43,0.1843],[42,43,0.09],[43,44,1.1169],[44,45,0.966],[45,46,0.1571],[45,47,0.1577],[45,71,4.83],[46,47,0.0006],[47,48,0.1971],[47,50,1.1828],[48,49,0.9364],[48,84,5.934],[49,50,0.0493],[50,51,0.0197],[50,57,0.8766],[51,52,0.345],[52,53,0.1119],[52,54,0.1183],[52,83,4.2682],[53,54,0.0064],[54,55,0.1775],[54,58,0.5126],[55,56,0.0899095238],[55,57,0.2161],[55,87,4.5737],[56,57,0.1261904762],[57,58,0.119],[57,64,1.3117],[58,59,0.2957],[58,67,2.3559],[59,60,0.1853],[59,61,0.3154],[59,73,2.3559],[59,291,32.8772],[60,61,0.1301],[61,62,0.2958],[61,76,2.2672],[62,63,0.2841],[62,64,0.2858],[62,68,1.4588],[63,64,0.0017],[64,65,0.6883],[64,66,0.69],[65,66,0.0017],[66,67,0.4732],[66,69,0.5126],[66,72,0.7393],[66,82,1.725],[67,68,0.0098],[68,69,0.0296],[69,70,0.0591],[69,72,0.2267],[70,71,0.0395],[71,72,0.1281],[71,105,4.83],[72,73,0.0296],[73,74,0.0394],[74,75,0.1774],[74,85,1.3504],[75,76,0.0099],[75,80,0.5915],[75,86,1.3406],[75,92,1.7743],[76,77,0.3351],[77,78,0.00673043],[77,79,0.1282],[78,79,0.12146957],[79,80,0.1183],[80,81,0.0211],[80,86,0.7491],[80,93,1.2814],[80,94,1.449],[80,95,1.4611],[81,82,0.1267],[81,250,18.0],[81,336,36.0],[82,83,0.0296],[83,84,0.3154],[84,85,0.0887],[85,86,0.1676],[86,87,0.0296],[87,88,0.1084],[88,89,0.034],[88,91,0.1676],[88,92,0.2957],[88,93,0.3943],[88,94,0.5619],[88,97,1.0843],[89,90,0.1],[90,91,0.0336],[91,92,0.1281],[92,93,0.0986],[93,94,0.1676],[94,95,0.0121],[95,96,0.16],[95,98,0.56],[96,97,0.3503],[97,98,0.0497],[98,99,0.3643],[98,100,0.7586],[99,100,0.3943],[99,102,0.7886],[99,103,1.1828],[100,101,0.2414],[101,102,0.1529],[101,118,3.0],[101,166,7.0],[102,103,0.3942],[103,104,0.0529],[104,105,0.2429],[104,109,0.9],[104,110,1.08],[104,111,1.26],[104,112,1.44],[105,106,0.0788],[105,144,4.83],[106,107,0.3943],[107,108,0.1774],[108,109,0.0066],[108,113,0.7886],[109,110,0.18],[110,111,0.18],[111,112,0.18],[112,113,0.242],[112,115,0.54],[113,114,0.1971],[114,115,0.1009],[114,116,0.3943],[115,116,0.2934],[115,119,0.72],[116,117,0.069],[117,118,0.0576],[117,120,0.3943],[118,119,0.3],[118,147,3.1016],[118,166,4.0],[119,120,0.0367],[119,123,0.36],[120,121,0.0296],[121,122,0.2267],[122,123,0.067],[122,126,0.2169],[123,124,0.09],[123,126,0.1499],[123,145,2.16],[124,125,0.05],[125,126,0.0099],[126,127,0.1774],[127,128,0.0591],[128,129,0.069],[129,130,0.0592],[130,131,0.0394],[130,133,0.1971],[130,136,0.3943],[130,139,0.6013],[130,140,0.9758],[131,132,0.0789],[132,133,0.0788],[133,134,0.1183],[133,136,0.1972],[134,135,0.07],[134,136,0.0789],[134,137,0.12],[135,136,0.0089],[136,137,0.0411],[137,138,0.0771],[137,139,0.1659],[137,420,37.2],[138,139,0.0888],[139,140,0.3745],[139,141,0.3942],[140,141,0.0197],[141,142,0.3697],[142,143,0.0246],[143,144,0.1085],[143,189,2.9186],[144,145,0.1471],[144,146,0.2612],[144,222,4.8271],[145,146,0.1141],[145,164,1.08],[146,147,0.1675],[147,148,0.0084],[148,149,0.0212],[149,150,0.0197],[150,151,0.0197],[151,152,0.2366],[152,153,0.0197],[153,154,0.0395],[153,155,0.0542],[154,155,0.0147],[155,156,0.0543],[156,157,0.0098],[157,158,0.1528],[158,159,0.0197],[159,160,0.0444],[160,161,0.0197],[161,162,0.0788],[162,163,0.0099],[163,164,0.0295],[164,165,0.0296],[164,167,0.18],[165,166,0.0704],[166,167,0.08],[167,168,0.0665],[167,174,0.54],[168,169,0.1676],[169,170,0.0098],[170,171,0.0148],[171,172,0.1331],[172,173,0.138],[173,174,0.0102],[174,175,0.18],[174,176,0.2559],[174,185,0.712],[175,176,0.0759],[176,177,0.1085],[177,178,0.0049],[178,179,0.0009],[179,180,0.0985],[180,181,0.0198],[181,182,0.0139],[182,183,0.1577],[183,184,0.0255],[184,185,0.0264],[184,186,0.0887],[185,186,0.0623],[185,188,0.108],[186,187,0.0435],[187,188,0.0022],[187,191,0.1281],[187,194,0.2858],[188,189,0.043],[188,190,0.108],[189,190,0.065],[190,191,0.0179],[190,192,0.108],[191,192,0.0901],[192,193,0.044],[192,195,0.108],[193,194,0.0236],[193,198,0.3],[193,202,0.572],[193,235,2.99],[193,250,6.3],[194,195,0.0404],[194,201,0.5422],[194,206,0.7295],[194,208,0.8675],[195,196,0.108],[196,197,0.108],[197,198,0.02],[197,199,0.108],[198,199,0.088],[198,202,0.272],[199,200,0.108],[200,201,0.0698],[200,204,0.108],[201,202,0.0062],[201,203,0.0197],[202,203,0.0135],[202,235,2.418],[202,250,5.728],[203,204,0.0185],[203,206,0.1676],[203,208,0.3056],[204,205,0.108],[205,206,0.0411],[205,207,0.108],[206,207,0.0669],[206,208,0.138],[207,208,0.0711],[207,210,0.108],[208,209,0.0024],[209,210,0.0345],[210,211,0.074],[210,213,0.108],[211,212,0.0024],[212,213,0.0316],[212,214,0.1085],[213,214,0.0769],[213,215,0.108],[214,215,0.0311],[214,222,0.6871],[215,216,0.108],[216,217,0.108],[217,218,0.108],[218,219,0.108],[219,220,0.108],[220,221,0.108],[221,222,0.008],[221,223,0.108],[222,223,0.1],[222,251,4.83],[223,224,0.108],[224,225,0.108],[225,226,0.108],[226,227,0.108],[227,228,0.108],[228,229,0.108],[229,230,0.108],[230,231,0.044],[230,232,0.108],[231,232,0.064],[232,233,0.108],[233,234,0.108],[234,235,0.01],[235,236,0.098],[235,250,3.31],[235,427,32.838],[236,237,0.108],[237,238,0.108],[238,239,0.108],[239,240,0.108],[240,241,0.108],[241,242,0.108],[242,243,0.108],[243,244,0.108],[244,245,0.108],[245,246,0.108],[246,247,0.108],[247,248,0.108],[248,249,2.096],[249,250,0.18],[249,256,1.44],[250,251,0.33],[250,253,0.8],[250,257,1.81],[250,262,3.6],[250,284,10.8],[250,285,10.95],[250,297,12.6],[250,300,12.78],[250,336,18.0],[250,360,21.913],[250,415,25.2],[250,417,25.565],[250,436,31.5],[250,477,38.3478],[250,523,72.0],[250,526,73.043],[250,529,75.6],[250,531,76.695],[251,252,0.37],[251,253,0.47],[251,267,4.83],[252,253,0.1],[253,254,0.01],[253,256,0.82],[253,264,3.6],[254,255,0.19],[255,256,0.62],[256,257,0.19],[256,258,0.72],[257,258,0.53],[257,262,1.79],[258,259,0.16],[258,262,1.26],[258,263,1.44],[259,260,0.3],[260,261,0.29],[261,262,0.51],[262,263,0.18],[262,270,1.81],[262,277,3.6],[263,264,0.62],[263,265,1.08],[264,265,0.46],[265,266,0.04],[265,267,0.3],[265,271,0.72],[266,267,0.26],[267,268,0.125714286],[267,270,0.25],[267,283,4.83],[268,269,0.114285714],[269,270,0.01],[270,271,0.17],[270,273,0.71],[270,277,1.79],[271,272,0.36],[272,273,0.18],[272,276,0.72],[273,274,0.29],[274,275,0.24],[274,294,5.83],[274,295,6.0],[275,276,0.01],[275,281,2.9187],[276,277,0.54],[277,278,0.8],[277,279,0.9],[277,280,1.81],[277,284,3.6],[278,279,0.1],[279,280,0.91],[280,281,0.5587],[280,282,0.71],[280,284,1.79],[280,286,2.1821],[281,282,0.1513],[281,286,1.6234],[281,291,2.1232],[282,283,0.27],[282,294,2.52],[283,284,0.81],[284,285,0.15],[284,286,0.3921],[284,298,1.81],[284,316,3.6],[285,286,0.2421],[286,287,0.0079],[286,289,0.3549],[287,288,0.32],[288,289,0.027],[289,290,0.143],[289,291,0.1449],[289,297,1.053],[289,382,12.782],[289,410,12.9],[289,414,13.35],[289,469,25.565],[290,291,0.0019],[291,292,0.05325714],[291,293,0.1538],[292,293,0.10054286],[293,294,0.3943],[293,321,3.1043],[294,295,0.17],[294,297,0.36],[294,319,2.52],[294,407,12.17],[295,296,0.00051429],[295,297,0.19],[295,341,6.0],[295,407,12.0],[296,297,0.18948571],[297,298,0.01],[297,300,0.18],[297,302,0.3],[298,299,0.0223],[298,300,0.17],[298,316,1.79],[299,300,0.1477],[300,301,0.10365714],[300,302,0.12],[300,417,12.785],[301,302,0.01634286],[302,303,0.2084],[302,308,0.418],[303,304,0.0416],[304,305,0.05],[305,306,0.0385],[306,307,0.02958],[307,308,0.04992],[308,309,0.032],[308,322,1.81],[308,329,3.6],[308,334,4.002],[308,478,25.2],[309,310,0.12509],[309,311,0.2493],[309,316,1.05],[309,370,10.36],[310,311,0.12421],[311,312,0.2347],[311,316,0.8007],[312,313,0.0018571428],[313,314,0.1182857143],[314,315,0.0887142829],[315,316,0.35714286],[316,317,0.208],[316,327,1.81],[316,336,3.6],[317,318,0.002],[317,319,0.152],[318,319,0.15],[319,320,0.06],[319,340,3.63],[320,321,0.13],[320,348,4.83],[321,322,0.178],[322,323,0.3638],[322,327,1.082],[322,329,1.79],[323,324,0.08581],[324,325,0.00339],[325,326,0.419],[326,327,0.21],[327,328,0.494],[327,329,0.708],[327,335,1.5],[327,336,1.79],[327,351,3.6],[328,329,0.214],[329,330,0.022],[329,332,0.302],[329,344,1.81],[329,357,3.6],[330,331,0.00085714],[331,332,0.27914286],[332,333,0.06],[332,334,0.1],[333,334,0.04],[334,335,0.39],[335,336,0.29],[336,337,0.158],[336,339,0.29],[336,340,0.39],[336,351,1.81],[336,358,3.6],[337,338,0.092],[338,339,0.04],[339,340,0.1],[340,341,0.02],[340,344,0.338],[340,358,3.21],[340,361,3.93],[341,342,0.09],[341,344,0.318],[341,407,6.0],[342,343,0.027],[343,344,0.201],[344,345,0.512],[344,348,0.922],[344,357,1.79],[344,362,3.6],[345,346,0.277],[346,347,0.083],[347,348,0.05],[348,349,0.003],[348,351,0.16],[348,354,0.69],[349,350,0.067],[350,351,0.09],[351,352,0.19],[351,358,1.79],[351,368,3.6],[352,353,0.186],[353,354,0.154],[354,355,0.07],[355,356,0.01],[356,357,0.098],[356,429,10.0],[357,358,1.082],[357,362,1.81],[357,375,3.6],[358,359,0.31],[358,360,0.313],[358,361,0.72],[358,368,1.81],[358,415,3.6],[359,360,0.003],[360,361,0.407],[361,362,0.008],[361,413,2.52],[362,363,0.112],[362,368,1.082],[362,375,1.79],[362,418,3.6],[363,364,0.00981125],[364,365,0.55018875],[365,366,0.22],[366,367,0.00035125],[367,368,0.18964875],[368,369,0.2],[368,412,1.4],[368,415,1.79],[368,427,6.118],[369,370,0.1],[369,371,0.2],[370,371,0.1],[370,381,0.6],[370,407,0.7],[371,372,0.09],[371,374,0.2],[372,373,0.02],[373,374,0.09],[374,375,0.108],[374,376,0.2],[375,376,0.092],[375,418,1.81],[375,424,3.6],[376,377,0.06],[376,378,0.08],[376,381,0.1],[376,407,0.2],[377,378,0.02],[377,407,0.14],[378,379,0.0053369643],[378,380,0.0069],[378,382,0.039],[378,410,0.157],[378,420,2.52],[379,380,0.0015630357],[380,381,0.0131],[380,382,0.0321],[380,420,2.5131],[380,488,15.877],[381,382,0.019],[381,407,0.1],[382,383,0.011],[382,407,0.081],[382,469,12.783],[382,488,15.8449],[383,384,0.01],[384,385,0.0104642857],[385,386,0.0075571429],[386,387,0.0013142857],[387,388,0.0013142857],[388,389,0.00032],[389,390,0.00083],[390,391,0.00246],[391,392,0.0006614285],[392,393,0.0006655715],[393,394,0.0010055],[394,395,0.00023],[395,396,0.00458],[396,397,0.0027225],[397,398,0.005261],[398,399,0.0002014987],[399,400,0.0095614286],[400,401,0.0008510728],[401,402,0.0041593023],[402,403,1.19835e-05],[403,404,2.0242e-06],[404,405,2.7601e-06],[405,406,0.0024642857],[406,407,0.0033596442],[407,408,0.002],[407,410,0.037],[407,411,0.2],[407,423,3.0],[408,409,0.001],[408,410,0.035],[409,410,0.034],[410,411,0.163],[410,414,0.45],[411,412,0.2],[412,413,0.03],[413,414,0.057],[413,422,2.52],[413,439,7.56],[414,415,0.303],[415,416,0.36],[415,417,0.365],[416,417,0.005],[417,418,0.363],[418,419,0.872],[418,420,0.882],[418,421,1.082],[418,424,1.79],[418,427,3.6],[419,420,0.01],[420,421,0.2],[421,422,0.35],[422,423,0.05],[422,428,2.52],[423,424,0.308],[424,425,0.562],[424,427,1.81],[424,435,3.6],[425,426,0.937],[425,464,8.4],[425,465,8.4233],[425,466,8.435],[426,427,0.311],[426,431,1.321],[426,433,1.421],[426,434,1.811],[427,428,0.352],[427,434,1.5],[427,435,1.79],[427,441,3.6],[428,429,0.54],[428,439,2.52],[429,430,0.11],[429,431,0.118],[430,431,0.008],[431,432,0.092],[431,433,0.1],[432,433,0.008],[433,434,0.39],[434,435,0.29],[434,437,0.602],[435,436,0.182],[435,437,0.312],[435,441,1.81],[435,444,2.186],[435,456,3.6],[436,437,0.13],[437,438,0.5],[438,439,0.27],[438,440,0.55],[439,440,0.28],[439,457,2.52],[440,441,0.448],[440,444,0.824],[441,442,0.262],[441,443,0.357],[441,445,0.437],[441,447,0.482],[441,449,0.972],[441,451,1.112],[441,455,1.672],[441,456,1.79],[441,467,3.6],[442,443,0.095],[443,444,0.019],[444,445,0.061],[444,448,0.496],[444,456,1.414],[445,446,0.015],[445,447,0.045],[446,447,0.03],[447,448,0.39],[448,449,0.1],[448,452,0.3],[449,450,0.11],[449,451,0.14],[450,451,0.03],[451,452,0.06],[452,453,0.1],[452,455,0.5],[452,456,0.618],[453,454,0.376],[454,455,0.024],[455,456,0.118],[456,457,0.002],[456,459,0.5],[456,467,1.81],[456,478,3.6],[457,458,0.48],[457,459,0.498],[457,472,2.52],[458,459,0.018],[459,460,0.152],[459,462,1.102],[460,461,0.43],[461,462,0.52],[462,463,0.06],[462,464,0.16],[462,488,3.6539],[463,464,0.1],[464,465,0.0233],[465,466,0.0117],[466,467,0.013],[467,468,0.2],[467,476,1.4],[467,478,1.79],[467,488,3.4459],[468,469,0.184],[468,470,0.2],[469,470,0.016],[470,471,0.2],[471,472,0.112],[471,473,0.2],[472,473,0.088],[472,486,2.44],[473,474,0.2],[474,475,0.2],[475,476,0.2],[476,477,0.2198],[477,478,0.1702],[478,479,0.282],[478,483,1.222],[479,480,0.33],[480,481,0.23231884],[481,482,0.23768116],[482,483,0.14],[483,484,0.06],[484,485,0.01],[484,486,0.08],[485,486,0.07],[486,487,0.08],[486,488,0.2939],[486,494,2.98],[487,488,0.2139],[488,489,0.0061],[488,493,2.1061],[488,517,27.3061],[489,490,0.148],[490,491,1.672],[491,492,0.118],[491,493,0.28],[492,493,0.162],[493,494,0.58],[493,517,25.2],[494,495,0.34],[494,496,2.14],[495,496,1.8],[496,497,0.718],[496,498,1.8],[496,500,2.52],[497,498,1.082],[498,499,0.67],[499,500,0.05],[500,501,1.798],[500,502,2.52],[501,502,0.722],[502,503,2.52],[503,504,0.358],[503,506,2.52],[504,505,0.922],[505,506,1.24],[506,507,1.438],[506,508,2.52],[507,508,1.082],[508,509,2.518],[508,510,2.52],[509,510,0.002],[510,511,2.52],[511,512,0.96],[511,514,2.52],[512,513,0.118],[512,514,1.56],[513,514,1.442],[514,515,1.51],[514,517,2.32],[514,518,2.52],[515,516,0.648],[515,517,0.81],[516,517,0.162],[517,518,0.2],[518,519,1.71],[518,521,2.52],[519,520,0.61],[520,521,0.2],[521,522,0.718],[521,523,1.8],[521,524,2.52],[522,523,1.082],[523,524,0.72],[523,529,3.6],[524,525,0.32],[524,526,0.323],[524,528,2.52],[525,526,0.003],[526,527,1.475],[526,528,2.197],[526,531,3.652],[527,528,0.722],[528,529,0.36],[528,534,2.52],[529,530,1.09],[529,531,1.095],[530,531,0.005],[531,532,0.305],[531,534,1.065],[532,533,0.14],[533,534,0.62],[534,535,0.358],[534,536,1.44],[534,537,2.52],[535,536,1.082],[536,537,1.08],[537,538,1.438],[537,539,2.52],[538,539,1.082],[539,540,0.8],[539,542,2.52],[539,543,2.88],[539,544,5.04],[539,545,14.4],[540,541,0.4],[541,542,1.32],[542,543,0.36],[542,544,2.52],[543,544,2.16],[544,545,9.36],[545,546,14.4],[546,547,72.0],[547,548,28.8]];

// ═══════════════════════════════════════════════════════════
// GRAPH ENGINE — adjacency, classification, d-separation
// ═══════════════════════════════════════════════════════════
const N = NODE_YS.length;
export const NODE_COUNT = N;          // App.jsx reads the node and edge counts from here
export const EDGE_COUNT = EDGES_RAW.length;
const CHILDREN = Array.from({length:N},()=>[]);
const PARENTS = Array.from({length:N},()=>[]);
for (const [fi,ti,w] of EDGES_RAW) { CHILDREN[fi].push([ti,w]); PARENTS[ti].push([fi,w]); }

const NODE_CLASS = new Array(N);
for (let i=0;i<N;i++){
  const ind=PARENTS[i].length, outd=CHILDREN[i].length;
  if(ind>=2&&outd>=2) NODE_CLASS[i]="collider_fork";
  else if(ind>=2&&outd>=1) NODE_CLASS[i]="collider";
  else if(ind>=2) NODE_CLASS[i]="collider_sink";
  else if(outd>=2) NODE_CLASS[i]="fork";
  else if(ind===1&&outd===1) NODE_CLASS[i]="chain";
  else if(ind===0) NODE_CLASS[i]="source";
  else NODE_CLASS[i]="sink";
}

function findNearestIdx(y){
  let best=0,bestD=Infinity;
  for(let i=0;i<N;i++){const d=Math.abs(NODE_YS[i]-y);if(d<bestD){bestD=d;best=i;}}
  return best;
}
const EPSILON=0.15;

function dSeparationCascade(touchedIdx,conditionedSet){
  const visited=new Set(),open=new Set(),blocked=new Set(),paths=[];
  const queue=[];
  for(const[ci]of CHILDREN[touchedIdx]) queue.push([ci,"down",[touchedIdx,ci]]);
  for(const[pi]of PARENTS[touchedIdx]) queue.push([pi,"up",[touchedIdx,pi]]);
  for(let i=queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]];}
  while(queue.length){
    const[idx,dir,path]=queue.shift();
    const sk=`${idx}:${dir}`;
    if(visited.has(sk))continue;visited.add(sk);
    const isCond=conditionedSet.has(idx);
    const isCollider=NODE_CLASS[idx].startsWith("collider");
    if(isCollider){
      if(isCond){open.add(idx);paths.push({path:[...path],type:"collider_open"});
        for(const[pi]of PARENTS[idx])if(!visited.has(`${pi}:up`))queue.push([pi,"up",[...path,pi]]);
        for(const[ci]of CHILDREN[idx])if(!visited.has(`${ci}:down`))queue.push([ci,"down",[...path,ci]]);
      } else blocked.add(idx);
    } else {
      if(!isCond){open.add(idx);paths.push({path:[...path],type:dir==="down"?"chain_open":"fork_open"});
        if(dir==="down")for(const[ci]of CHILDREN[idx])if(!visited.has(`${ci}:down`))queue.push([ci,"down",[...path,ci]]);
        else for(const[pi]of PARENTS[idx])if(!visited.has(`${pi}:up`))queue.push([pi,"up",[...path,pi]]);
        if(NODE_CLASS[idx]==="fork"||NODE_CLASS[idx]==="collider_fork")
          for(const[ci]of CHILDREN[idx])if(!visited.has(`${ci}:down`))queue.push([ci,"down",[...path,ci]]);
      } else blocked.add(idx);
    }
  }
  return {open,blocked,paths};
}

// ═══════════════════════════════════════════════════════════
// OBSERVATION LAYER — Hodges & Dewar (1992) validation
// Five states: keep-in-view | confirmed | rejected | refined | reverse-and-rebuild
// ═══════════════════════════════════════════════════════════
const OBS_STATES=["keep-in-view","confirmed","rejected","refined","reverse-and-rebuild"];
const OBS_COLORS={"keep-in-view":"#c8b478","confirmed":"#50b478","rejected":"#e06040","refined":"#8080c0","reverse-and-rebuild":"#c04080"};
const LOCKIN_DECAY=0.6;

function emptyStore(sfoLabel,A,C){
  return {sfo:sfoLabel,A,C,observations:[],lockins:[],projections:[]};
}

function mkObs(nodeY,prompt,digest,state,keywords,liveY,travelY){
  return {id:`obs_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,nodeY,prompt,digest,state,keywords:keywords||[],
    timestamp:new Date().toISOString(),liveY,travelY};
}

function mkLockin(nodeY,keyword,obsId){
  return {id:`lk_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,nodeY,keyword,observation_id:obsId,
    locked_at:new Date().toISOString(),state:"active",reversal_id:null,reversal_reason:null};
}

function mkProjection(sourceY,targetY,edgeWeight,digest,prompt,A){
  const daysToTarget=Math.abs(targetY-sourceY)*A;
  const expected=new Date(Date.now()+daysToTarget*MSD);
  return {id:`proj_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,sourceY,targetY,edgeWeight,digest,prompt,
    projected_at:new Date().toISOString(),expected_arrival:expected.toISOString(),
    resolution_state:null,resolution_observation_id:null,resolved_at:null};
}

function nodeObs(store,y){ return store.observations.filter(o=>Math.abs(o.nodeY-y)<0.001); }
function nodeLockins(store,y){ return store.lockins.filter(l=>Math.abs(l.nodeY-y)<0.001&&l.state==="active"); }
function neighborLockins(store,nodeIdx){
  const result=[];
  for(const[pi]of PARENTS[nodeIdx]){
    const lks=store.lockins.filter(l=>Math.abs(l.nodeY-NODE_YS[pi])<0.001&&l.state==="active");
    for(const lk of lks) result.push({...lk,weight:LOCKIN_DECAY,fromIdx:pi});
  }
  for(const[ci]of CHILDREN[nodeIdx]){
    const lks=store.lockins.filter(l=>Math.abs(l.nodeY-NODE_YS[ci])<0.001&&l.state==="active");
    for(const lk of lks) result.push({...lk,weight:LOCKIN_DECAY*0.8,fromIdx:ci});
  }
  return result;
}
function pendingProjections(store,y){ return store.projections.filter(p=>!p.resolution_state&&Math.abs(p.targetY-y)<0.5); }

// ── Knowledge-server feeds ──
// feeds/build.py reads each publisher's RSS/RDF/Atom feed on the author's computer and publishes
// one JSON Feed 1.1 snapshot beside the page (a static page cannot read other sites' feeds).
const FEED_SNAPSHOT="feeds/all.json";
const FEED_DOMAINS=[
  ["world","World"],["middle-east","Middle East"],["russia-eurasia","Russia & Eurasia"],["balkans","Balkans"],["asia","Asia"],
  ["africa","Africa & Nigeria"],["geopolitical-analysis","Geopolitical analysis"],["defense-nuclear","Defence & nuclear"],
  ["economic","Economic"],["religious","Religious"],["science-technology","Science & technology"],["sports","Sports"],
  ["prediction-markets","Prediction markets"],
];
const feedDomainLabel=d=>(FEED_DOMAINS.find(([k])=>k===d)||[d,d])[1];

// One entry per source, in the shape the digest context has always used:
// {source, items:[{title,link,description,pubDate,source}], error} — plus domain, perspective, fetched.
async function loadFeedSnapshot(){
  const r=await fetch(FEED_SNAPSHOT,{cache:"no-cache"});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const feed=await r.json();
  const bySource=new Map(feed._jomo.sources.map(s=>[s.id,{source:s.label,id:s.id,domain:s.domain,perspective:s.perspective,
    via:s.via,fetched:s.fetched,error:s.error,items:[]}]));
  for(const it of feed.items){
    const entry=bySource.get(it._jomo.source);
    if(entry) entry.items.push({title:it.title,link:it.url,description:it.summary||"",pubDate:it.date_published||"",source:entry.source});
  }
  return {generated:feed._jomo.generated,sources:[...bySource.values()]};
}

function feedAge(iso){
  if(!iso)return "";
  const m=Math.round((Date.now()-Date.parse(iso))/60000);
  return m<60?`${Math.max(m,0)}m`:m<2880?`${Math.round(m/60)}h`:`${Math.round(m/1440)}d`;
}

// ── Digest Engine ──
async function requestDigest(ctx){
  try{const r=await fetch("/api/digest",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(ctx),signal:AbortSignal.timeout(30000)});
    if(!r.ok)return {digest:null,error:`HTTP ${r.status}`};
    const d=await r.json();return {digest:d.content?.map(c=>c.text||"").join("\n")||"",error:null};
  }catch(e){return {digest:null,error:e.message};}
}

// ═══════════════════════════════════════════════════════════
// STYLES — derived from ThemeContext; dark themes keep the
// original dark palette, light themes map to their equivalents.
// Call useStyles() inside the component (it uses useTheme()).
// ═══════════════════════════════════════════════════════════
function useStyles(){
  const t=useTheme();
  if(t.isDark) return {
    bg:"#060610",inputBg:"#0c0c14",
    fg:"#d0c4a0",dim:"rgba(200,180,140,0.4)",dim2:"rgba(200,180,140,0.25)",
    acc:"#f0c040",pink:"#FF1493",pinkGlow:"#FF69B4",travel:"#c080ff",
    green:"rgba(80,180,120,0.7)",openG:"rgba(80,255,140,0.7)",blockR:"rgba(255,60,60,0.5)",
    condG:"#FFD740",border:"rgba(200,180,140,0.1)",panelBg:"rgba(200,180,140,0.03)",
    fgMuted:"#555",btnDisabledBg:"rgba(255,255,255,0.03)",btnDisabledBorder:"rgba(255,255,255,0.08)",
  };
  return {
    bg:t.bg.card,inputBg:t.bg.input,
    fg:t.text.primary,dim:t.text.secondary,dim2:t.text.muted,
    acc:t.accent.gold,pink:t.accent.pink,pinkGlow:t.accent.pink,travel:t.accent.purple,
    green:t.accent.green,openG:t.accent.green,blockR:t.accent.red,
    condG:t.accent.gold,border:t.border.card,panelBg:t.bg.cardAlt,
    fgMuted:t.text.muted,btnDisabledBg:t.bg.cardAlt,btnDisabledBorder:t.border.subtle,
  };
}

// ═══════════════════════════════════════════════════════════
// SFO FORGE — Solver algebra + anchor presets
// Z = A*Y + C
// Two anchors: exact solve.  Three+: least-squares regression.
// ═══════════════════════════════════════════════════════════
const ANCHOR_PRESETS=[
  {y:0.0,label:"BB=0 (Origin/ZTP)",hint:"C equals the TNLDY at this node."},
  {y:-18.0,label:"BB=-18 (Hub d9)",hint:"Major hub degree 9 in deep structure."},
  {y:-147.6,label:"BB=-147.6 (Source)",hint:"Single source node of the DAG."},
  {y:10.8,label:"BB=10.8 (Hub d8)",hint:"Hub connected to origin w=10.8."},
  {y:21.6,label:"BB=21.6 (Hub d8)",hint:"Hub node degree 8."},
  {y:33.128,label:"BB=33.128 (Mega-hub d12)",hint:"Highest degree non-origin node."},
  {y:82.8,label:"BB=82.8",hint:"Deep future structure."},
  {y:212.4,label:"BB=212.4 (Sink)",hint:"Single sink node of the DAG."},
];
const PREVIEW_YS=[-147.6,-104.4,-60.97,-43.2,-18.0,0.0,3.6,10.8,18.0,21.6,25.2,33.128,38.3478,72.0,82.8,111.6,212.4];

function dateStrToTnldy(s){const ms=new Date(s+"T00:00:00+01:00").getTime();return isNaN(ms)?null:tnldy(ms);}  // the day's start in Nsukka

// Exact solve from 2 anchors
function solveExact(y1,z1,y2,z2){
  if(Math.abs(y2-y1)<1e-6) return null;
  const A=(z2-z1)/(y2-y1);
  const C=z1-A*y1;
  return A>0?{A,C,residual:0,method:"exact"}:null;
}

// Least-squares for n>=2 anchors: minimise sum (Z_i - A*Y_i - C)^2
// Normal equations: [sum(Yi^2) sum(Yi)] [A]   [sum(Yi*Zi)]
//                   [sum(Yi)   n      ] [C] = [sum(Zi)   ]
function solveLeastSquares(anchors){
  const n=anchors.length;
  if(n<2) return null;
  let sy=0,sz=0,syy=0,syz=0;
  for(const{y,z}of anchors){sy+=y;sz+=z;syy+=y*y;syz+=y*z;}
  const det=syy*n-sy*sy;
  if(Math.abs(det)<1e-12) return null;
  const A=(syz*n-sy*sz)/det;
  const C=(syy*sz-sy*syz)/det;
  if(A<=0) return null;
  let ssr=0;
  for(const{y,z}of anchors){const r=z-(A*y+C);ssr+=r*r;}
  const rmse=Math.sqrt(ssr/n);
  return {A,C,residual:rmse,method:n===2?"exact":"least-squares (n="+n+")"};
}

function forgeTimeline(A,C){
  const zNow=tnldyNow();
  return PREVIEW_YS.map(y=>{
    const z=A*y+C;const d=tnldyToDate(z);const df=z-zNow;
    return {y,z,date:fd(d),daysFromNow:Math.round(df),isPast:z<zNow};
  });
}

function forgeTimelineAll(A,C){
  const zNow=tnldyNow();
  return NODE_YS.map(y=>{
    const z=A*y+C;const d=tnldyToDate(z);const df=z-zNow;
    return {y,z,date:fd(d),daysFromNow:Math.round(df),isPast:z<zNow};
  });
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function SFOWAMEngine({
  agentA = 100,      // Traversal coefficient
  agentC = 17651.8,  // Zero-traversal point
  sfoLabel = "SFO26", // Display label
  onForge = null,    // Callback to persist forged SFO to registry
}){
  const S = useStyles();  // theme-derived colour palette

  // ── Time ──
  const [now,setNow]=useState(Date.now());
  const [travelY,setTravelY]=useState(null);
  const [yInput,setYInput]=useState("");
  const [zInput,setZInput]=useState("");

  // ── Graph state ──
  const [selectedIdx,setSelectedIdx]=useState(null);
  const [conditioned,setConditioned]=useState(new Set());
  const [dsepResult,setDsepResult]=useState(null);
  const [activations,setActivations]=useState({});
  const [tab,setTab]=useState("observe");

  // ── Observation pipeline state ──
  const [obsStore,setObsStore]=useState(()=>emptyStore(sfoLabel,agentA,agentC));
  const [digestPrompt,setDigestPrompt]=useState("");
  const [digestResult,setDigestResult]=useState(null);
  const [digestLoading,setDigestLoading]=useState(false);
  const [mockDigest,setMockDigest]=useState("");
  const [obsKeywords,setObsKeywords]=useState("");

  // ── Feed state ──
  const [feedResults,setFeedResults]=useState({});
  const [feedLoading,setFeedLoading]=useState(false);
  const [feedGenerated,setFeedGenerated]=useState(null);
  const [feedError,setFeedError]=useState(null);
  const [feedDomain,setFeedDomain]=useState("all");
  const [feedView,setFeedView]=useState("latest");

  // ── SFO FORGE state ──
  const [forgeAnchors,setForgeAnchors]=useState([{y:"0",date:""},{y:"-18",date:""}]);
  const [forgeMode,setForgeMode]=useState("anchors"); // "anchors" | "one_plus_A"
  const [forgeDirectA,setForgeDirectA]=useState("");
  const [forgeName,setForgeName]=useState("");
  const [forgedSFOs,setForgedSFOs]=useState([]); // registry of created SFOs
  const [sfoStores,setSfoStores]=useState({}); // per-SFO observation stores keyed by id
  const [overrideA,setOverrideA]=useState(null); // null = use props
  const [overrideC,setOverrideC]=useState(null);
  const [overrideLabel,setOverrideLabel]=useState(null);
  const [showFull399,setShowFull399]=useState(false);
  const [forgeToast,setForgeToast]=useState(null); // name of last-created SFO, auto-clears

  // ── CSV download for the full timeline, every node ──
  const downloadCSV=useCallback((rows,filename)=>{
    const hdr="BB_Y,TNLDY_Z,Calendar_Date,Days_From_Now,Past_Or_Future\n";
    const body=rows.map(r=>r.y+","+r.z.toFixed(6)+","+r.date+","+r.daysFromNow+","+(r.isPast?"past":"future")).join("\n");
    const blob=new Blob([hdr+body],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
  },[]);

  // ── Active agent params (forge override or props) ──
  const curA=overrideA!==null?overrideA:agentA;
  const curC=overrideC!==null?overrideC:agentC;
  const curLabel=overrideLabel||sfoLabel;

  // ── Switch active SFO ──
  const switchToSFO=useCallback((sfo)=>{
    // Save current obsStore to sfoStores
    const curId=overrideLabel||sfoLabel;
    setSfoStores(prev=>({...prev,[curId]:obsStore}));
    // Load target store or create fresh
    const targetStore=sfoStores[sfo.name]||emptyStore(sfo.name,sfo.A,sfo.C);
    setObsStore(targetStore);
    setOverrideA(sfo.A);setOverrideC(sfo.C);setOverrideLabel(sfo.name);
    setTravelY(null);setTab("observe");
  },[obsStore,sfoStores,overrideLabel,sfoLabel]);

  const switchToProps=useCallback(()=>{
    const curId=overrideLabel||sfoLabel;
    setSfoStores(prev=>({...prev,[curId]:obsStore}));
    const propsStore=sfoStores[sfoLabel]||emptyStore(sfoLabel,agentA,agentC);
    setObsStore(propsStore);
    setOverrideA(null);setOverrideC(null);setOverrideLabel(null);
    setTravelY(null);
  },[obsStore,sfoStores,overrideLabel,sfoLabel,agentA,agentC]);

  // ── Forge solver (memoised) ──
  const forgeSolution=useMemo(()=>{
    if(forgeMode==="one_plus_A"){
      const a=parseFloat(forgeDirectA);
      const y1=parseFloat(forgeAnchors[0]?.y);
      const z1=forgeAnchors[0]?.date?dateStrToTnldy(forgeAnchors[0].date):null;
      if(isNaN(a)||a<=0||isNaN(y1)||!z1) return null;
      const C=z1-a*y1;
      return {A:Math.round(a*10000)/10000,C:Math.round(C*10000)/10000,residual:0,method:"one anchor + known A"};
    }
    // Parse all anchors with both fields filled
    const valid=forgeAnchors.filter(a=>a.date&&!isNaN(parseFloat(a.y)))
      .map(a=>({y:parseFloat(a.y),z:dateStrToTnldy(a.date)}))
      .filter(a=>a.z!==null);
    if(valid.length<2) return null;
    if(valid.length===2) return solveExact(valid[0].y,valid[0].z,valid[1].y,valid[1].z);
    return solveLeastSquares(valid);
  },[forgeAnchors,forgeMode,forgeDirectA]);

  // ── Forge preview ──
  const forgePreview=useMemo(()=>{
    if(!forgeSolution) return null;
    const {A,C}=forgeSolution;
    const zNow=tnldyNow();
    const yNow=(zNow-C)/A;
    const bbIdx=findNearestIdx(yNow);
    const zFirst=A*NODE_YS[0]+C;const zLast=A*NODE_YS[N-1]+C;
    return {
      yNow:Math.round(yNow*10000)/10000,bbIdx,bbNodeY:NODE_YS[bbIdx],
      timeline:forgeTimeline(A,C),
      full399:forgeTimelineAll(A,C),
      spanDays:Math.round(zLast-zFirst),
      spanYears:Math.round((zLast-zFirst)/365.2422*100)/100,
      dateFirst:fd(tnldyToDate(zFirst)),dateLast:fd(tnldyToDate(zLast))
    };
  },[forgeSolution]);

  // ── Create forged SFO ──
  const createForgedSFO=useCallback(()=>{
    if(!forgeSolution||!forgeName.trim()) return;
    const full399=forgeTimelineAll(forgeSolution.A,forgeSolution.C);
    const sfo={
      id:"sfo_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),
      name:forgeName.trim(),A:forgeSolution.A,C:forgeSolution.C,
      method:forgeSolution.method,residual:forgeSolution.residual,
      created:new Date().toISOString(),
      anchors:forgeAnchors.filter(a=>a.date&&a.y).map(a=>({y:parseFloat(a.y),date:a.date})),
      yNow:forgePreview?.yNow,spanYears:forgePreview?.spanYears,
      timeline399:full399
    };
    const created=sfo.name;
    setForgedSFOs(prev=>[...prev,sfo]);
    setSfoStores(prev=>({...prev,[sfo.name]:emptyStore(sfo.name,sfo.A,sfo.C)}));
    setForgeName("");
    setForgeToast(created);
    setTimeout(()=>setForgeToast(null),3000);
    if(onForge) onForge(sfo);
  },[forgeSolution,forgeName,forgeAnchors,forgePreview,onForge]);

  // ── Canvas ──
  const canvasRef=useRef(null);
  const lastTouchedRef=useRef(null);

  // ── Tick ──
  useEffect(()=>{const iv=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(iv);},[]);

  // ── Computed coordinates (uses active agent: forge override or props) ──
  const Z=tnldy(now);
  const liveY=agentY(Z,curA,curC);
  const viewY=travelY!==null?travelY:liveY;
  const viewZ=agentZ(viewY,curA,curC);
  const viewDate=tnldyToDate(viewZ);
  const isTraveling=travelY!==null;
  const currentIdx=useMemo(()=>findNearestIdx(viewY),[viewY]);
  const isAtNode=Math.abs(NODE_YS[currentIdx]-viewY)<EPSILON;

  // ── Auto-touch on time crossing ──
  useEffect(()=>{
    if(isAtNode&&lastTouchedRef.current!==currentIdx){
      lastTouchedRef.current=currentIdx;
      touchNode(currentIdx);
    }
  },[currentIdx,isAtNode]);

  // ── Touch a node: pink activation + d-separation ──
  const touchNode=useCallback((idx)=>{
    const t=Date.now();
    const acts={[idx]:{time:t,type:"primary",int:1}};
    for(const[ci,w]of CHILDREN[idx]) acts[ci]={time:t,type:"child",int:0.85,w};
    for(const[pi,w]of PARENTS[idx]) acts[pi]={time:t,type:"parent",int:0.75,w};
    setActivations(prev=>({...prev,...acts}));
    const dsep=dSeparationCascade(idx,conditioned);
    for(const oi of dsep.open) if(!(oi in acts)) acts[oi]={time:t,type:"dsep_open",int:0.5};
    setDsepResult({...dsep,touchedIdx:idx,time:t});
    setActivations(prev=>({...prev,...acts}));
    const maxW=Math.max(...[...CHILDREN[idx],...PARENTS[idx]].map(([,w])=>w),1);
    const dur=Math.min(Math.max(maxW*2000,3000),15000);
    setTimeout(()=>{setActivations(prev=>{
      const next={...prev};for(const k of Object.keys(acts))if(next[k]?.time===t)delete next[k];return next;
    });},dur);
  },[conditioned]);

  const toggleCondition=useCallback(idx=>{
    setConditioned(prev=>{const n=new Set(prev);if(n.has(idx))n.delete(idx);else n.add(idx);return n;});
  },[]);

  // ── Time travel ──
  const goToY=useCallback(()=>{const v=parseFloat(yInput);if(!isNaN(v)){setTravelY(v);setZInput(agentZ(v,curA,curC).toFixed(6));}},[yInput,curA,curC]);
  const goToZ=useCallback(()=>{const z=parseFloat(zInput);if(!isNaN(z)){const y=agentY(z,curA,curC);setTravelY(y);setYInput(y.toFixed(6));}},[zInput,curA,curC]);
  const returnToNow=()=>{setTravelY(null);setYInput("");setZInput("");};

  // ── Outgoing edges from current node ──
  const outEdges=useMemo(()=>CHILDREN[currentIdx].map(([ti,w])=>({to:ti,toY:NODE_YS[ti],weight:w})),[currentIdx]);
  const inEdges=useMemo(()=>PARENTS[currentIdx].map(([pi,w])=>({from:pi,fromY:NODE_YS[pi],weight:w})),[currentIdx]);

  // ── Observation queries ──
  const curObs=useMemo(()=>nodeObs(obsStore,viewY),[obsStore,viewY]);
  const curLockins=useMemo(()=>nodeLockins(obsStore,viewY),[obsStore,viewY]);
  const curNeighborLk=useMemo(()=>neighborLockins(obsStore,currentIdx),[obsStore,currentIdx]);
  const curPending=useMemo(()=>pendingProjections(obsStore,viewY),[obsStore,viewY]);

  // ── OPERATION 1: OBSERVE — Record observation with five-state judgement ──
  const recordObservation=useCallback((state)=>{
    const digest=digestResult?.digest||mockDigest.trim()||"(no digest)";
    const kws=obsKeywords.split(",").map(k=>k.trim()).filter(Boolean);
    const obs=mkObs(viewY,digestPrompt,digest,state,kws,liveY,travelY);
    const newStore={...obsStore,observations:[...obsStore.observations,obs]};
    // OPERATION 2: PROPAGATE — lock-in on confirm
    if(state==="confirmed"&&kws.length>0){
      newStore.lockins=[...newStore.lockins,...kws.map(kw=>mkLockin(viewY,kw,obs.id))];
    }
    // reverse-and-rebuild: revoke active lock-ins at this node
    if(state==="reverse-and-rebuild"){
      newStore.lockins=newStore.lockins.map(lk=>
        Math.abs(lk.nodeY-viewY)<0.001&&lk.state==="active"
          ?{...lk,state:"reversed",reversal_id:obs.id,reversal_reason:digest.slice(0,200)}:lk
      );
    }
    setObsStore(newStore);
    setDigestPrompt("");setMockDigest("");setDigestResult(null);setObsKeywords("");
  },[digestResult,mockDigest,digestPrompt,obsKeywords,viewY,liveY,travelY,obsStore]);

  // ── OPERATION 3: PROJECT — Create projection along an outgoing edge ──
  const recordProjection=useCallback((edgeTarget)=>{
    const digest=digestResult?.digest||mockDigest.trim()||"(no digest)";
    const proj=mkProjection(viewY,edgeTarget.toY,edgeTarget.weight,digest,digestPrompt,curA);
    setObsStore(prev=>({...prev,projections:[...prev.projections,proj]}));
  },[digestResult,mockDigest,digestPrompt,viewY,curA]);

  // ── OPERATION 4: JUDGE — Resolve a pending projection ──
  const resolveProjection=useCallback((projId,state,obsId)=>{
    setObsStore(prev=>({...prev,projections:prev.projections.map(p=>
      p.id===projId?{...p,resolution_state:state,resolution_observation_id:obsId||null,resolved_at:new Date().toISOString()}:p
    )}));
  },[]);

  // ── Digest engine ──
  const submitDigest=useCallback(async()=>{
    if(!digestPrompt.trim()&&!mockDigest.trim())return;
    setDigestLoading(true);
    const ctx={sfo:curLabel,A:curA,C:curC,currentY:viewY,currentZ:viewZ,currentDate:viewDate?.toISOString(),
      nodeIdx:currentIdx,nodeY:NODE_YS[currentIdx],nodeClass:NODE_CLASS[currentIdx],
      parents:PARENTS[currentIdx].map(([pi,w])=>({y:NODE_YS[pi],w,class:NODE_CLASS[pi]})),
      children:CHILDREN[currentIdx].map(([ci,w])=>({y:NODE_YS[ci],w,class:NODE_CLASS[ci]})),
      observations:curObs.slice(-10),lockins:curLockins,neighborLockins:curNeighborLk,
      pendingProjections:curPending,humanPrompt:digestPrompt.trim(),
      feedResults:Object.values(feedResults).flat()};
    const result=await requestDigest(ctx);
    if(result.digest) setDigestResult(result);
    else setDigestResult({digest:mockDigest.trim()||`[API unavailable: ${result.error}. Use mock digest below.]`,error:result.error});
    setDigestLoading(false);
  },[digestPrompt,mockDigest,curLabel,curA,curC,viewY,viewZ,viewDate,currentIdx,curObs,curLockins,curNeighborLk,curPending,feedResults]);

  // ── Feed snapshot ──
  const fetchFeeds=useCallback(async()=>{
    setFeedLoading(true);setFeedError(null);
    try{const snap=await loadFeedSnapshot();setFeedResults({news:snap.sources});setFeedGenerated(snap.generated);}
    catch(e){setFeedError(e.message);}
    setFeedLoading(false);
  },[]);
  useEffect(()=>{if(tab==="feeds"&&!feedResults.news&&!feedLoading&&!feedError)fetchFeeds();},[tab,feedResults.news,feedLoading,feedError,fetchFeeds]);

  // ── Canvas layout & rendering ──
  const CW=1200,CH=500,PAD=35;
  const layout=useMemo(()=>{
    const depth=new Array(N).fill(-1);
    const q=[];
    for(let i=0;i<N;i++)if(!PARENTS[i].length){depth[i]=0;q.push(i);}
    let h=0;
    while(h<q.length){const c=q[h++];for(const[ci]of CHILDREN[c])if(depth[ci]<depth[c]+1){depth[ci]=depth[c]+1;q.push(ci);}}
    const maxD=Math.max(...depth.filter(d=>d>=0),1);
    const pos=new Array(N);
    for(let i=0;i<N;i++){
      const x=PAD+(i/(N-1))*(CW-2*PAD);
      const d=depth[i]>=0?depth[i]:0;
      const yBase=PAD+(d/maxD)*(CH-2*PAD);
      const jitter=((i*7919)%37-18)*1.2;
      pos[i]={x,y:Math.max(PAD,Math.min(CH-PAD,yBase+jitter))};
    }
    return pos;
  },[]);

  useEffect(()=>{
    const cv=canvasRef.current;if(!cv)return;
    const ctx=cv.getContext("2d");
    const dpr=window.devicePixelRatio||1;
    cv.width=CW*dpr;cv.height=CH*dpr;ctx.scale(dpr,dpr);
    ctx.clearRect(0,0,CW,CH);ctx.fillStyle=S.bg;ctx.fillRect(0,0,CW,CH);
    // Edges
    for(const[fi,ti]of EDGES_RAW){
      const f=layout[fi],t=layout[ti];
      const isAct=activations[fi]||activations[ti];
      const isOpen=dsepResult?.open.has(fi)&&dsepResult?.open.has(ti);
      ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(t.x,t.y);
      ctx.strokeStyle=isAct&&isOpen?S.openG:isAct?`rgba(255,20,147,0.4)`:S.border;
      ctx.lineWidth=isAct?1.2:0.3;ctx.stroke();
    }
    // Nodes
    for(let i=0;i<N;i++){
      const p=layout[i],act=activations[i],isCond=conditioned.has(i),isCur=i===currentIdx&&isAtNode,isSel=i===selectedIdx;
      let r=1.8;if(act)r=act.type==="primary"?6:4;if(isCur)r=Math.max(r,5);if(isSel)r=Math.max(r,7);
      let col="rgba(255,255,255,0.1)";
      if(act){if(act.type==="primary")col=S.pink;else if(act.type==="parent")col=S.pinkGlow;else if(act.type==="child")col=S.pink;else if(act.type==="dsep_open")col=S.openG;}
      if(dsepResult?.blocked.has(i))col=S.blockR;
      if(isCond)col=S.condG;
      if(isCur&&!act)col="#fff";
      // Glow
      if(act&&(act.type==="primary"||act.type==="child"||act.type==="parent")){
        ctx.beginPath();ctx.arc(p.x,p.y,r+8,0,Math.PI*2);
        const g=ctx.createRadialGradient(p.x,p.y,r,p.x,p.y,r+8);
        g.addColorStop(0,`rgba(255,20,147,${act.int*0.4})`);g.addColorStop(1,"rgba(255,20,147,0)");
        ctx.fillStyle=g;ctx.fill();
      }
      ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
      if(isCond){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.PI/4);ctx.strokeStyle=S.condG;ctx.lineWidth=1.5;ctx.strokeRect(-r-3,-r-3,(r+3)*2,(r+3)*2);ctx.restore();}
      if(isSel||isCur){ctx.font="9px monospace";ctx.fillStyle="rgba(255,255,255,0.7)";ctx.textAlign="center";ctx.fillText(NODE_YS[i].toFixed(2),p.x,p.y-r-4);}
      // Lock-in indicator
      const hasLk=obsStore.lockins.some(l=>Math.abs(l.nodeY-NODE_YS[i])<0.001&&l.state==="active");
      if(hasLk){ctx.beginPath();ctx.arc(p.x,p.y,r+3,0,Math.PI*2);ctx.strokeStyle="rgba(80,180,120,0.5)";ctx.lineWidth=1;ctx.stroke();}
    }
  },[layout,activations,conditioned,dsepResult,currentIdx,isAtNode,selectedIdx,obsStore]);

  // ── Canvas click ──
  const handleClick=useCallback(e=>{
    const rect=e.target.getBoundingClientRect();
    const x=e.clientX-rect.left,y=e.clientY-rect.top;
    let closest=-1,cd=12;
    for(let i=0;i<N;i++){const d=Math.hypot(layout[i].x-x,layout[i].y-y);if(d<cd){cd=d;closest=i;}}
    if(closest>=0){if(e.shiftKey)toggleCondition(closest);else{setSelectedIdx(closest);touchNode(closest);}}
  },[layout,touchNode,toggleCondition]);

  // ── Calibration register ──
  const calibration=useMemo(()=>{
    const ps=obsStore.projections;
    const resolved=ps.filter(p=>p.resolution_state);
    const confirmed=resolved.filter(p=>p.resolution_state==="confirmed");
    const reversed=resolved.filter(p=>p.resolution_state==="reverse-and-rebuild");
    return {total:ps.length,resolved:resolved.length,confirmed:confirmed.length,reversed:reversed.length,
      open:ps.length-resolved.length,rate:resolved.length?((confirmed.length/resolved.length)*100).toFixed(1)+"%":"—"};
  },[obsStore]);

  return(
  <div style={{background:S.bg,color:S.fg,fontFamily:"'JetBrains Mono',monospace",fontSize:11,padding:12,minHeight:"100vh"}}>

    {/* HEADER */}
    <div style={{borderBottom:`1px solid rgba(255,20,147,0.2)`,paddingBottom:8,marginBottom:10,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
      <div>
        <span style={{fontSize:15,fontWeight:700,color:S.pink,letterSpacing:"0.05em"}}>◆ SFO-WAM ENGINE</span>
        <span style={{color:"#555",fontSize:9,marginLeft:10}}>{curLabel} · A={curA} · C={curC} · {N}n/{EDGES_RAW.length}e</span>
      </div>
      <div style={{fontSize:9,color:"#666",display:"flex",gap:12}}>
        <span>Obs: <b style={{color:OBS_COLORS.confirmed}}>{obsStore.observations.length}</b></span>
        <span>Lock-ins: <b style={{color:S.green}}>{obsStore.lockins.filter(l=>l.state==="active").length}</b></span>
        <span>Projections: <b style={{color:S.travel}}>{calibration.open} open</b></span>
        <span>Calibration: <b style={{color:S.acc}}>{calibration.rate}</b></span>
        <span>Conditioned: <b style={{color:S.condG}}>{conditioned.size}</b></span>
        {forgedSFOs.length>0&&<span>Forged: <b style={{color:S.pink}}>{forgedSFOs.length}</b></span>}
        {overrideA!==null&&<span style={{color:S.pink,fontWeight:700}}>FORGED: {curLabel}</span>}
      </div>
    </div>

    {/* LIVE METRICS */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:8,marginBottom:10}}>
      <div style={{background:S.panelBg,border:`1px solid ${S.border}`,padding:"6px 10px"}}>
        <div style={{color:"#555",fontSize:9}}>Y (Live)</div>
        <div style={{color:S.acc,fontWeight:700}}>{liveY.toFixed(6)}</div>
        <div style={{color:"#555",fontSize:9}}>TNLDY: {Z.toFixed(4)}</div>
      </div>
      <div style={{background:isTraveling?"rgba(192,128,255,0.06)":S.panelBg,border:`1px solid ${isTraveling?"rgba(192,128,255,0.2)":S.border}`,padding:"6px 10px"}}>
        <div style={{color:"#555",fontSize:9}}>{isTraveling?"View Y (TIME-TRAVEL)":"View Y"}</div>
        <div style={{color:isTraveling?S.travel:S.acc,fontWeight:700}}>{viewY.toFixed(6)}</div>
        <div style={{color:"#555",fontSize:9}}>Node: {NODE_YS[currentIdx]} · {NODE_CLASS[currentIdx]}</div>
      </div>
      <div style={{background:S.panelBg,border:`1px solid ${S.border}`,padding:"6px 10px"}}>
        <div style={{color:"#555",fontSize:9}}>Calendar</div>
        <div style={{color:"#b8a878"}}>{fd(viewDate)}</div>
        <div style={{color:"#555",fontSize:9}}>{ft(viewDate)}</div>
      </div>
      <div style={{background:S.panelBg,border:`1px solid ${S.border}`,padding:"6px 10px"}}>
        <div style={{color:"#555",fontSize:9}}>Equation</div>
        <div style={{color:"#b8a878",fontSize:10}}>Z = {curA}·Y + {curC}</div>
        <div style={{color:"#555",fontSize:9}}>Rate: 1 Y / {curA} days</div>
      </div>
    </div>

    {/* TIME TRAVEL */}
    <div style={{background:isTraveling?"rgba(192,128,255,0.06)":S.panelBg,border:`1px solid ${isTraveling?"rgba(192,128,255,0.2)":S.border}`,padding:"10px 12px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:8}}>
        <span style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:isTraveling?S.travel:"#555"}}>⟳ Time Travel</span>
        <input type="range" min="-150" max="215" step="0.01" value={travelY!==null?travelY:liveY}
          onChange={e=>{const v=parseFloat(e.target.value);setTravelY(v);setYInput(v.toFixed(4));setZInput(agentZ(v,curA,curC).toFixed(4));}}
          style={{flex:1,minWidth:120,accentColor:isTraveling?S.travel:S.acc,cursor:"pointer"}}/>
        {isTraveling&&<button onClick={returnToNow} style={{background:"rgba(240,192,64,0.1)",border:"1px solid rgba(240,192,64,0.25)",color:S.acc,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:10}}>RETURN TO NOW</button>}
      </div>
      {/* Precision entry */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:9,color:"#555",minWidth:20}}>Y:</span>
          <input value={yInput} onChange={e=>setYInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&goToY()}
            placeholder={`e.g. ${liveY.toFixed(2)}`}
            style={{flex:1,background:"#0c0c14",border:`1px solid ${S.border}`,color:S.fg,fontFamily:"inherit",fontSize:11,padding:"4px 8px"}}/>
          <button onClick={goToY} style={{background:"rgba(192,128,255,0.1)",border:"1px solid rgba(192,128,255,0.2)",color:S.travel,padding:"3px 10px",cursor:"pointer",fontSize:10}}>GO</button>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:9,color:"#555",minWidth:40}}>TNLDY:</span>
          <input value={zInput} onChange={e=>setZInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&goToZ()}
            placeholder={`e.g. ${viewZ.toFixed(2)}`}
            style={{flex:1,background:"#0c0c14",border:`1px solid ${S.border}`,color:S.fg,fontFamily:"inherit",fontSize:11,padding:"4px 8px"}}/>
          <button onClick={goToZ} style={{background:"rgba(240,192,64,0.1)",border:"1px solid rgba(240,192,64,0.2)",color:S.acc,padding:"3px 10px",cursor:"pointer",fontSize:10}}>GO</button>
        </div>
      </div>
    </div>

    {/* CANVAS */}
    <canvas ref={canvasRef} width={CW} height={CH} onClick={handleClick}
      style={{width:"100%",height:CH,cursor:"crosshair",border:`1px solid ${activations[currentIdx]?"rgba(255,20,147,0.3)":"rgba(255,255,255,0.05)"}`,display:"block",marginBottom:10}}/>
    <div style={{fontSize:9,color:"#555",marginBottom:10,display:"flex",gap:12,flexWrap:"wrap"}}>
      <span><span style={{color:S.pink}}>●</span> Touched</span>
      <span><span style={{color:S.pinkGlow}}>●</span> Parent</span>
      <span><span style={{color:S.openG}}>●</span> d-sep open</span>
      <span><span style={{color:S.blockR}}>●</span> d-sep blocked</span>
      <span><span style={{color:S.condG}}>◇</span> Conditioned</span>
      <span><span style={{color:"rgba(80,180,120,0.5)"}}>○</span> Lock-in active</span>
      <span>Click = touch · Shift+Click = condition</span>
      {conditioned.size>0&&<button onClick={()=>{setConditioned(new Set());setDsepResult(null);}} style={{background:"rgba(255,215,64,0.1)",border:"1px solid rgba(255,215,64,0.3)",color:S.condG,padding:"1px 8px",cursor:"pointer",fontSize:9}}>CLEAR</button>}
    </div>

    {/* TABS */}
    <div style={{display:"flex",gap:2,marginBottom:10}}>
      {["observe","edges","projections","feeds","calibration","history","forge"].map(t=>(
        <button key={t} onClick={()=>setTab(t)} style={{
          background:tab===t?"rgba(255,20,147,0.1)":"transparent",
          border:`1px solid ${tab===t?"rgba(255,20,147,0.2)":S.border}`,
          color:tab===t?S.pink:"#555",padding:"4px 14px",cursor:"pointer",
          fontFamily:"inherit",fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em"
        }}>{t}</button>
      ))}
    </div>

    {/* ══════════════ TAB: OBSERVE — Digest + Five-State Judgment ══════════════ */}
    {tab==="observe"&&(
    <div style={{border:`1px solid ${S.border}`,marginBottom:10}}>
      {/* Node context */}
      <div style={{padding:10,borderBottom:`1px solid ${S.border}`}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:4}}>
          Position · Y={viewY.toFixed(4)} · Node {currentIdx} ({NODE_CLASS[currentIdx]}) · in:{PARENTS[currentIdx].length} out:{CHILDREN[currentIdx].length}
          {isAtNode?" · AT NODE":" · IN TRANSIT"}
        </div>
        <div style={{display:"flex",gap:8,fontSize:10,flexWrap:"wrap"}}>
          {curLockins.length>0&&<span style={{color:OBS_COLORS.confirmed}}>■ {curLockins.length} lock-in(s) active at this node</span>}
          {curNeighborLk.length>0&&<span style={{color:S.acc}}>□ {curNeighborLk.length} neighbor lock-in(s) (decay {LOCKIN_DECAY})</span>}
          {curPending.length>0&&<span style={{color:S.travel}}>⊕ {curPending.length} pending projection(s) targeting near here</span>}
        </div>
      </div>

      {/* Digest prompt */}
      <div style={{padding:10,borderBottom:`1px solid ${S.border}`}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:6}}>Digest Engine · {isTraveling?"TIME-TRAVEL":"LIVE"}</div>
        <textarea value={digestPrompt} onChange={e=>setDigestPrompt(e.target.value)}
          placeholder="Enter your prompt — the sharpness of this question determines the quality of the digest..."
          style={{width:"100%",minHeight:60,background:"#0c0c14",border:`1px solid ${S.border}`,color:"#b8a878",padding:8,fontSize:11,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:6,marginTop:4,alignItems:"center"}}>
          <button onClick={submitDigest} disabled={digestLoading||(!digestPrompt.trim()&&!mockDigest.trim())}
            style={{fontSize:9,padding:"3px 10px",cursor:digestLoading?"not-allowed":"pointer",background:"rgba(80,180,120,0.15)",border:"1px solid rgba(80,180,120,0.3)",color:S.green,textTransform:"uppercase"}}>
            {digestLoading?"REQUESTING...":"REQUEST DIGEST"}
          </button>
          <span style={{fontSize:9,color:"#555"}}>or use mock mode below</span>
        </div>
        <textarea value={mockDigest} onChange={e=>setMockDigest(e.target.value)}
          placeholder="Mock mode: write your own digest text here (used when API is unavailable)..."
          style={{width:"100%",minHeight:40,marginTop:6,background:"#0c0c14",border:`1px solid rgba(200,180,140,0.06)`,color:"#888",padding:8,fontSize:10,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
      </div>

      {/* Digest result */}
      {digestResult&&(
        <div style={{padding:10,borderBottom:`1px solid ${S.border}`}}>
          <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:4}}>
            Digest Result {digestResult.error&&<span style={{color:"#e06040"}}>· API: {digestResult.error}</span>}
          </div>
          <div style={{padding:8,background:"rgba(200,180,140,0.03)",border:`1px solid rgba(200,180,140,0.08)`,fontSize:11,color:"#b8a878",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{digestResult.digest}</div>
        </div>
      )}

      {/* Keyword + Judgment */}
      {(digestResult||mockDigest.trim())&&(
        <div style={{padding:10,borderBottom:`1px solid ${S.border}`}}>
          <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:6}}>Judgment · Keywords · Record</div>
          <input value={obsKeywords} onChange={e=>setObsKeywords(e.target.value)}
            placeholder="Nominate keywords (comma-separated) for potential lock-in..."
            style={{width:"100%",background:"#0c0c14",border:`1px solid ${S.border}`,color:"#b8a878",padding:6,fontSize:10,marginBottom:6,boxSizing:"border-box"}}/>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {OBS_STATES.map(state=>(
              <button key={state} onClick={()=>recordObservation(state)}
                style={{fontSize:9,padding:"4px 10px",cursor:"pointer",background:`${OBS_COLORS[state]}15`,border:`1px solid ${OBS_COLORS[state]}40`,color:OBS_COLORS[state],textTransform:"uppercase"}}>
                {state}
              </button>
            ))}
          </div>
          <div style={{fontSize:9,color:"#555",marginTop:4}}>
            Keywords lock only on "confirmed." "Reverse-and-rebuild" revokes active lock-ins at this node.
          </div>
        </div>
      )}

      {/* Active lock-ins */}
      {(curLockins.length>0||curNeighborLk.length>0)&&(
        <div style={{padding:10,borderBottom:`1px solid ${S.border}`}}>
          <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:6}}>
            Lock-ins · {curLockins.length} at node · {curNeighborLk.length} from neighbors
          </div>
          {curLockins.map((lk,i)=>(
            <div key={i} style={{display:"flex",gap:8,fontSize:10,padding:"2px 0"}}>
              <span style={{color:OBS_COLORS.confirmed,fontWeight:700}}>■</span>
              <span style={{color:"#b8a878"}}>{lk.keyword}</span>
              <span style={{color:"#555",fontSize:9}}>locked {lk.locked_at?.slice(0,10)} · weight: 1.0</span>
            </div>
          ))}
          {curNeighborLk.map((lk,i)=>(
            <div key={`n${i}`} style={{display:"flex",gap:8,fontSize:10,padding:"2px 0",opacity:0.7}}>
              <span style={{color:OBS_COLORS.confirmed}}>□</span>
              <span style={{color:"#b8a878"}}>{lk.keyword}</span>
              <span style={{color:"#555",fontSize:9}}>from Y={NODE_YS[lk.fromIdx]} · weight: {lk.weight}</span>
            </div>
          ))}
        </div>
      )}

      {/* Observation history at node */}
      <div style={{padding:10}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:6}}>Observation History · Y={viewY.toFixed(4)} · {curObs.length} record(s)</div>
        {curObs.length===0&&<div style={{fontSize:10,color:"#555"}}>No observations recorded at this position</div>}
        {curObs.slice().reverse().map((o,i)=>(
          <div key={i} style={{padding:"6px 8px",marginBottom:3,borderLeft:`3px solid ${OBS_COLORS[o.state]}`,background:"rgba(200,180,140,0.02)",fontSize:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
              <span style={{color:OBS_COLORS[o.state],fontWeight:700,textTransform:"uppercase",fontSize:9}}>{o.state}</span>
              <span style={{color:"#555",fontSize:9}}>{o.timestamp?.slice(0,16)}</span>
            </div>
            {o.prompt&&<div style={{color:"#555",fontSize:9}}>Prompt: {o.prompt.slice(0,100)}</div>}
            <div style={{color:"#b8a878"}}>{o.digest?.slice(0,200)}{o.digest?.length>200?"...":""}</div>
            {o.keywords?.length>0&&<div style={{color:S.acc,fontSize:9,marginTop:2}}>Keywords: {o.keywords.join(", ")}</div>}
          </div>
        ))}
      </div>
    </div>
    )}

    {/* ══════════════ TAB: EDGES — Outgoing/Incoming + Project ══════════════ */}
    {tab==="edges"&&(
    <div style={{border:`1px solid ${S.border}`,marginBottom:10}}>
      <div style={{padding:10,borderBottom:`1px solid ${S.border}`}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:6}}>Outgoing Edges · {outEdges.length} from Y={NODE_YS[currentIdx]}</div>
        {outEdges.map((e,i)=>(
          <div key={i} style={{display:"flex",gap:8,fontSize:10,padding:"3px 0",alignItems:"center"}}>
            <span style={{color:S.green}}>→</span>
            <span style={{color:"#b8a878"}}>Y={e.toY}</span>
            <span style={{color:"#555",fontSize:9}}>Δ{e.weight.toFixed(4)} ({(e.weight*curA).toFixed(0)} days)</span>
            <span style={{color:"#555",fontSize:9}}>ETA: {fd(new Date(Date.now()+e.weight*curA*MSD))}</span>
            <button onClick={()=>recordProjection(e)}
              style={{fontSize:8,padding:"2px 6px",background:"rgba(192,128,255,0.1)",border:"1px solid rgba(192,128,255,0.2)",color:S.travel,cursor:"pointer"}}>
              PROJECT
            </button>
            <span onClick={()=>{setTravelY(e.toY);setSelectedIdx(e.to);}} style={{color:S.travel,cursor:"pointer",fontSize:9}}>⟶ travel</span>
          </div>
        ))}
      </div>
      <div style={{padding:10}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:6}}>Incoming Edges · {inEdges.length} to Y={NODE_YS[currentIdx]}</div>
        {inEdges.map((e,i)=>(
          <div key={i} style={{display:"flex",gap:8,fontSize:10,padding:"3px 0",alignItems:"center"}}>
            <span style={{color:S.acc}}>←</span>
            <span style={{color:"#b8a878"}}>Y={e.fromY}</span>
            <span style={{color:"#555",fontSize:9}}>Δ{e.weight.toFixed(4)}</span>
            <span onClick={()=>{setTravelY(e.fromY);setSelectedIdx(e.from);}} style={{color:S.travel,cursor:"pointer",fontSize:9}}>⟵ travel</span>
          </div>
        ))}
      </div>
    </div>
    )}

    {/* ══════════════ TAB: PROJECTIONS — Pending + Resolution ══════════════ */}
    {tab==="projections"&&(
    <div style={{border:`1px solid ${S.border}`,marginBottom:10,padding:10}}>
      <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:8}}>
        Projections · {obsStore.projections.length} total · {calibration.open} open · {calibration.resolved} resolved
      </div>
      {obsStore.projections.length===0&&<div style={{fontSize:10,color:"#555"}}>No projections recorded. Use the EDGES tab to project along outgoing edges.</div>}
      {obsStore.projections.slice().reverse().map((p,i)=>(
        <div key={i} style={{padding:"8px 10px",marginBottom:4,background:"rgba(192,128,255,0.03)",border:`1px solid rgba(192,128,255,0.1)`,fontSize:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{color:S.travel}}>Y={p.sourceY.toFixed(3)} → Y={p.targetY.toFixed(3)} (Δ{p.edgeWeight.toFixed(4)})</span>
            <span style={{color:p.resolution_state?OBS_COLORS[p.resolution_state]||"#888":"#555",fontSize:9,fontWeight:700,textTransform:"uppercase"}}>
              {p.resolution_state||"OPEN"}
            </span>
          </div>
          <div style={{color:"#555",fontSize:9}}>
            Projected: {p.projected_at?.slice(0,10)} · Expected arrival: {p.expected_arrival?.slice(0,10)}
            {p.resolved_at&&` · Resolved: ${p.resolved_at?.slice(0,10)}`}
          </div>
          <div style={{color:"#b8a878",fontSize:10,marginTop:2}}>{p.digest?.slice(0,150)}</div>
          {!p.resolution_state&&(
            <div style={{display:"flex",gap:4,marginTop:4}}>
              {["confirmed","rejected","reverse-and-rebuild"].map(st=>(
                <button key={st} onClick={()=>resolveProjection(p.id,st)}
                  style={{fontSize:8,padding:"2px 8px",cursor:"pointer",background:`${OBS_COLORS[st]}15`,border:`1px solid ${OBS_COLORS[st]}40`,color:OBS_COLORS[st],textTransform:"uppercase"}}>
                  {st}
                </button>
              ))}
              <span onClick={()=>{setTravelY(p.targetY);}} style={{color:S.travel,cursor:"pointer",fontSize:9,marginLeft:8}}>⟶ travel to target</span>
            </div>
          )}
        </div>
      ))}
    </div>
    )}

    {/* ══════════════ TAB: FEEDS — Knowledge Servers ══════════════ */}
    {tab==="feeds"&&(()=>{
      const sources=(feedResults.news||[]).filter(f=>feedDomain==="all"||f.domain===feedDomain);
      const latest=sources.flatMap(f=>f.items.map(it=>({...it,perspective:f.perspective})))
        .filter(it=>it.pubDate).sort((x,y)=>y.pubDate.localeCompare(x.pubDate)).slice(0,80);
      const chip=(key,label,on,set)=>(
        <button key={key} onClick={set} style={{fontSize:9,padding:"2px 8px",cursor:"pointer",textTransform:"uppercase",
          background:on?"rgba(255,20,147,0.1)":"transparent",border:`1px solid ${on?"rgba(255,20,147,0.25)":S.border}`,color:on?S.pink:S.fgMuted}}>{label}</button>);
      const row=(it,j,showSource)=>(
        <div key={j} style={{padding:"3px 8px",marginBottom:2,background:S.panelBg,borderLeft:`2px solid ${S.border}`,fontSize:10}}>
          <a href={it.link} target="_blank" rel="noopener noreferrer" style={{color:S.acc,textDecoration:"none"}}>{it.title}</a>
          <span style={{color:S.fgMuted,fontSize:8,marginLeft:8}}>{showSource?`${it.source} · `:""}{feedAge(it.pubDate)}</span>
          {it.description&&<div style={{color:S.dim,fontSize:9,marginTop:1}}>{it.description}</div>}
        </div>);
      return (
    <div style={{border:`1px solid ${S.border}`,marginBottom:10,padding:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6,marginBottom:8}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:S.fgMuted}}>
          Knowledge-Server Feeds · {(feedResults.news||[]).length} sources{feedGenerated&&` · snapshot ${feedAge(feedGenerated)} ago (${feedGenerated.replace("T"," ").slice(0,16)} UTC)`}
        </div>
        <div style={{display:"flex",gap:4}}>
          {chip("latest","Latest",feedView==="latest",()=>setFeedView("latest"))}
          {chip("sources","By source",feedView==="sources",()=>setFeedView("sources"))}
          <button onClick={fetchFeeds} disabled={feedLoading}
            style={{fontSize:9,padding:"3px 10px",cursor:feedLoading?"not-allowed":"pointer",background:"rgba(80,180,120,0.15)",border:"1px solid rgba(80,180,120,0.3)",color:S.green,textTransform:"uppercase"}}>
            {feedLoading?"LOADING...":"RELOAD"}
          </button>
        </div>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
        {chip("all","All",feedDomain==="all",()=>setFeedDomain("all"))}
        {FEED_DOMAINS.map(([k,label])=>chip(k,label,feedDomain===k,()=>setFeedDomain(k)))}
      </div>
      {feedError&&<div style={{fontSize:10,color:S.blockR}}>Feed snapshot unavailable: {feedError}</div>}
      {feedView==="latest"&&latest.map((it,j)=>row(it,j,true))}
      {feedView==="sources"&&sources.map((fr,i)=>(
        <div key={i} style={{marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:3}}>
            <span style={{fontSize:10,fontWeight:700,color:S.acc}}>{fr.source}
              <span style={{fontWeight:400,color:S.fgMuted,marginLeft:6}}>{fr.perspective} · {feedDomainLabel(fr.domain)}{fr.via==="Google News"?" · via Google News":""}</span></span>
            <span style={{fontSize:9,color:fr.error?S.blockR:S.green,whiteSpace:"nowrap"}}>
              {fr.error?`kept from ${feedAge(fr.fetched)||"—"} ago`:`${fr.items.length} items`}</span>
          </div>
          {fr.items.slice(0,5).map((it,j)=>row(it,j,false))}
        </div>
      ))}
      {!feedResults.news&&!feedError&&<div style={{fontSize:10,color:S.fgMuted}}>Loading the feed snapshot…</div>}
    </div>);
    })()}

    {/* ══════════════ TAB: CALIBRATION — Projection Resolution Register ══════════════ */}
    {tab==="calibration"&&(
    <div style={{border:`1px solid ${S.border}`,marginBottom:10,padding:10}}>
      <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:8}}>Calibration Register · Forecast Verification</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:12}}>
        <div style={{background:S.panelBg,padding:8,textAlign:"center"}}><div style={{fontSize:18,color:S.travel,fontWeight:700}}>{calibration.total}</div><div style={{fontSize:9,color:"#555"}}>Total Projections</div></div>
        <div style={{background:S.panelBg,padding:8,textAlign:"center"}}><div style={{fontSize:18,color:S.acc,fontWeight:700}}>{calibration.open}</div><div style={{fontSize:9,color:"#555"}}>Open</div></div>
        <div style={{background:S.panelBg,padding:8,textAlign:"center"}}><div style={{fontSize:18,color:OBS_COLORS.confirmed,fontWeight:700}}>{calibration.confirmed}</div><div style={{fontSize:9,color:"#555"}}>Confirmed</div></div>
        <div style={{background:S.panelBg,padding:8,textAlign:"center"}}><div style={{fontSize:18,color:OBS_COLORS["reverse-and-rebuild"],fontWeight:700}}>{calibration.reversed}</div><div style={{fontSize:9,color:"#555"}}>Reversed</div></div>
        <div style={{background:S.panelBg,padding:8,textAlign:"center"}}><div style={{fontSize:18,color:S.acc,fontWeight:700}}>{calibration.rate}</div><div style={{fontSize:9,color:"#555"}}>Confirm Rate</div></div>
      </div>
      <div style={{fontSize:10,color:"#888",lineHeight:1.6}}>
        The calibration register tracks the empirical reliability of the SFO-WAM temporal embedding as a predictive 
        framework. This is analogous to forecast verification: it measures how well the structural hypothesis 
        (the invariant {N}-node DAG topology) performs against unfolding reality. It does not constitute causal 
        proof but rather observational evidence for or against the structural invariance claim.
      </div>
    </div>
    )}

    {/* ══════════════ TAB: HISTORY — Full observation log ══════════════ */}
    {tab==="history"&&(
    <div style={{border:`1px solid ${S.border}`,marginBottom:10,padding:10}}>
      <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:8}}>
        Full Observation Log · {obsStore.observations.length} observation(s) · {obsStore.lockins.length} lock-in(s) · {obsStore.projections.length} projection(s)
      </div>
      <div style={{maxHeight:400,overflow:"auto"}}>
        {obsStore.observations.slice().reverse().map((o,i)=>(
          <div key={i} style={{padding:"4px 8px",marginBottom:2,borderLeft:`3px solid ${OBS_COLORS[o.state]}`,background:"rgba(200,180,140,0.02)",fontSize:10}}>
            <span style={{color:OBS_COLORS[o.state],fontWeight:700,fontSize:9}}>{o.state}</span>
            <span style={{color:"#555",fontSize:9,marginLeft:8}}>Y={o.nodeY.toFixed(3)} · {o.timestamp?.slice(0,16)}</span>
            {o.travelY!==null&&<span style={{color:S.travel,fontSize:9,marginLeft:8}}>⟳ time-travel from Y={o.liveY?.toFixed(3)}</span>}
            <div style={{color:"#b8a878",marginTop:1}}>{o.digest?.slice(0,120)}</div>
          </div>
        ))}
      </div>
      {/* Summary */}
      <div style={{padding:"6px 0",borderTop:`1px solid ${S.border}`,marginTop:8,fontSize:9,color:"#555",display:"flex",gap:12,flexWrap:"wrap"}}>
        {OBS_STATES.map(st=><span key={st}><span style={{color:OBS_COLORS[st]}}>■</span> {st}: {obsStore.observations.filter(o=>o.state===st).length}</span>)}
        <span>Active lock-ins: {obsStore.lockins.filter(l=>l.state==="active").length}</span>
        <span>Reversed lock-ins: {obsStore.lockins.filter(l=>l.state==="reversed").length}</span>
      </div>
    </div>
    )}

    {/* ══════════════ TAB: FORGE — Create SFOs on the fly ══════════════ */}
    {tab==="forge"&&(
    <div style={{border:`1px solid ${S.border}`,marginBottom:10}}>

      {/* Active SFO indicator */}
      {overrideA!==null&&(
        <div style={{padding:"8px 12px",background:"rgba(255,20,147,0.06)",borderBottom:`1px solid rgba(255,20,147,0.15)`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:10,color:S.pink}}>Active: <b>{curLabel}</b> (A={curA}, C={curC.toFixed(2)})</span>
          <button onClick={switchToProps} style={{fontSize:9,padding:"3px 10px",cursor:"pointer",background:"rgba(240,192,64,0.1)",border:"1px solid rgba(240,192,64,0.25)",color:S.acc}}>
            RETURN TO {sfoLabel}
          </button>
        </div>
      )}

      {/* Mode selector */}
      <div style={{padding:10,borderBottom:`1px solid ${S.border}`}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:S.pink,letterSpacing:"0.08em",marginBottom:8}}>
          SFO Forge — Sense where canonical BB positions fall on the timeline
        </div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          {[["anchors","ANCHOR PAIRS (2+)"],["one_plus_A","ONE ANCHOR + KNOWN A"]].map(([m,label])=>(
            <button key={m} onClick={()=>setForgeMode(m)} style={{
              padding:"4px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:9,
              background:forgeMode===m?"rgba(255,20,147,0.1)":"transparent",
              border:`1px solid ${forgeMode===m?"rgba(255,20,147,0.3)":S.border}`,
              color:forgeMode===m?S.pink:"#888"
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Anchor inputs */}
      <div style={{padding:10,borderBottom:`1px solid ${S.border}`}}>
        {forgeAnchors.map((anc,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:"120px 1fr 1fr 30px",gap:8,alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:9,color:S.acc}}>Anchor {i+1}</div>
            <div>
              <input value={anc.y} onChange={e=>{const na=[...forgeAnchors];na[i]={...na[i],y:e.target.value};setForgeAnchors(na);}}
                placeholder="BB (Y)" style={{width:"100%",background:"#0c0c14",border:`1px solid ${S.border}`,color:S.fg,padding:"5px 8px",fontFamily:"inherit",fontSize:11,boxSizing:"border-box"}} />
            </div>
            <div>
              <input type="date" value={anc.date} onChange={e=>{const na=[...forgeAnchors];na[i]={...na[i],date:e.target.value};setForgeAnchors(na);}}
                style={{width:"100%",background:"#0c0c14",border:`1px solid ${S.border}`,color:S.fg,padding:"4px 8px",fontFamily:"inherit",fontSize:10,boxSizing:"border-box"}} />
            </div>
            {forgeAnchors.length>2&&(
              <button onClick={()=>setForgeAnchors(prev=>prev.filter((_,j)=>j!==i))}
                style={{background:"rgba(224,96,64,0.1)",border:"1px solid rgba(224,96,64,0.2)",color:"#e06040",cursor:"pointer",fontSize:10,padding:"2px 6px"}}>x</button>
            )}
          </div>
        ))}

        {/* Add anchor button (for least-squares with 3+) */}
        {forgeMode==="anchors"&&(
          <button onClick={()=>setForgeAnchors(prev=>[...prev,{y:"",date:""}])}
            style={{fontSize:9,padding:"3px 10px",cursor:"pointer",background:"rgba(192,128,255,0.1)",border:"1px solid rgba(192,128,255,0.2)",color:S.travel,marginBottom:8}}>
            + ADD ANCHOR {forgeAnchors.length>=3?"(least-squares)":""}
          </button>
        )}

        {/* Direct A input (one_plus_A mode) */}
        {forgeMode==="one_plus_A"&&(
          <div style={{marginTop:8}}>
            <div style={{fontSize:9,color:"#888",marginBottom:3}}>Known A (TNLDY days per Y-unit)</div>
            <input value={forgeDirectA} onChange={e=>setForgeDirectA(e.target.value)} placeholder="e.g. 100, 360, 365.2422..."
              style={{width:"100%",background:"#0c0c14",border:`1px solid ${S.border}`,color:S.fg,padding:"5px 8px",fontFamily:"inherit",fontSize:11,boxSizing:"border-box",marginBottom:6}} />
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {[100,360,365.2422,365.25,48.3].map(a=>(
                <button key={a} onClick={()=>setForgeDirectA(String(a))}
                  style={{fontSize:8,padding:"2px 6px",cursor:"pointer",
                    background:parseFloat(forgeDirectA)===a?"rgba(192,128,255,0.1)":"transparent",
                    border:`1px solid ${parseFloat(forgeDirectA)===a?"rgba(192,128,255,0.3)":S.border}`,
                    color:parseFloat(forgeDirectA)===a?S.travel:"#888"
                  }}>A={a}{a===360?" (yJ)":a===365.2422?" (trop)":a===48.3?" (sfo22)":""}</button>
              ))}
            </div>
          </div>
        )}

        {/* Anchor presets */}
        <div style={{marginTop:8,fontSize:9,color:"#666"}}>Quick-set BB positions:</div>
        <div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:4}}>
          {ANCHOR_PRESETS.map(p=>(
            <button key={p.y} onClick={()=>{
              const empty=forgeAnchors.findIndex(a=>!a.y);
              if(empty>=0){const na=[...forgeAnchors];na[empty]={...na[empty],y:String(p.y)};setForgeAnchors(na);}
            }} title={p.hint}
              style={{fontSize:8,padding:"2px 6px",cursor:"pointer",background:"transparent",border:`1px solid ${S.border}`,color:"#888"}}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Solution */}
      {forgeSolution&&forgePreview&&(
        <div style={{padding:10,borderBottom:`1px solid ${S.border}`,background:"rgba(255,20,147,0.03)"}}>
          <div style={{fontSize:9,textTransform:"uppercase",color:S.pink,letterSpacing:"0.08em",marginBottom:8}}>
            SOLVED — {forgeSolution.method}{forgeSolution.residual>0?` · RMSE=${forgeSolution.residual.toFixed(6)}`:""}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:10}}>
            <div style={{background:"rgba(255,20,147,0.06)",padding:"6px 8px",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:700,color:S.pink}}>{forgeSolution.A}</div>
              <div style={{fontSize:9,color:"#888"}}>A (coefficient)</div>
            </div>
            <div style={{background:"rgba(240,192,64,0.06)",padding:"6px 8px",textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:700,color:S.acc}}>{forgeSolution.C.toFixed(4)}</div>
              <div style={{fontSize:9,color:"#888"}}>C (ZTP)</div>
            </div>
            <div style={{background:"rgba(192,128,255,0.06)",padding:"6px 8px",textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:700,color:S.travel}}>{forgePreview.yNow}</div>
              <div style={{fontSize:9,color:"#888"}}>Y now (BB={forgePreview.bbNodeY})</div>
            </div>
            <div style={{background:S.panelBg,padding:"6px 8px",textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#b8a878"}}>{forgePreview.spanYears}yr</div>
              <div style={{fontSize:9,color:"#888"}}>{forgePreview.dateFirst} to {forgePreview.dateLast}</div>
            </div>
          </div>

          {/* Equation */}
          <div style={{background:"#0c0c14",padding:"6px 10px",border:`1px solid ${S.border}`,marginBottom:10,fontSize:11,textAlign:"center"}}>
            <code style={{color:S.acc}}>Z = {forgeSolution.A} * Y + {forgeSolution.C.toFixed(4)}</code>
          </div>

          {/* Timeline: toggle preview (17) vs full (every node) + CSV download */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button onClick={()=>setShowFull399(false)} style={{fontSize:9,padding:"2px 8px",cursor:"pointer",
                background:!showFull399?"rgba(255,20,147,0.1)":"transparent",
                border:`1px solid ${!showFull399?"rgba(255,20,147,0.3)":S.border}`,color:!showFull399?S.pink:"#888"}}>
                KEY NODES (17)
              </button>
              <button onClick={()=>setShowFull399(true)} style={{fontSize:9,padding:"2px 8px",cursor:"pointer",
                background:showFull399?"rgba(255,20,147,0.1)":"transparent",
                border:`1px solid ${showFull399?"rgba(255,20,147,0.3)":S.border}`,color:showFull399?S.pink:"#888"}}>
                FULL {N} NODES
              </button>
            </div>
            <button onClick={()=>downloadCSV(forgePreview.full399,(forgeName.trim()||"sfo")+"_"+N+"_timeline.csv")}
              style={{fontSize:9,padding:"2px 10px",cursor:"pointer",background:"rgba(80,180,120,0.1)",border:"1px solid rgba(80,180,120,0.25)",color:S.green}}>
              DOWNLOAD CSV ({N})
            </button>
          </div>
          <div style={{maxHeight:showFull399?500:250,overflow:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
              <thead><tr style={{borderBottom:`1px solid ${S.border}`,color:"#888",textAlign:"left",position:"sticky",top:0,background:S.bg}}>
                <th style={{padding:"3px 6px"}}>BB</th><th style={{padding:"3px 6px"}}>TNLDY</th>
                <th style={{padding:"3px 6px"}}>Calendar</th><th style={{padding:"3px 6px"}}>From Now</th>
              </tr></thead>
              <tbody>{(showFull399?forgePreview.full399:forgePreview.timeline).map((p,i)=>(
                <tr key={i} style={{borderBottom:"1px solid rgba(200,180,140,0.04)",
                  background:p.y===0?"rgba(240,192,64,0.04)":Math.abs(p.y-forgePreview.bbNodeY)<0.5?"rgba(255,20,147,0.05)":"transparent"}}>
                  <td style={{padding:"3px 6px",color:p.y===0?S.acc:"#b8a878",fontWeight:p.y===0?700:400}}>{p.y.toFixed(4)}{p.y===0?" <ZTP":""}</td>
                  <td style={{padding:"3px 6px",color:"#888"}}>{p.z.toFixed(4)}</td>
                  <td style={{padding:"3px 6px"}}>{p.date}</td>
                  <td style={{padding:"3px 6px",color:p.isPast?S.green:p.daysFromNow<90?S.acc:"#888"}}>
                    {p.isPast?Math.abs(p.daysFromNow)+"d ago":"in "+p.daysFromNow+"d"}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          {/* Name + Create */}
          <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center"}}>
            <input value={forgeName} onChange={e=>setForgeName(e.target.value)}
              placeholder="Name this SFO..."
              style={{flex:1,background:S.inputBg,border:`1px solid ${S.border}`,color:S.fg,padding:"5px 10px",fontFamily:"inherit",fontSize:11,boxSizing:"border-box"}} />
            <button onClick={createForgedSFO} disabled={!forgeName.trim()}
              style={{padding:"5px 16px",cursor:forgeName.trim()?"pointer":"not-allowed",
                background:forgeName.trim()?"rgba(255,20,147,0.15)":S.btnDisabledBg,
                border:`1px solid ${forgeName.trim()?"rgba(255,20,147,0.4)":S.btnDisabledBorder}`,
                color:forgeName.trim()?S.pink:S.fgMuted,fontFamily:"inherit",fontSize:10,fontWeight:700
              }}>CREATE SFO</button>
          </div>

          {/* Success toast — auto-dismisses after 3 s */}
          {forgeToast&&(
            <div style={{marginTop:8,padding:"6px 12px",
              background:"rgba(255,20,147,0.1)",border:`1px solid rgba(255,20,147,0.35)`,
              color:S.pink,fontSize:10,fontWeight:700,letterSpacing:"0.04em"}}>
              ✓ "{forgeToast}" added to registry
            </div>
          )}
        </div>
      )}

      {/* Forged SFO Registry */}
      <div style={{padding:10}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:"#888",letterSpacing:"0.08em",marginBottom:6}}>
          SFO Registry · {forgedSFOs.length} forged + 1 props-default ({sfoLabel})
        </div>

        {/* Props-default SFO */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",marginBottom:3,
          background:overrideA===null?"rgba(240,192,64,0.06)":"rgba(200,180,140,0.02)",
          border:`1px solid ${overrideA===null?"rgba(240,192,64,0.15)":"rgba(200,180,140,0.05)"}`}}>
          <div>
            <span style={{color:overrideA===null?S.acc:"#888",fontWeight:700,marginRight:8}}>{sfoLabel}</span>
            <span style={{fontSize:9,color:"#888"}}>A={agentA} C={agentC} (props)</span>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {overrideA===null?<span style={{fontSize:9,color:S.green,fontWeight:700}}>ACTIVE</span>:
              <button onClick={switchToProps} style={{fontSize:9,padding:"2px 8px",cursor:"pointer",background:"rgba(240,192,64,0.1)",border:"1px solid rgba(240,192,64,0.25)",color:S.acc}}>ACTIVATE</button>}
          </div>
        </div>

        {/* Forged SFOs */}
        {forgedSFOs.map(sfo=>{
          const isActive=overrideLabel===sfo.name;
          const store=isActive?obsStore:(sfoStores[sfo.name]||{observations:[],lockins:[],projections:[]});
          return(
            <div key={sfo.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",marginBottom:3,
              background:isActive?"rgba(255,20,147,0.06)":"rgba(200,180,140,0.02)",
              border:`1px solid ${isActive?"rgba(255,20,147,0.15)":"rgba(200,180,140,0.05)"}`}}>
              <div>
                <span style={{color:isActive?S.pink:"#b8a878",fontWeight:700,marginRight:8}}>{sfo.name}</span>
                <span style={{fontSize:9,color:"#888"}}>A={sfo.A} C={sfo.C.toFixed(2)} {sfo.method}</span>
                <span style={{fontSize:9,color:"#666",marginLeft:8}}>{store.observations.length} obs, {store.lockins.filter(l=>l.state==="active").length} lk, {store.projections.length} proj</span>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {isActive?<span style={{fontSize:9,color:S.green,fontWeight:700}}>ACTIVE</span>:
                  <button onClick={()=>switchToSFO(sfo)} style={{fontSize:9,padding:"2px 8px",cursor:"pointer",background:"rgba(255,20,147,0.1)",border:"1px solid rgba(255,20,147,0.25)",color:S.pink}}>ACTIVATE</button>}
                <button onClick={()=>downloadCSV(sfo.timeline399||forgeTimelineAll(sfo.A,sfo.C),sfo.name+"_"+N+".csv")}
                  style={{fontSize:8,padding:"2px 6px",cursor:"pointer",background:"rgba(80,180,120,0.08)",border:"1px solid rgba(80,180,120,0.2)",color:S.green}}>CSV</button>
                <span style={{fontSize:8,color:"#555"}}>{sfo.created.slice(0,10)}</span>
              </div>
            </div>
          );
        })}

        {forgedSFOs.length===0&&(
          <div style={{fontSize:10,color:"#666",padding:"8px 0"}}>
            No SFOs forged yet. Set anchor observations above, solve the system, name it, and create.
          </div>
        )}

        {/* Philosophy note */}
        <div style={{marginTop:10,padding:"8px 10px",background:S.panelBg,border:`1px solid ${S.border}`,fontSize:10,color:"#888",lineHeight:1.6}}>
          The SFO is the atom of the build. Every SFO shares the invariant {N}-node / {EDGES_RAW.length}-edge DAG
          topology but traverses it at a rate (A) and phase (C) determined by where the engineer senses
          its canonical positions meeting reality. Two anchor observations solve the system exactly.
          Three or more invoke least-squares regression for overdetermined systems.
          Each forged SFO maintains its own observation store, lock-in registry, and projection queue.
        </div>
      </div>
    </div>
    )}

  </div>);
}
