import fromAsyncIterable from './flow/fromAsyncIterable';
import doOnNext from './flow/doOnNext';
import WorkerPool from './WorkerPool';
import mapWithWorkers from './mapWithWorkers';
import SimpleSubscriber from './flow/SimpleSubscriber';

const poolSize = Math.max(1, (navigator.hardwareConcurrency ?? 1) - 1);
document.querySelector('#poolSize').textContent = poolSize.toString();

const pool = new WorkerPool(poolSize,
	i => new Worker('worker.bundle.js', { name: `Pool worker ${i}` }));
pool.idleCount.subscribe(count => {
	document.querySelector('#idleCount').textContent = count.toString();
});

const input = async function*() {
	for (let n = 0; ; n++) {
		yield n;
		if (n == 100) return;
	}
};

const pipe = (input, ...operators) => {
	let output = input;
	for (const op of operators) {
		output = op(output);
	}
	return output;
};

pipe(
	fromAsyncIterable(input()),
	doOnNext(value => { document.querySelector('#lastInput').textContent = value.toString(); }),
	mapWithWorkers(pool))
	.subscribe(new SimpleSubscriber({
		onSubscribe(subscription) {
			this._subscription = subscription;
			this._subscription.request(poolSize);
		},
		onNext(value) {
			this._subscription.request(1);
			document.querySelector('#lastOutput').textContent = value.toString();
		}
	}));
