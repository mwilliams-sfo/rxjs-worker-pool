import * as rx from 'rxjs';

class WorkerPool {
	#workers;
	#idleWorkers;

	get idleCount() {
		return this.#idleWorkers.pipe(rx.map(it => it.length));
	}

	constructor(count, workerFactory) {
		if (count === 0) throw new RangeError('WorkerPool size must be positive');

		this.#workers = new Array(count);
		for (let i = 0; i < count; i++) {
			this.#workers[i] = workerFactory(i);
		}
		this.#idleWorkers = new rx.BehaviorSubject(this.#workers);
	}

	acquireWorker() {
		return new rx.Observable(subscriber => {
			const loop = () => {
				const idleWorkers = this.#idleWorkers.value;
				if (idleWorkers.length == 0) {
					this.#idleWorkers
						.pipe(rx.filter(it => it.length > 0), rx.first())
						.subscribe(loop);
					return;
				}
				this.#idleWorkers.next(idleWorkers.slice(1));
				rx.of(idleWorkers[0]).subscribe(subscriber);
			};
			loop();
		});
	}

	releaseWorker(worker) {
		if (this.#workers.indexOf(worker) < 0) throw new Error('Worker is not from this pool');
		if (this.#idleWorkers.value.indexOf(worker) >= 0) throw new Error('Worker is already idle');

		this.#idleWorkers.next([...this.#idleWorkers.value, worker]);
	}
}

class PoolProcessor {
	#pool;

	constructor(pool) {
		this.#pool = pool;
	}

	process(input) {
		return input.pipe(
			rx.concatMap(value => rx.zip(rx.of(value), this.#pool.acquireWorker())),
			rx.concatMap(([value, worker]) => this.#dispatchTo(worker, value).pipe(
				rx.finalize(() => this.#pool.releaseWorker(worker)))));
	}

	#dispatchTo(worker, value) {
		return new rx.Observable(subscriber => {
			const result = new rx.BehaviorSubject();
			rx.race(
				rx.fromEvent(worker, 'message').pipe(rx.first(), rx.map(evt => evt.data)),
				rx.fromEvent(worker, 'error').pipe(rx.map(() => { throw new Error('Worker error'); })),
				rx.fromEvent(worker, 'messageerror').pipe(rx.map(() => { throw new Error('Worker message error'); })))
				.subscribe(result);
			worker.postMessage(value);
			result.pipe(rx.skip(1)).subscribe(subscriber);
		});
	}
}

const concurrency = Math.max(1, (navigator.hardwareConcurrency ?? 1) - 1);
document.querySelector('#poolSize').textContent = concurrency.toString();
const pool = new WorkerPool(concurrency, i => new Worker('worker.bundle.js', { name: `Pool worker ${i}` }));
pool.idleCount.subscribe(it => { document.querySelector('#idleCount').textContent = it.toString(); });

const input = rx.generate({
	initialState: 0,
	condition: i => i <= 100,
	iterate: i => i + 1
});
new PoolProcessor(pool).process(input)
	.subscribe(result => { document.querySelector('#result').textContent = result.toString(); });
