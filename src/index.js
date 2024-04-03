import { 
	BehaviorSubject,
	Observable,
	Subject,
    concatMap,
    finalize,
	first,
	fromEvent,
	generate,
	map,
	race,
	tap
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
		const workerAvailable = new Subject();
		const nextWorker = new Observable(subscriber => {
			(function loop() {
				if (pool.length == 0) {
					workerAvailable.pipe(first()).subscribe(loop);
				}
				subscriber.next(pool.shift());
				subscriber.complete();
				this.idleWorkers.next(pool.length);
			})();
		});

		return obs.pipe(
			concatMap(val => {
				return new Observable(subscriber => {
					nextWorker.subscribe(worker => {
						const result = race(
							fromEvent(worker, 'message').pipe(first(), map(it => it.data)),
							fromEvent(worker, 'error').pipe(first(), map(() => { throw new Error("Worker error"); })),
							fromEvent(worker, 'messageerror').pipe(first(), map(() => { throw new Error("Worker message error"); })));
						worker.postMessage(val);
						result
							.pipe(
								tap(val => { console.log('Output:', val); }),
								finalize(() => {
									pool.push(worker);
									workerAvailable.next();
									this.idleWorkers.next(pool.length);
								})
							)
							.subscribe({
								next: val => subscriber.next(val),
								error: err => subscriber.error(err),
								complete: () => subscriber.complete()
							});
					});
			})
		}));
	}
}

const pool = new WorkerPool(8, i => new Worker('worker.js', { name: `Pool worker ${i}` }));
pool.idleWorkers.subscribe(it => { document.querySelector('#idleWorkers').textContent = it.toString(); });

const input = generate(0, i => i < 10000, i => i + 1, i => i);
pool.process(input).subscribe(result => { document.querySelector('#result').textContent = result.toString(); });
