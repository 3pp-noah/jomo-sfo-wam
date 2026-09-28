import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTheme } from "./App";

// ═══════════════════════════════════════════════════════════════════
// SFO-WAM ENGINE v2 — Autonomous PDP Causal Agent Backend
// 399 nodes · 701 edges · Four Operations: Observe · Propagate · Project · Judge
// d-Separation · Lock-in Registry · Projection Resolution · Digest Engine
// Parameterised by (A, C) for any agent in the 759-agent JOMO constellation
// ═══════════════════════════════════════════════════════════════════

// ── TNLDY TIME AUTHORITY ──
const EPOCH = 4703008911.6524158066013043478202;
const MSD = 86400000;
function tnldy(ms) { return (EPOCH + ms) / MSD; }
function tnldyNow() { return tnldy(Date.now()); }
function tnldyToMs(z) { return z * MSD - EPOCH; }
function tnldyToDate(z) { return new Date(tnldyToMs(z)); }
function agentY(z, A, C) { return A === 0 ? 0 : (z - C) / A; }
function agentZ(y, A, C) { return A * y + C; }
const DISPLAY_TIME_ZONE = "Africa/Lagos";
const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: DISPLAY_TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function fd(d) { if (!d || isNaN(d.getTime())) return "—"; return DATE_FORMAT.format(d); }
function ft(d) { if (!d || isNaN(d.getTime())) return ""; return TIME_FORMAT.format(d) + " WAT"; }

// ── 399 NODE Y-COORDINATES (sorted ascending) ──
const NODE_YS=[-147.6,-132.97,-126.3,-123.01,-120.97,-110.97,-104.4,-100.97,-98.3,-95.6,-91.56,-90.6,-83.19,-72.03,-61.2,-60.97,-43.2,-39.5984,-38.8,-37.5186,-36.4836,-35.5964,-34.9064,-34.2657,-32.6689,-32.14,-32.0281,-30.1849,-29.6329,-29.071,-28.6471,-28.5289,-28.3909,-27.6,-27.5629,-26.6264,-26.0843,-25.9,-24.7831,-23.8171,-23.6594,-23.4623,-22.5259,-22.4766,-22.4569,-22.1119,-21.9936,-21.8161,-21.6,-21.481,-21.1853,-20.8699,-20.5741,-20.2883,-19.5983,-19.1251,-19.1153,-19.0857,-19.0266,-18.9871,-18.859,-18.8294,-18.79,-18.6126,-18.6027,-18.2676,-18.1394,-18.0211,-18.0,-17.8733,-17.8437,-17.5283,-17.4396,-17.272,-17.2424,-17.134,-16.9664,-16.8383,-16.7397,-16.5721,-16.56,-16.4,-16.0497,-16.0,-15.6357,-15.2414,-15.0,-14.8471,-14.4529,-14.4,-14.1571,-14.0783,-13.684,-13.5066,-13.5,-13.32,-13.14,-12.96,-12.718,-12.5209,-12.42,-12.1266,-12.0576,-12.0,-11.7,-11.6633,-11.6337,-11.407,-11.34,-11.1901,-11.0127,-10.9536,-10.8846,-10.8254,-10.786,-10.7071,-10.6283,-10.51,-10.4311,-10.39,-10.2241,-9.8496,-9.8299,-9.4602,-9.4356,-9.3271,-9.18,-9.0659,-8.8984,-8.89,-8.8688,-8.8491,-8.8294,-8.5928,-8.5731,-8.5336,-8.5189,-8.4646,-8.4548,-8.302,-8.2823,-8.2379,-8.2182,-8.1394,-8.1295,-8.1,-8.0704,-8.0,-7.92,-7.8535,-7.6859,-7.6761,-7.6613,-7.5282,-7.3902,-7.38,-7.1241,-7.0156,-7.0107,-7.0098,-6.9113,-6.8915,-6.8776,-6.7199,-6.6944,-6.668,-6.6057,-6.5622,-6.56,-6.517,-6.452,-6.4341,-6.344,-6.3,-6.2764,-6.236,-6.128,-6.02,-6.0,-5.912,-5.804,-5.7342,-5.728,-5.7145,-5.696,-5.588,-5.5469,-5.48,-5.4089,-5.4065,-5.372,-5.298,-5.2956,-5.264,-5.1871,-5.156,-5.048,-4.94,-4.832,-4.724,-4.616,-4.508,-4.5,-4.4,-4.292,-4.184,-4.076,-3.968,-3.86,-3.752,-3.644,-3.536,-3.428,-3.32,-3.31,-3.212,-3.104,-2.996,-2.888,-2.78,-2.672,-2.564,-2.456,-2.348,-2.24,-2.132,-2.024,-1.916,-0.18,0.0,0.33,0.8,1.62,1.81,2.34,3.6,3.78,4.4,4.86,5.16,5.41,5.58,5.94,6.12,6.41,6.65,6.66,7.2,8.1,9.01,9.5687,9.72,9.99,10.8,10.95,11.1921,11.547,11.6919,11.8457,12.24,12.41,12.6,12.61,12.78,12.9,13.318,13.35,13.5993,14.4,14.608,14.76,14.82,14.95,15.128,16.21,16.918,17.22,17.32,17.71,18.0,18.29,18.39,18.41,18.728,19.65,19.81,20.0,20.186,20.34,20.41,20.42,20.518,21.6,21.913,22.32,22.328,23.41,23.61,23.71,23.81,24.01,24.118,24.21,24.27,24.29,24.2969,24.329,24.41,24.412,24.447,24.61,24.81,24.84,24.897,25.2,25.565,25.928,26.81,27.01,27.36,27.41,27.718,28.28,29.217,29.528,29.88,30.42,30.538,30.638,31.028,31.318,31.5,31.63,32.13,32.4,32.68,33.128,33.39,33.485,33.504,33.565,33.61,34.0,34.1,34.24,34.3,34.8,34.918,34.92,35.418,36.52,36.68,36.7033,36.715,36.728,36.928,37.112,37.128,37.328,37.44,37.528,37.728,37.928,38.128,38.3478,38.518,39.74,39.8,39.88,40.1739,42.28,42.86,45.0,47.52,50.04,52.56,55.08,57.6,60.12,62.64,65.16,67.48,67.68,70.2,72.0,72.72,73.043,75.24,75.6,76.695,77.76,80.28,82.8,85.68,87.84,97.2,111.6,183.6,212.4];

// ── 701 EDGES [fromIdx, toIdx, weight] ──
const EDGES_RAW=[[0,1,14.63],[0,6,43.2],[1,2,6.67],[2,3,3.29],[3,4,2.04],[4,5,10.0],[5,6,6.57],[6,7,3.43],[6,14,43.2],[7,8,2.67],[7,15,40.0],[8,9,2.7],[8,15,37.33],[9,10,4.04],[9,15,34.63],[10,11,0.96],[10,15,30.59],[11,12,7.41],[12,13,11.16],[13,14,10.83],[14,15,0.23],[14,16,18.0],[15,16,17.77],[16,17,3.6016],[17,18,0.7984],[17,26,7.5703],[17,54,20.0001],[17,290,60.0184],[17,326,70.0184],[18,19,1.2814],[18,28,9.1671],[19,20,1.035],[19,31,8.9897],[20,21,0.8872],[20,34,8.9207],[21,22,0.69],[21,35,8.97],[22,23,0.6407],[22,36,8.8221],[23,24,1.5968],[23,38,9.4826],[24,25,0.5289],[24,29,3.5979],[25,26,0.1119],[25,33,4.54],[26,27,1.8432],[26,43,9.5515],[27,28,0.552],[27,42,7.659],[28,29,0.5619],[29,30,0.4239],[30,31,0.1182],[30,39,4.83],[31,32,0.138],[32,33,0.7909],[32,58,9.3643],[33,34,0.0371],[33,37,1.7],[34,35,0.9365],[35,36,0.5421],[36,37,0.1843],[37,38,1.1169],[38,39,0.966],[39,40,0.1577],[39,59,4.83],[40,41,0.1971],[40,43,1.1828],[41,42,0.9364],[41,71,5.934],[42,43,0.0493],[43,44,0.0197],[43,48,0.8766],[44,45,0.345],[45,46,0.1183],[45,70,4.2682],[46,47,0.1775],[46,49,0.5126],[47,48,0.2161],[47,74,4.5737],[48,49,0.119],[48,53,1.3117],[49,50,0.2957],[49,55,2.3559],[50,51,0.3154],[50,61,2.3559],[50,257,2.1232],[51,52,0.2958],[51,64,2.2672],[52,53,0.2858],[52,56,1.4588],[53,54,0.69],[54,55,0.4732],[54,57,0.5126],[54,60,0.7393],[54,69,1.725],[55,56,0.0098],[56,57,0.0296],[57,58,0.0591],[57,60,0.2267],[58,59,0.0395],[59,60,0.1281],[59,90,4.83],[60,61,0.0296],[61,62,0.0394],[62,63,0.1774],[62,72,1.3504],[63,64,0.0099],[63,67,0.5915],[63,73,1.3406],[63,77,1.7743],[64,65,0.3351],[65,66,0.1282],[66,67,0.1183],[67,68,0.0211],[67,73,0.7491],[67,78,1.2814],[67,79,1.449],[67,80,1.4611],[68,69,0.1267],[68,229,18.0],[68,279,36.0],[69,70,0.0296],[70,71,0.3154],[71,72,0.0887],[72,73,0.1676],[73,74,0.0296],[74,75,0.1084],[75,76,0.1676],[75,77,0.2957],[75,78,0.3943],[75,79,0.5619],[75,82,1.0843],[76,77,0.1281],[77,78,0.0986],[78,79,0.1676],[79,80,0.0121],[80,81,0.16],[80,83,0.56],[81,82,0.3503],[82,83,0.0497],[83,84,0.3643],[83,85,0.7586],[84,85,0.3943],[84,87,0.7886],[84,88,1.1828],[85,86,0.2414],[86,87,0.1529],[86,103,3.0],[86,147,7.0],[87,88,0.3942],[88,89,0.0529],[89,90,0.2429],[89,94,0.9],[89,95,1.08],[89,96,1.26],[89,97,1.44],[90,91,0.0788],[90,125,4.83],[91,92,0.3943],[92,93,0.1774],[93,94,0.0066],[93,98,0.7886],[94,95,0.18],[95,96,0.18],[96,97,0.18],[97,98,0.242],[97,100,0.54],[98,99,0.1971],[99,100,0.1009],[99,101,0.3943],[100,101,0.2934],[100,104,0.72],[101,102,0.069],[102,103,0.0576],[102,105,0.3943],[103,104,0.3],[103,128,3.1016],[103,147,4.0],[104,105,0.0367],[104,108,0.36],[105,106,0.0296],[106,107,0.2267],[107,108,0.067],[107,109,0.2169],[108,109,0.1499],[108,126,2.16],[109,110,0.1774],[110,111,0.0591],[111,112,0.069],[112,113,0.0592],[113,114,0.0394],[113,116,0.1971],[113,118,0.3943],[113,120,0.6013],[113,121,0.9758],[114,115,0.0789],[115,116,0.0788],[116,117,0.1183],[116,118,0.1972],[117,118,0.0789],[117,119,0.12],[118,119,0.0411],[119,120,0.1659],[119,317,37.2],[120,121,0.3745],[120,122,0.3942],[121,122,0.0197],[122,123,0.3697],[123,124,0.0246],[124,125,0.1085],[124,169,2.9186],[125,126,0.1471],[125,127,0.2612],[125,202,4.8271],[126,127,0.1141],[126,145,1.08],[127,128,0.1675],[128,129,0.0084],[129,130,0.0212],[130,131,0.0197],[131,132,0.0197],[132,133,0.2366],[133,134,0.0197],[134,135,0.0395],[134,136,0.0542],[135,136,0.0147],[136,137,0.0543],[137,138,0.0098],[138,139,0.1528],[139,140,0.0197],[140,141,0.0444],[141,142,0.0197],[142,143,0.0788],[143,144,0.0099],[144,145,0.0295],[145,146,0.0296],[145,148,0.18],[146,147,0.0704],[147,148,0.08],[148,149,0.0665],[148,155,0.54],[149,150,0.1676],[150,151,0.0098],[151,152,0.0148],[152,153,0.1331],[153,154,0.138],[154,155,0.0102],[155,156,0.2559],[155,165,0.712],[156,157,0.1085],[157,158,0.0049],[158,159,0.0009],[159,160,0.0985],[160,161,0.0198],[161,162,0.0139],[162,163,0.1577],[163,164,0.0255],[164,165,0.0264],[164,166,0.0887],[165,166,0.0623],[165,168,0.108],[166,167,0.0435],[167,168,0.0022],[167,171,0.1281],[167,174,0.2858],[168,169,0.043],[168,170,0.108],[169,170,0.065],[170,171,0.0179],[170,172,0.108],[171,172,0.0901],[172,173,0.044],[172,175,0.108],[173,174,0.0236],[173,178,0.3],[173,182,0.572],[173,214,2.99],[173,229,6.3],[174,175,0.0404],[174,181,0.5422],[174,186,0.7295],[174,188,0.8675],[175,176,0.108],[176,177,0.108],[177,178,0.02],[177,179,0.108],[178,179,0.088],[178,182,0.272],[179,180,0.108],[180,181,0.0698],[180,184,0.108],[181,182,0.0062],[181,183,0.0197],[182,183,0.0135],[182,214,2.418],[182,229,5.728],[183,184,0.0185],[183,186,0.1676],[183,188,0.3056],[184,185,0.108],[185,186,0.0411],[185,187,0.108],[186,187,0.0669],[186,188,0.138],[187,188,0.0711],[187,190,0.108],[188,189,0.0024],[189,190,0.0345],[190,191,0.074],[190,193,0.108],[191,192,0.0024],[192,193,0.0316],[192,194,0.1085],[193,194,0.0769],[193,195,0.108],[194,195,0.0311],[194,202,0.6871],[195,196,0.108],[196,197,0.108],[197,198,0.108],[198,199,0.108],[199,200,0.108],[200,201,0.108],[201,202,0.008],[201,203,0.108],[202,203,0.1],[202,230,4.83],[203,204,0.108],[204,205,0.108],[205,206,0.108],[206,207,0.108],[207,208,0.108],[208,209,0.108],[209,210,0.108],[210,211,0.108],[211,212,0.108],[212,213,0.108],[213,214,0.01],[214,215,0.098],[214,229,3.31],[214,324,1.81],[215,216,0.108],[216,217,0.108],[217,218,0.108],[218,219,0.108],[219,220,0.108],[220,221,0.108],[221,222,0.108],[222,223,0.108],[223,224,0.108],[224,225,0.108],[225,226,0.108],[226,227,0.108],[227,228,2.096],[228,229,0.18],[228,232,1.44],[229,230,0.33],[229,231,0.8],[229,233,1.81],[229,235,3.6],[229,253,10.8],[229,254,10.95],[229,261,12.6],[229,263,12.78],[229,279,18.0],[229,293,21.913],[229,314,25.2],[229,315,25.565],[229,331,31.5],[229,364,38.3478],[229,384,72.0],[229,386,73.043],[229,388,75.6],[229,389,76.695],[230,231,0.47],[230,239,4.83],[231,232,0.82],[231,237,3.6],[232,233,0.19],[232,234,0.72],[233,234,0.53],[233,235,1.79],[234,235,1.26],[234,236,1.44],[235,236,0.18],[235,240,1.81],[235,247,3.6],[236,237,0.62],[236,238,1.08],[237,238,0.46],[238,239,0.3],[238,241,0.72],[239,240,0.25],[239,252,4.83],[240,241,0.17],[240,243,0.71],[240,247,1.79],[241,242,0.36],[242,243,0.18],[242,246,0.72],[243,244,0.29],[244,245,0.24],[244,259,5.83],[244,260,6.0],[245,246,0.01],[245,250,2.9187],[246,247,0.54],[247,248,0.9],[247,249,1.81],[247,253,3.6],[248,249,0.91],[249,250,0.5587],[249,251,0.71],[249,253,1.79],[249,255,2.1821],[250,251,0.1513],[250,255,1.6234],[250,257,2.1232],[251,252,0.27],[251,259,2.52],[252,253,0.81],[253,254,0.15],[253,255,0.3921],[253,262,1.81],[253,268,3.6],[254,255,0.2421],[255,256,0.3549],[256,257,0.1449],[256,261,1.053],[256,306,12.782],[256,356,25.565],[257,258,0.1538],[258,259,0.3943],[258,272,3.1043],[259,260,0.17],[259,261,0.36],[259,270,2.52],[259,307,12.17],[260,261,0.19],[260,282,6.0],[260,307,12.0],[261,262,0.01],[261,263,0.18],[261,264,0.3],[262,263,0.17],[262,268,1.79],[263,264,0.12],[263,315,12.785],[264,265,0.418],[265,266,0.032],[265,273,1.81],[265,275,3.6],[265,277,3.6],[265,365,25.2],[266,267,0.2493],[266,268,1.05],[266,298,10.36],[267,268,0.8007],[268,269,0.208],[268,274,1.81],[268,279,3.6],[269,270,0.152],[270,271,0.06],[270,281,3.63],[271,272,0.13],[271,284,4.83],[272,273,0.178],[273,274,1.082],[273,275,1.79],[274,275,0.708],[274,278,1.5],[274,279,1.79],[274,285,3.6],[275,276,0.302],[275,283,1.81],[275,291,3.6],[276,277,0.1],[277,278,0.39],[278,279,0.29],[279,280,0.29],[279,281,0.39],[279,285,1.81],[279,292,3.6],[280,281,0.1],[281,282,0.02],[281,283,0.338],[281,292,3.21],[281,294,3.93],[282,283,0.318],[282,307,6.0],[283,284,0.922],[283,291,1.79],[283,295,3.6],[284,285,0.16],[284,288,0.69],[285,286,0.19],[285,292,1.79],[285,296,3.6],[286,287,0.186],[287,288,0.154],[288,289,0.07],[289,290,0.01],[290,291,0.098],[290,326,10.0],[291,292,1.082],[291,295,1.81],[291,301,3.6],[292,293,0.313],[292,294,0.72],[292,296,1.81],[292,314,3.6],[293,294,0.407],[294,295,0.008],[294,312,2.52],[295,296,1.082],[295,301,1.79],[295,316,3.6],[296,297,0.2],[296,311,1.4],[296,314,1.79],[296,324,3.6],[297,298,0.1],[297,299,0.2],[298,299,0.1],[298,307,0.7],[299,300,0.2],[300,301,0.108],[300,302,0.2],[301,302,0.092],[301,316,1.81],[301,321,3.6],[302,303,0.06],[302,304,0.08],[302,307,0.2],[303,304,0.02],[303,307,0.14],[304,305,0.0069],[304,306,0.039],[304,309,0.157],[304,317,2.52],[305,306,0.0321],[305,317,2.5131],[305,369,15.877],[306,307,0.081],[306,356,12.783],[306,369,15.8449],[307,308,0.002],[307,309,0.037],[307,310,0.2],[307,320,3.0],[308,309,0.035],[309,310,0.163],[309,313,0.45],[310,311,0.2],[311,312,0.03],[312,313,0.057],[312,319,2.52],[312,334,7.56],[313,314,0.303],[314,315,0.365],[315,316,0.363],[316,317,0.882],[316,318,1.082],[316,321,1.79],[316,324,3.6],[317,318,0.2],[318,319,0.35],[319,320,0.05],[319,325,2.52],[320,321,0.308],[321,322,0.562],[321,324,1.81],[321,330,3.6],[322,323,0.937],[322,351,8.4],[322,352,8.4233],[322,353,8.435],[323,324,0.311],[323,327,1.321],[323,328,1.421],[323,329,1.811],[324,325,0.352],[324,329,1.5],[324,330,1.79],[324,336,3.6],[325,326,0.54],[325,334,2.52],[326,327,0.118],[327,328,0.1],[328,329,0.39],[329,330,0.29],[329,332,0.602],[330,331,0.182],[330,332,0.312],[330,336,1.81],[330,339,2.186],[330,347,3.6],[331,332,0.13],[332,333,0.5],[333,334,0.27],[333,335,0.55],[334,335,0.28],[334,348,2.52],[335,336,0.448],[335,339,0.824],[336,337,0.262],[336,338,0.357],[336,340,0.437],[336,341,0.482],[336,343,0.972],[336,344,1.112],[336,346,1.672],[336,347,1.79],[336,354,3.6],[337,338,0.095],[338,339,0.019],[339,340,0.061],[339,342,0.496],[339,347,1.414],[340,341,0.045],[341,342,0.39],[342,343,0.1],[342,345,0.3],[343,344,0.14],[344,345,0.06],[345,346,0.5],[345,347,0.618],[346,347,0.118],[347,348,0.002],[347,349,0.5],[347,354,1.81],[347,365,3.6],[348,349,0.498],[348,359,2.52],[349,350,1.102],[350,351,0.16],[350,369,3.6539],[351,352,0.0233],[352,353,0.0117],[353,354,0.013],[354,355,0.2],[354,363,1.4],[354,365,1.79],[354,369,3.4459],[355,356,0.184],[355,357,0.2],[356,357,0.016],[357,358,0.2],[358,359,0.112],[358,360,0.2],[359,360,0.088],[359,368,2.44],[360,361,0.2],[361,362,0.2],[362,363,0.2],[363,364,0.2198],[364,365,0.1702],[365,366,1.222],[366,367,0.06],[367,368,0.08],[368,369,0.2939],[368,371,2.98],[369,370,2.1061],[369,381,27.3061],[370,371,0.58],[370,381,25.2],[371,372,2.14],[372,373,2.52],[373,374,2.52],[374,375,2.52],[375,376,2.52],[376,377,2.52],[377,378,2.52],[378,379,2.52],[379,380,2.52],[380,381,2.32],[380,382,2.52],[381,382,0.2],[382,383,2.52],[383,384,1.8],[383,385,2.52],[384,385,0.72],[384,388,3.6],[385,386,0.323],[385,387,2.52],[386,387,2.197],[386,389,3.652],[387,388,0.36],[387,390,2.52],[388,389,1.095],[389,390,1.065],[390,391,2.52],[391,392,2.52],[392,393,2.88],[392,394,5.04],[392,395,14.4],[393,394,2.16],[394,395,9.36],[395,396,14.4],[396,397,72.0],[397,398,28.8]];

// ═══════════════════════════════════════════════════════════
// GRAPH ENGINE — adjacency, classification, d-separation
// ═══════════════════════════════════════════════════════════
const N = NODE_YS.length;
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
  ["world","World"],["middle-east","Middle East"],["russia-eurasia","Russia & Eurasia"],["asia","Asia"],
  ["africa","Africa & Nigeria"],["geopolitical-analysis","Geopolitical analysis"],["defense-nuclear","Defence & nuclear"],
  ["economic","Economic"],["religious","Religious"],["science-technology","Science & technology"],
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

function dateStrToTnldy(s){const ms=new Date(s+"T00:00:00Z").getTime();return isNaN(ms)?null:(EPOCH+ms)/MSD;}

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

  // ── CSV download for full 399-node timeline ──
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
        <span style={{color:"#555",fontSize:9,marginLeft:10}}>{curLabel} · A={curA} · C={curC} · 399n/701e</span>
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
        (the invariant 399-node DAG topology) performs against unfolding reality. It does not constitute causal 
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

          {/* Timeline: toggle preview (17) vs full (399) + CSV download */}
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
                FULL 399 NODES
              </button>
            </div>
            <button onClick={()=>downloadCSV(forgePreview.full399,(forgeName.trim()||"sfo")+"_399_timeline.csv")}
              style={{fontSize:9,padding:"2px 10px",cursor:"pointer",background:"rgba(80,180,120,0.1)",border:"1px solid rgba(80,180,120,0.25)",color:S.green}}>
              DOWNLOAD CSV (399)
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
                <button onClick={()=>downloadCSV(sfo.timeline399||forgeTimelineAll(sfo.A,sfo.C),sfo.name+"_399.csv")}
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
          The SFO is the atom of the build. Every SFO shares the invariant 399-node / 701-edge DAG
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
