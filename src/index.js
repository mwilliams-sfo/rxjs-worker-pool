import fromAsyncIterable from './flow/fromAsyncIterable';
import doOnNext from './flow/doOnNext';
import SimpleSubscriber from './flow/SimpleSubscriber';
import WorkerPool from './WorkerPool';
import mapWithWorkers from './mapWithWorkers';

const poolSize = Math.max(1, (navigator.hardwareConcurrency ?? 1) - 1);
document.querySelector('#poolSize').textContent = poolSize.toString();

const pool = new WorkerPool(poolSize,
	i => new Worker('worker.bundle.js', { name: `Pool worker ${i}` }));

const pipe = (input, ...operators) => {
	let output = input;
	for (const op of operators) {
		output = op(output);
	}
	return output;
};

fromAsyncIterable(pool.idleCount()).subscribe(new SimpleSubscriber({
	onSubscribe(subscription) {
		this._subscription = subscription;
		this._subscription.request(1);
	},
	onNext(value) {
		this._subscription.request(1);
		document.querySelector('#idleCount').textContent = value.toString();
	}
}));

const input = async function*() {
	for (let n = 0; ; n++) {
		yield n;
		if (n == 100) return;
	}
};


pipe(
	fromAsyncIterable(input()),
	doOnNext(value => { document.querySelector('#lastInput').textContent = value.toString(); }),
	mapWithWorkers(pool))
	.subscribe(new SimpleSubscriber({
		onSubscribe(subscription) {
			this._subscription = subscription;
			this._subscription.request(2 * poolSize);
		},
		onNext(value) {
			this._subscription.request(1);
			document.querySelector('#lastOutput').textContent = value.toString();
		}
	}));
