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
	race,
	repeat,
	skip,
	zip
} from 'rxjs';

class WorkerPool {
	#allWorkers;
	#availableWorkers;

	get idleWorkers() {
		return this.#availableWorkers.pipe(map(it => it.length));
	}

	constructor(count, workerFactory) {
		this.#allWorkers = new Array(count);
		for (let i = 0; i < count; i++) {
			this.#allWorkers[i] = workerFactory(i);
		}
		this.#availableWorkers = new BehaviorSubject(this.#allWorkers);
	}

	acquireWorker() {
		return new Observable(subscriber => {
			const loop = () => {
				const available = this.#availableWorkers.value;
				if (available.length == 0) {
					this.#availableWorkers
						.pipe(filter(it => it.length > 0), first())
						.subscribe(loop);
					return;
				}
				const worker = available[0];
				this.#availableWorkers.next(available.slice(1));
				subscriber.next(worker);
				subscriber.complete();
			};
			loop();
		});
	}

	releaseWorker(worker) {
		if (this.#allWorkers.indexOf(worker) < 0) throw new Error('Worker is not in this pool');
		if (this.#availableWorkers.value.indexOf(worker) >= 0) throw new Error('Worker is already available');

		this.#availableWorkers.next([...this.#availableWorkers.value, worker]);
	}
}

class PoolProcessor {
	#pool;

	constructor(pool) {
		this.#pool = pool;
	}

	process(input) {
		const workers = this.#pool.acquireWorker().pipe(repeat());
		return zip(input, workers).pipe(
			concatMap(([value, worker]) => this.#dispatch(value, worker)
				.pipe(finalize(() => this.#pool.releaseWorker(worker)))));
	}

	#dispatch(value, worker) {
		const result = new BehaviorSubject();
		race(
			fromEvent(worker, 'message').pipe(map(evt => evt.data), first()),
			fromEvent(worker, 'error').pipe(map(() => { throw new Error('Worker error'); })),
			fromEvent(worker, 'messageerror').pipe(map(() => { throw new Error('Worker message error'); })))
			.subscribe(result);
		worker.postMessage(value);
		return result.pipe(skip(1));
	}
}

const pool = new WorkerPool(8, i => new Worker('worker.bundle.js', { name: `Pool worker ${i}` }));
pool.idleWorkers.subscribe(it => { document.querySelector('#idleWorkers').textContent = it.toString(); });

const input = generate({
	initialState: 0,
	condition: i => i <= 100,
	iterate: i => i + 1
});
new PoolProcessor(pool).process(input)
	.subscribe(result => { document.querySelector('#result').textContent = result.toString(); });
