
import * as rx from 'rxjs';

export default class WorkerPool {
	#workers;
	#idleWorkers;

	get idleCount() {
		return this.#idleWorkers.pipe(rx.map(it => it.length));
	}

	constructor(count, workerFactory) {
		if (count <= 0) throw new RangeError('WorkerPool size must be positive');

		this.#workers = new Array(count);
		for (let i = 0; i < count; i++) {
			this.#workers[i] = workerFactory(i);
		}
		this.#idleWorkers = new rx.BehaviorSubject(this.#workers);
	}

	acquireWorker() {
		return (async () => {
			let idleWorkers;
			while (true) {
				idleWorkers = this.#idleWorkers.value;
				if (idleWorkers.length) break;
				await rx.firstValueFrom(
					this.#idleWorkers.pipe(rx.first(it => it.length > 0)));
			}
			this.#idleWorkers.next(idleWorkers.slice(1));
			return idleWorkers[0];
		})();
	}

	releaseWorker(worker) {
		if (this.#workers.indexOf(worker) < 0) throw new Error('Worker is not from this pool');
		if (this.#idleWorkers.value.indexOf(worker) >= 0) throw new Error('Worker is already idle');

		this.#idleWorkers.next([...this.#idleWorkers.value, worker]);
	}
}
