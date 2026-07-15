import type {
  CorridorDemand,
  CorridorId,
  CorridorModel,
  DemandPresetId,
  Scenario,
  SegmentLiveStats,
  SimAggregates,
} from '@/types';
import type { WorkerIn, WorkerOut } from './workerProtocol';

export interface Frame {
  corridorId: CorridorId;
  timeS: number;
  count: number;
  offsetM: Float32Array;
  lane: Uint8Array;
  dir: Uint8Array;
  speedMs: Float32Array;
  isTruck: Uint8Array;
}

export class SimWorkers {
  private batch: Worker;
  private live: Worker;
  private jobSeq = 0;
  private pending = new Map<
    number,
    { resolve: (r: { aggregates: SimAggregates; wallMs: number }) => void; onProgress?: (f: number) => void }
  >();
  onFrame: ((f: Frame) => void) | null = null;
  onLiveStats: ((corridorId: CorridorId, timeS: number, stats: SegmentLiveStats[]) => void) | null = null;
  onError: ((msg: string) => void) | null = null;

  constructor(models: CorridorModel[], demand: CorridorDemand[]) {
    this.batch = new Worker(new URL('./worker/simWorker.ts', import.meta.url));
    this.live = new Worker(new URL('./worker/simWorker.ts', import.meta.url));
    for (const [w, role] of [
      [this.batch, 'batch'],
      [this.live, 'live'],
    ] as const) {
      w.onmessage = (ev: MessageEvent<WorkerOut>) => this.handle(ev.data);
      const init: WorkerIn = { type: 'init', role, models, demand };
      w.postMessage(init);
    }
  }

  private handle(msg: WorkerOut) {
    switch (msg.type) {
      case 'result': {
        const p = this.pending.get(msg.jobId);
        if (p) {
          this.pending.delete(msg.jobId);
          p.resolve({ aggregates: msg.aggregates, wallMs: msg.wallMs });
        }
        break;
      }
      case 'progress':
        this.pending.get(msg.jobId)?.onProgress?.(msg.fraction);
        break;
      case 'frame':
        this.onFrame?.(msg);
        break;
      case 'liveStats':
        this.onLiveStats?.(msg.corridorId, msg.timeS, msg.stats);
        break;
      case 'error':
        this.onError?.(msg.message);
        break;
    }
  }

  run(
    corridorId: CorridorId,
    preset: DemandPresetId,
    scenario: Scenario,
    opts?: { onProgress?: (f: number) => void; seed?: number; hours?: number },
  ): Promise<{ aggregates: SimAggregates; wallMs: number }> {
    const jobId = ++this.jobSeq;
    const msg: WorkerIn = {
      type: 'run',
      jobId,
      corridorId,
      preset,
      scenario,
      seed: opts?.seed ?? 42,
      hours: opts?.hours ?? 24,
    };
    return new Promise((resolve) => {
      this.pending.set(jobId, { resolve, onProgress: opts?.onProgress });
      this.batch.postMessage(msg);
    });
  }

  focus(corridorId: CorridorId, preset: DemandPresetId, scenario: Scenario, startHour: number, speed: number) {
    this.live.postMessage({
      type: 'focus',
      corridorId,
      preset,
      scenario,
      seed: 7,
      startHour,
      speed,
    } satisfies WorkerIn);
  }

  setSpeed(speed: number) {
    this.live.postMessage({ type: 'setSpeed', speed } satisfies WorkerIn);
  }
  pause() {
    this.live.postMessage({ type: 'pause' } satisfies WorkerIn);
  }
  resume() {
    this.live.postMessage({ type: 'resume' } satisfies WorkerIn);
  }

  dispose() {
    this.batch.terminate();
    this.live.terminate();
  }
}
