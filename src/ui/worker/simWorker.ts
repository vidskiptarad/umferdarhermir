/// <reference lib="webworker" />
import { Simulation } from '@/sim';
import type { CorridorDemand, CorridorId, CorridorModel, DemandPresetId, Scenario } from '@/types';
import type { WorkerIn, WorkerOut } from '../workerProtocol';
import { scenarioHash } from '../scenario';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let models = new Map<CorridorId, CorridorModel>();
let demand = new Map<CorridorId, CorridorDemand>();
let role: 'live' | 'batch' = 'batch';

function post(msg: WorkerOut, transfer?: Transferable[]) {
  ctx.postMessage(msg, transfer ?? []);
}

// ---------------------------------------------------------------- batch role
interface Job {
  jobId: number;
  corridorId: CorridorId;
  preset: DemandPresetId;
  scenario: Scenario;
  seed: number;
  hours: number;
}
const queue: Job[] = [];
let running = false;

async function pump() {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    const job = queue.shift()!;
    try {
      await runJob(job);
    } catch (e) {
      post({ type: 'error', message: `job ${job.jobId}: ${String(e)}` });
    }
  }
  running = false;
}

async function runJob(job: Job) {
  const model = models.get(job.corridorId)!;
  const dem = demand.get(job.corridorId)!;
  const t0 = performance.now();
  const sim = new Simulation(model, job.scenario, dem, job.preset, { seed: job.seed });
  const chunkH = 1;
  for (let h = 0; h < job.hours; h += chunkH) {
    sim.stepHours(chunkH);
    post({ type: 'progress', jobId: job.jobId, fraction: (h + chunkH) / job.hours });
    // yield so cancel/new messages can arrive
    await new Promise((r) => setTimeout(r, 0));
  }
  const aggregates = sim.aggregates();
  post({
    type: 'result',
    jobId: job.jobId,
    corridorId: job.corridorId,
    preset: job.preset,
    scenarioHash: scenarioHash(job.scenario),
    aggregates,
    wallMs: performance.now() - t0,
  });
}

// ----------------------------------------------------------------- live role
let live: {
  sim: Simulation;
  corridorId: CorridorId;
  speed: number;
  paused: boolean;
  timer: ReturnType<typeof setInterval> | null;
  lastStatsAt: number;
} | null = null;

const TICK_MS = 50;
const DT = 0.25;
const MAX_STEPS_PER_TICK = 600;

function stopLive() {
  if (live?.timer) clearInterval(live.timer);
  live = null;
}

function startLive(msg: Extract<WorkerIn, { type: 'focus' }>) {
  stopLive();
  const model = models.get(msg.corridorId)!;
  const dem = demand.get(msg.corridorId)!;
  const sim = new Simulation(model, msg.scenario, dem, msg.preset, {
    seed: msg.seed,
    startHour: msg.startHour,
  });
  // warm up 10 sim-minutes so the road isn't empty on focus
  sim.stepHours(10 / 60);
  live = { sim, corridorId: msg.corridorId, speed: msg.speed, paused: false, timer: null, lastStatsAt: 0 };
  live.timer = setInterval(tickLive, TICK_MS);
}

function tickLive() {
  const L = live;
  if (!L || L.paused) return;
  const steps = Math.min(MAX_STEPS_PER_TICK, Math.max(1, Math.round((L.speed * TICK_MS) / 1000 / DT)));
  for (let i = 0; i < steps; i++) L.sim.step();

  const snap = L.sim.snapshot();
  const n = snap.count;
  // copy into transferable buffers (snapshot reuses engine-internal memory)
  const offsetM = snap.offsetM.slice(0, n);
  const lane = snap.lane.slice(0, n);
  const dir = snap.dir.slice(0, n);
  const speedMs = snap.speedMs.slice(0, n);
  const isTruck = snap.isTruck.slice(0, n);
  post(
    { type: 'frame', corridorId: L.corridorId, timeS: L.sim.timeS, count: n, offsetM, lane, dir, speedMs, isTruck },
    [offsetM.buffer, lane.buffer, dir.buffer, speedMs.buffer, isTruck.buffer],
  );

  if (L.sim.timeS - L.lastStatsAt >= 30) {
    L.lastStatsAt = L.sim.timeS;
    post({ type: 'liveStats', corridorId: L.corridorId, timeS: L.sim.timeS, stats: L.sim.segmentStats() });
  }
}

// ------------------------------------------------------------------ dispatch
ctx.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'init':
      role = msg.role;
      models = new Map(msg.models.map((m) => [m.id, m]));
      demand = new Map(msg.demand.map((d) => [d.corridorId, d]));
      post({ type: 'ready', role });
      break;
    case 'run':
      queue.push(msg);
      void pump();
      break;
    case 'cancelAll':
      queue.length = 0;
      break;
    case 'focus':
      startLive(msg);
      break;
    case 'setSpeed':
      if (live) live.speed = msg.speed;
      break;
    case 'pause':
      if (live) live.paused = true;
      break;
    case 'resume':
      if (live) live.paused = false;
      break;
  }
};
