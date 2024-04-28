import fromAsyncIterable from './flow/fromAsyncIterable';
import tap from './flow/tap';
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
	tap({
		onNext(value) {
			document.querySelector('#lastInput').textContent = value.toString();
		}
	}),
	mapWithWorkers(pool, poolSize))
	.subscribe(new SimpleSubscriber(value => {
		document.querySelector('#lastOutput').textContent = value.toString();
	}));
