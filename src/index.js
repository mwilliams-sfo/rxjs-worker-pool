import {
	BehaviorSubject,
	Observable,
	concatMap,
	finalize,
	filter,
	first,
	fromEvent,
	generate,
	map,
	of,
	race,
	repeat,
	skip,
	zip
} from 'rxjs';

class WorkerPool {
	#workers;
	#idleWorkers;

	get idleCount() {
		return this.#idleWorkers.pipe(map(it => it.length));
	}

	constructor(count, workerFactory) {
		if (count === 0) throw new RangeError('WorkerPool size must be positive');

		this.#workers = new Array(count);
		for (let i = 0; i < count; i++) {
			this.#workers[i] = workerFactory(i);
		}
		this.#idleWorkers = new BehaviorSubject(this.#workers);
	}

	acquireWorker() {
		return new Observable(subscriber => {
			const loop = () => {
				const idleWorkers = this.#idleWorkers.value;
				if (idleWorkers.length == 0) {
					this.#idleWorkers
						.pipe(filter(it => it.length > 0), first())
						.subscribe(loop);
					return;
				}
				this.#idleWorkers.next(idleWorkers.slice(1));
				of(idleWorkers[0]).subscribe(subscriber);
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
			concatMap(value => zip(of(value), this.#pool.acquireWorker())),
			concatMap(([value, worker]) => this.#dispatchTo(worker, value).pipe(
				finalize(() => this.#pool.releaseWorker(worker)))));
	}

	#dispatchTo(worker, value) {
		return new Observable(subscriber => {
			const result = new BehaviorSubject();
			race(
				fromEvent(worker, 'message').pipe(map(evt => evt.data), first()),
				fromEvent(worker, 'error').pipe(map(() => { throw new Error('Worker error'); })),
				fromEvent(worker, 'messageerror').pipe(map(() => { throw new Error('Worker message error'); })))
				.subscribe(result);
			worker.postMessage(value);
			result.pipe(skip(1)).subscribe(subscriber);
		});
	}
}

const pool = new WorkerPool(8, i => new Worker('worker.bundle.js', { name: `Pool worker ${i}` }));
pool.idleCount.subscribe(it => { document.querySelector('#idleCount').textContent = it.toString(); });

const input = generate({
	initialState: 0,
	condition: i => i <= 100,
	iterate: i => i + 1
});
new PoolProcessor(pool).process(input)
	.subscribe(result => { document.querySelector('#result').textContent = result.toString(); });
