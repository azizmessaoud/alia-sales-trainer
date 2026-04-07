import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import crypto from 'node:crypto';
import path from 'node:path';

export interface PythonWorkerOptions {
  cwd?: string;
  pythonBin?: string;
  restartDelayMs?: number;
  defaultTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
};

export class PythonWorker {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: Interface | null = null;
  private pending = new Map<string, PendingResolver>();
  private readonly scriptPath: string;
  private readonly cwd: string;
  private readonly pythonBin: string;
  private readonly restartDelayMs: number;
  private readonly defaultTimeoutMs: number;
  private readonly env: NodeJS.ProcessEnv;
  private disposed = false;

  constructor(scriptPath: string, options: PythonWorkerOptions = {}) {
    this.scriptPath = path.resolve(scriptPath);
    this.cwd = options.cwd ?? process.cwd();
    this.pythonBin = options.pythonBin ?? process.env.PYTHON_BIN ?? 'python';
    this.restartDelayMs = options.restartDelayMs ?? 1000;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
    this.env = { ...process.env, ...options.env };
    this.spawnWorker();
  }

  private spawnWorker(): void {
    if (this.disposed) return;

    this.proc = spawn(this.pythonBin, [this.scriptPath], {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.env,
    });

    this.rl = createInterface({ input: this.proc.stdout });

    this.rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line) as { _id?: string };
        if (!msg._id) return;

        const pending = this.pending.get(msg._id);
        if (!pending) return;

        this.pending.delete(msg._id);
        clearTimeout(pending.timer);
        pending.resolve(msg);
      } catch {
        // Ignore non-JSON lines from worker logs.
      }
    });

    this.proc.stderr.on('data', (chunk) => {
      process.stderr.write(`[PythonWorker ${path.basename(this.scriptPath)}] ${chunk.toString()}`);
    });

    this.proc.on('exit', (code) => {
      if (this.disposed) return;

      for (const [id, pending] of this.pending.entries()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Worker exited before responding: ${id}`));
      }
      this.pending.clear();

      console.error(
        `[PythonWorker ${path.basename(this.scriptPath)}] crashed with code ${code}, restarting...`
      );

      this.rl?.close();
      this.rl = null;
      this.proc = null;

      setTimeout(() => this.spawnWorker(), this.restartDelayMs);
    });
  }

  async call<T = unknown>(payload: object, timeoutMs = this.defaultTimeoutMs): Promise<T> {
    if (!this.proc?.stdin || !this.proc.stdout.readable) {
      throw new Error(`Worker is not running: ${this.scriptPath}`);
    }

    const id = crypto.randomUUID();

    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Worker timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });

      const packet = JSON.stringify({ _id: id, ...payload }) + '\n';
      this.proc!.stdin.write(packet, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  dispose(): void {
    this.disposed = true;

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('PythonWorker disposed'));
    }
    this.pending.clear();

    this.rl?.close();
    this.rl = null;

    if (this.proc && !this.proc.killed) {
      this.proc.kill();
    }
    this.proc = null;
  }
}
