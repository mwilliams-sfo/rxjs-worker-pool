import * as rx from 'rxjs';
import IterablePublisher from './flow/IterablePublisher';
import tap from './flow/tap';
import mapWithWorkers from './mapWithWorkers';

class WorkerPool {
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

const poolSize = Math.max(1, (navigator.hardwareConcurrency ?? 1) - 1);
document.querySelector('#poolSize').textContent = poolSize.toString();

const pool = new WorkerPool(poolSize,
	i => new Worker('worker.bundle.js', { name: `Pool worker ${i}` }));
pool.idleCount.subscribe(count => {
	document.querySelector('#idleCount').textContent = count.toString();
});

const input = function*() {
	for (let n = 0; ; n++) {
		document.querySelector('#lastInput').textContent = n.toString();
		yield n;
		if (n == 100) return;
	}
};
const inputPublisher = new IterablePublisher(input());

const pipe = (input, ...operators) => {
	let output = input;
	for (const op of operators) {
		output = op(output);
	}
	return output;
};

pipe(inputPublisher,
	tap({
		onNext(value) {
			document.querySelector('#lastInput').textContent = value.toString();
		}
	}),
	mapWithWorkers(pool))
	.subscribe({
		_subscription: void 0,
		onSubscribe(subscription) {
			this._subscription = subscription;
			this._subscription.request(1);
		},
		onNext(value) {
			document.querySelector('#lastOutput').textContent = value.toString();
			this._subscription.request(1);
		}
	});		
