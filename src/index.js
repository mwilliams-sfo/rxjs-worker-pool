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
	throwError,
	zip,
} from 'rxjs';


class WorkerPool {
	#workers;
	#_idleWorkers = new BehaviorSubject(0);
	get idleWorkers() {
		return this.#_idleWorkers;
	}

	constructor(count, workerFactory) {
		this.#workers = new Array(count);
		for (let i = 0; i < count; i++) {
			this.#workers[i] = workerFactory(i);
		}
	}

	process(obs) {
		const pool = [...this.#workers];
		const workerAvailable = new BehaviorSubject(pool.length > 0);
		const workerSupply = new Observable(subscriber => {
			(function loop() {
				while (pool.length) {
					subscriber.next(pool.shift());
				}
				this.idleWorkers.next(pool.length);
				workerAvailable.next(false);
				workerAvailable.pipe(filter(it => it), first()).subscribe(loop.bind(this));
			}.bind(this))();
		});
		const releaseWorker = worker => {
			pool.push(worker);
			workerAvailable.next(true);
			this.idleWorkers.next(pool.length);
		}

		return new Observable(subscriber => {
			zip(obs, workerSupply)
				.pipe(
					map(([val, worker]) => new Observable(subscriber => {
						const result = race(
							fromEvent(worker, 'message', {}, evt => evt.data).pipe(first()),
						 	fromEvent(worker, 'error').pipe(map(() => throwError(() => new Error("Worker error")))),
						 	fromEvent(worker, 'messageerror').pipe(map(() => throwError(() => new Error("Worker message error")))));
						result
							.pipe(finalize(() => { releaseWorker(worker); }))
							.subscribe(subscriber);
						worker.postMessage(val);
					})),
					concatMap(it => it))
				.subscribe(subscriber);
		});
	}
}

const pool = new WorkerPool(8, i => new Worker('worker.js', { name: `Pool worker ${i}` }));
pool.idleWorkers.subscribe(it => { document.querySelector('#idleWorkers').textContent = it.toString(); });

const input = generate(0, i => i <= 100, i => i + 1, i => i);
pool.process(input).subscribe(result => { document.querySelector('#result').textContent = result.toString(); });
