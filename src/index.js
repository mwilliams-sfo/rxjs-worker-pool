import * as rx from 'rxjs';
import * as ixAsync from 'ix/asynciterable';
import * as ixAsyncOps from 'ix/asynciterable/operators';

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
						.pipe(rx.first(it => it.length > 0))
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
		return new rx.Observable(subscriber => {
			const {observable, request} = PoolProcessor.#createPullObservable(input);
			this.#process(observable, request).subscribe(subscriber);
		});
	}

	#process(input, request) {
		return new rx.Observable(subscriber => {
			input.pipe(
				rx.concatMap(value => {
					console.log(`Received input: ${value}`);
					return rx.zip(
						rx.of(value),
						this.#pool.acquireWorker().pipe(
							rx.tap(() => {
								console.log(`Acquired worker for input: ${value}`);
								request();
							})));
				}),
				rx.concatMap(([value, worker]) => this.#dispatchTo(worker, value).pipe(
					rx.tap(() => { console.log(`Received result for input: ${value}`); }),
					rx.finalize(() => {
						console.log(`Releasing worker for input: ${value}`);
						this.#pool.releaseWorker(worker);
					}))))
				.subscribe(subscriber);
			request();
		});
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

	static #createPullObservable(input) {
		try {
			input = ixAsync.from(input);
			const subject = new rx.Subject();
			const iterator = input[Symbol.asyncIterator]();
			const request = () => {
				iterator.next().then(next => {
					if (!next.done) subject.next(next.value);
					else subject.complete();
				});
			};
			return {
				observable: subject.pipe(rx.finalize(() => iterator.return())),
				request
			};
		} catch(err) {}
		try {
			return {
				observable: rx.from(input),
				request: rx.noop
			};
		} catch(err) {}
		throw new Error('Argument cannot be converted to a pull Observable');
	}
}

const poolSize = Math.max(1, (navigator.hardwareConcurrency ?? 1) - 1);
document.querySelector('#poolSize').textContent = poolSize.toString();

const pool = new WorkerPool(poolSize, i => new Worker('worker.bundle.js', { name: `Pool worker ${i}` }));
pool.idleCount.subscribe(it => { document.querySelector('#idleCount').textContent = it.toString(); });

const input = function*() {
	for (let i = 0; i <= 100; i++) {
		yield i;
	}
};

new PoolProcessor(pool)
	.process(
		ixAsync.from(input()).pipe(
			ixAsyncOps.tap(value => { document.querySelector('#lastInput').textContent = value.toString(); })))
	.subscribe(result => { document.querySelector('#lastOutput').textContent = result.toString(); });
