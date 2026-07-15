/**
 * Per-corridor specification: the manual, research-sourced ground truth that the
 * pipeline fuses with OSM geometry and Vegagerðin traffic counts.
 *
 * WHY a manual table? OSM tags are geometrically excellent but NOT authoritative
 * for operating configuration (research/05 §1: no `overtaking` tags; 2+2 roadbeds
 * striped as 2+1 read as `lanes=3`/dual in OSM). research/02 is the ground truth
 * for lane config / limits / junctions, so the segmentation below is transcribed
 * from research/02 and cross-referenced to Vegagerðin section codes (NRKAFLI) for
 * length + AADT. Each segment cites its research/02 row.
 *
 * Segment `approxKm` values are aligned to Vegagerðin 2025 section chainage
 * (layer 8 UPPH_STOD/ENDA_STOD, fetched live) and normalized in build so segments
 * exactly tile [0, lengthM]. `barrier` is derived from config in build.
 */
import { LonLat } from './util';
import { SegmentConfig, JunctionType } from '../../src/types';

export interface RawSeg {
  name: string;
  approxKm: number;
  config: SegmentConfig;
  maxspeedKmh: number;
  gradePct: number;
  overtakingAllowed: boolean;
  upgradable: boolean;
  upgradeHint?: 'tunnel-bore-2' | 'fourth-lane' | 'none';
  /** keep even if < merge threshold (e.g. the tunnel) */
  keepDistinct?: boolean;
}

export interface ManualJunction {
  name: string;
  type: JunctionType;
  /** Position by landmark coord (projected onto centerline) … */
  lonlat?: LonLat;
  /** … or by fraction of corridor length when no clean coord is available. */
  frac?: number;
  throughSpeedKmh?: number; // default per type in build
  conflictingVph?: number; // override the AADT-delta estimate
  upgradable: boolean;
}

export interface CorridorSpec {
  id: 'north' | 'south' | 'kef';
  name: string;
  ref: string;
  bbox: [number, number, number, number]; // south, west, north, east
  p0: LonLat; // Reykjavík-end anchor (offset 0)
  p1: LonLat; // far-end anchor
  /** Vegagerðin NRKAFLI section codes spanned, in order — authoritative length. */
  sectionCodes: string[];
  segments: RawSeg[];
  manualJunctions: ManualJunction[];
  /** live count-station IDSTODs on this corridor (research/01 §1). */
  stationIds: string[];
  /** rural mid-corridor fraction used as the demand AADT reference point. */
  aadtRefFrac: number;
}

// ---------------------------------------------------------------------------
// NORTH — Route 1 Vesturlandsvegur, Ártúnshöfði → Borgarnes  (research/02 §1)
// Authoritative length ≈ 67.8 km (Vegagerðin sections f2…g7).
// ---------------------------------------------------------------------------
const NORTH: CorridorSpec = {
  id: 'north',
  name: 'Reykjavík – Borgarnes',
  ref: '1',
  bbox: [64.05, -22.9, 64.65, -21.5],
  p0: [-21.788, 64.121], // Ártún / Nesbraut (49) split — Vesturlandsvegur begins
  p1: [-21.898, 64.56], // Borgarnes roundabout at Rte 54 (Snæfellsnesvegur), north end of town
  sectionCodes: ['f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'g0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'],
  aadtRefFrac: 0.45, // tunnel / Hvalfjörður rural reference
  segments: [
    // research/02 §1 rows top→bottom
    { name: 'Ártúnsbrekka–Úlfarsfellsvegur', approxKm: 2.19, config: 'D2', maxspeedKmh: 80, gradePct: 3, overtakingAllowed: false, upgradable: false }, // 2+2 urban; Ártúnsbrekka +3% fwd (research/05 §3)
    { name: 'Mosfellsbær (Úlfarsfell–Skarhólabraut)', approxKm: 6.4, config: 'D2', maxspeedKmh: 80, gradePct: 0, overtakingAllowed: false, upgradable: false }, // widened 2+2, twin roundabouts
    { name: 'Skarhólabraut–Varmhólar (necking)', approxKm: 3.0, config: 'S1', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: true, upgradable: true }, // 2+2→1+1 transition
    { name: 'Kjalarnes suður (Varmhólar–Grundarhverfi)', approxKm: 8.97, config: 'S21F', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: false, upgradable: true }, // new 2+1, wire median
    { name: 'Kjalarnes norður (Grundarhverfi–Hvalfjarðarvegur)', approxKm: 3.58, config: 'S21R', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: false, upgradable: true }, // 2+1 alternating passing dir
    { name: 'Hvalfjarðarvegur–gangamunni (S)', approxKm: 0.94, config: 'S1', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: true, upgradable: true }, // rural 1+1 to tunnel
    { name: 'Hvalfjarðargöng — niður (S helmingur)', approxKm: 2.9, config: 'S1', maxspeedKmh: 70, gradePct: -8.1, overtakingAllowed: false, upgradable: true, upgradeHint: 'tunnel-bore-2', keepDistinct: true }, // single bore, no passing; -8.1% fwd (research/02 §1)
    { name: 'Hvalfjarðargöng — norðurklifur (N helmingur)', approxKm: 2.86, config: 'S21F', maxspeedKmh: 70, gradePct: 8.1, overtakingAllowed: false, upgradable: true, upgradeHint: 'tunnel-bore-2', keepDistinct: true }, // 3-lane north climb, 2 lanes uphill; +8.1% fwd. Single bore ⇒ barrier forced false in build (documented exception)
    { name: 'Gangamunni (N)–Akrafjall', approxKm: 12.51, config: 'S1', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: true, upgradable: true }, // rural 1+1
    { name: 'Akrafjall–Borgarfjarðarbraut', approxKm: 11.64, config: 'S1', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: true, upgradable: true }, // rural 1+1, strongest seasonality (research/01)
    { name: 'Borgarfjörður–Borgarnes aðkoma', approxKm: 10.89, config: 'S1', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: true, upgradable: true }, // Borgarfjarðarbrú
    { name: 'Borgarnes (Borgarbraut–Rte 54)', approxKm: 1.95, config: 'S1', maxspeedKmh: 70, gradePct: 0, overtakingAllowed: false, upgradable: false }, // town approach
  ],
  manualJunctions: [
    { name: 'Höfðabakki (mislæg)', type: 'grade-separated', lonlat: [-21.79, 64.121], upgradable: false },
    { name: 'Víkurvegur (mislæg)', type: 'grade-separated', frac: 0.06, upgradable: false },
    { name: 'Þingvallavegur (Rte 36)', type: 'grade-separated', frac: 0.14, upgradable: false },
    // Mosfellsbær at-grade mainline roundabouts (research/02 §1 "twin
    // roundabouts" row); coords are the NAMED OSM torg rings on the trunk.
    { name: 'Hamratorg (Mosfellsbær)', type: 'roundabout', lonlat: [-21.7375, 64.1536], upgradable: true },
    { name: 'Skarhólatorg (Mosfellsbær)', type: 'roundabout', lonlat: [-21.7247, 64.1588], upgradable: true },
    { name: 'Lágafellstorg (Mosfellsbær)', type: 'roundabout', lonlat: [-21.7064, 64.1649], upgradable: true },
    // Kjalarnes 2+1 roundabouts (research/02 §1: Móar, Grundarhverfi,
    // Hvalfjarðarvegur); coords from the corresponding OSM rings — verified by
    // projection: Grundarhverfi lands on the S21F/S21R boundary (~20.6 km) and
    // Hvalfjarðarvegur on the 2+1→S1 boundary (~24.1 km) just before the tunnel.
    { name: 'Móar hringtorg', type: 'roundabout', lonlat: [-21.7816, 64.2149], upgradable: true },
    { name: 'Grundarhverfi hringtorg', type: 'roundabout', lonlat: [-21.8294, 64.2432], upgradable: true },
    { name: 'Hvalfjarðarvegur (Rte 47) hringtorg', type: 'roundabout', lonlat: [-21.8385, 64.2743], upgradable: true },
    // OSM ring 0.5 km north of the tunnel portal = the Akranes (Rte 51) junction
    // (research/01 section g0: "North portal → Akrafjallsvegur", 0.48 km).
    { name: 'Akrafjallsvegur (Rte 51) hringtorg', type: 'roundabout', lonlat: [-21.9122, 64.3083], upgradable: true },
    { name: 'Borgarnes hringtorg (Rte 54)', type: 'roundabout', lonlat: [-21.8976, 64.5602], upgradable: false },
  ],
  // research/01 §1 Route 1 North live stations
  stationIds: ['5019', '925', '5001', '906', '36', '119', '911', '72', '12', '917'],
};

// ---------------------------------------------------------------------------
// SOUTH — Route 1 Suðurlandsvegur, Ártún → Selfoss (Ölfusá)  (research/02 §2)
// Authoritative length ≈ 49.0 km (Vegagerðin sections e3…d5).
// Includes the urban 2+2 from the Ártún tie-in per research/02 (CONTRACTS calls
// the RVK end "Rauðavatn/Norðlingaholt" approximately).
// ---------------------------------------------------------------------------
const SOUTH: CorridorSpec = {
  id: 'south',
  name: 'Reykjavík – Selfoss',
  ref: '1',
  // East edge -20.85 so the box covers Selfoss/Ölfusá (lon -20.93); research/05's
  // suggested -21.0 clips the last ~5 km before Selfoss.
  bbox: [63.9, -21.9, 64.15, -20.85],
  p0: [-21.8, 64.113], // Ártún tie-in (Suðurlandsvegur begins)
  p1: [-21.008, 63.9365], // Selfoss west end — Ölfusá bridge west approach (CONTRACTS)
  sectionCodes: ['e3', 'e2', 'e1', 'd9', 'd8', 'd6', 'd5'],
  aadtRefFrac: 0.55, // Hellisheiði plateau
  segments: [
    { name: 'Ártún–Rauðavatn', approxKm: 2.38, config: 'D2', maxspeedKmh: 70, gradePct: 0, overtakingAllowed: false, upgradable: false }, // 2+2 urban divided
    { name: 'Rauðavatn–Lögbergsbrekka', approxKm: 3.46, config: 'D2', maxspeedKmh: 80, gradePct: 0, overtakingAllowed: false, upgradable: false }, // 2+1→2+2 (Hólmsá 4-laned)
    { name: 'Lögberg–Hamragil', approxKm: 9.54, config: 'S21F', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: false, upgradable: true }, // 1+1→2+1 w/ wire median; Þrengslavegur jct
    { name: 'Bolaöldur klifur (Hellisheiði)', approxKm: 8.0, config: 'S21F', maxspeedKmh: 90, gradePct: 4, overtakingAllowed: false, upgradable: true }, // 2+1; +4% climb (research/05 §3)
    { name: 'Hellisheiði — háslétta/Kambabrún', approxKm: 9.0, config: 'S21R', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: false, upgradable: true }, // 2+1 alternating passing dir
    { name: 'Kambar niður', approxKm: 3.0, config: 'D2', maxspeedKmh: 90, gradePct: -6, overtakingAllowed: false, upgradable: true }, // 2+2 narrow divided; -6% fwd
    { name: 'Kambafót–Hveragerði', approxKm: 4.31, config: 'S1', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: true, upgradable: true }, // 1+1→2+1; 70 near town
    { name: 'Ölfus (Hveragerði–Selfoss)', approxKm: 7.33, config: 'S21F', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: false, upgradable: true, upgradeHint: 'fourth-lane' }, // 2+2 roadbed op. as 2+1, wire median (research/02 §2)
    { name: 'Selfoss aðkoma–Ölfusárbrú', approxKm: 2.01, config: 'S1', maxspeedKmh: 60, gradePct: 0, overtakingAllowed: false, upgradable: false }, // urban entrance
  ],
  manualJunctions: [
    { name: 'Breiðholtsbraut (mislæg)', type: 'grade-separated', frac: 0.02, upgradable: false },
    { name: 'Þrengslavegur (Rte 39)', type: 't-junction', frac: 0.28, upgradable: false },
    // Coords from the corresponding OSM rings on the mainline (research/02 §2:
    // roundabout at Hveragerði west entrance; roundabout at Biskupstungnabraut).
    { name: 'Hveragerði hringtorg (vestur)', type: 'roundabout', lonlat: [-21.1929, 63.9952], upgradable: true },
    { name: 'Biskupstungnabraut (Rte 35) hringtorg', type: 'roundabout', lonlat: [-21.0207, 63.9521], upgradable: true },
    // Selfoss west-entrance roundabout (OSM: Ingólfstorg) on the urban approach.
    { name: 'Ingólfstorg (Selfoss vestur)', type: 'roundabout', lonlat: [-21.0137, 63.9479], upgradable: false },
    { name: 'Hvammsvegur eystri (staggered T)', type: 't-junction', frac: 0.91, upgradable: false },
  ],
  // research/01 §1 Route 1 South live stations
  stationIds: ['923', '17', '1', '31', '63', '942', '5027'],
};

// ---------------------------------------------------------------------------
// KEF — Route 41 Reykjanesbraut, Hafnarfjörður → KEF airport  (research/02 §3)
// Authoritative length ≈ 40.0 km (Vegagerðin sections 14…22). Full 2+2 since
// Dec 2025, 90 km/h throughout (NOT raised to 110).
// ---------------------------------------------------------------------------
const KEF: CorridorSpec = {
  id: 'kef',
  name: 'Hafnarfjörður – Keflavíkurflugvöllur',
  ref: '41',
  bbox: [63.95, -22.75, 64.15, -21.85],
  p0: [-21.945, 64.068], // Hafnarfjörður entrance (Lækjargata / Fjarðarhraun area)
  p1: [-22.628, 63.9993], // KEF terminal junction (end of OSM ref-41 coverage at Flugstöð)
  sectionCodes: ['14', '15', '16', '17', '18', '19', '21', '22'],
  aadtRefFrac: 0.45, // Straumsvík / Vogar rural mid
  segments: [
    { name: 'Hafnarfjörður (Lækjargata–Álftanesvegur)', approxKm: 2.9, config: 'D2', maxspeedKmh: 60, gradePct: 0, overtakingAllowed: false, upgradable: false }, // at-grade signals — the bottleneck (research/02 §3)
    { name: 'Álftanesvegur–Straumsvík', approxKm: 6.5, config: 'D2', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: false, upgradable: true }, // 2+2, grade-separated
    { name: 'Straumsvík–Hvassahraun', approxKm: 6.75, config: 'D2', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: false, upgradable: true }, // final phase opened Dec 2025
    { name: 'Hvassahraun–Vogar', approxKm: 6.0, config: 'D2', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: false, upgradable: true },
    { name: 'Vogar–Strandarheiði', approxKm: 5.14, config: 'D2', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: false, upgradable: true },
    { name: 'Strandarheiði–Fitjar', approxKm: 5.14, config: 'D2', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: false, upgradable: true },
    { name: 'Fitjar–Njarðvík', approxKm: 4.85, config: 'D2', maxspeedKmh: 90, gradePct: 0, overtakingAllowed: false, upgradable: true },
    { name: 'Reykjanesbær–Flugstöð aðkoma', approxKm: 2.73, config: 'D2', maxspeedKmh: 70, gradePct: 0, overtakingAllowed: false, upgradable: false }, // roundabouts, airport approach
  ],
  manualJunctions: [
    { name: 'Lækjargata (umferðarljós)', type: 'signal', frac: 0.01, upgradable: true },
    { name: 'Fjarðarhraun (umferðarljós)', type: 'signal', frac: 0.05, upgradable: true },
    { name: 'Krýsuvíkurvegur (mislæg)', type: 'grade-separated', frac: 0.12, upgradable: false },
    // research/02 §3: the Straumsvík roundabout sits ON A BRIDGE over the
    // mainline — grade-separated for corridor traffic (not a capacity server).
    { name: 'Straumsvík (mislæg, hringtorg á brú)', type: 'grade-separated', frac: 0.2, upgradable: false },
    { name: 'Vogar (mislæg)', type: 'grade-separated', frac: 0.5, upgradable: false },
    { name: 'Grænás / Njarðvík', type: 'grade-separated', frac: 0.88, upgradable: false },
    { name: 'Reykjanesbær hringtorg', type: 'roundabout', frac: 0.94, upgradable: false },
    { name: 'Flugstöð hringtorg', type: 'roundabout', frac: 0.99, upgradable: false },
  ],
  // research/01 §1 Route 41 live stations
  stationIds: ['5020', '5038', '14', '5004', '935', '934'],
};

export const CORRIDORS: CorridorSpec[] = [NORTH, SOUTH, KEF];
