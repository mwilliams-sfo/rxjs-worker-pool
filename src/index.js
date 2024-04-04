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
	zip
} from 'rxjs';


class WorkerPool {
	#available;

	get idleWorkers() {
		return this.#available.pipe(map(it => it.length));
	}

	constructor(count, workerFactory) {
		const workers = new Array(count);
		for (let i = 0; i < count; i++) {
			workers[i] = workerFactory(i);
		}
		this.#available = new BehaviorSubject(workers);
	}

	#acquireWorker() {
		return new Observable(subscriber => {
			(function loop() {
				if (this.#available.value.length == 0) {
					this.#available
						.pipe(filter(it => it.length > 0), first())
						.subscribe(loop.bind(this));
					return;
				}
				const worker = this.#available.value[0];
				this.#available.next(this.#available.value.slice(1));
				subscriber.next(worker);
				subscriber.complete();
			}.bind(this))();
		});
	}

	#releaseWorker(worker) {
		this.#available.next([...this.#available.value, worker]);
	}

	#dispatch(value, worker) {
		const result = new BehaviorSubject();
		race(
			fromEvent(worker, 'message').pipe(map(evt => evt.data), first()),
			fromEvent(worker, 'error').pipe(map(() => { throw new Error('Worker error'); })),
			fromEvent(worker, 'messageerror').pipe(map(() => { throw new Error('Worker error'); })))
			.subscribe(result);
		worker.postMessage(value);
		return result.pipe(filter(it => typeof it !== 'undefined'));
	}

	process() {
		const workers = this.#acquireWorker().pipe(repeat());
		return input => zip(input, workers).pipe(
			concatMap(([value, worker]) => {
				return this.#dispatch(value, worker)
					.pipe(finalize(() => this.#releaseWorker(worker)));
			}));
	}
}

const pool = new WorkerPool(8, i => new Worker('worker.js', { name: `Pool worker ${i}` }));
pool.idleWorkers.subscribe(it => { document.querySelector('#idleWorkers').textContent = it.toString(); });

const input = generate({
	initialState: 0,
	condition: i => i <= 100,
	iterate: i => i + 1
});
input.pipe(pool.process())
	.subscribe(result => { document.querySelector('#result').textContent = result.toString(); });
