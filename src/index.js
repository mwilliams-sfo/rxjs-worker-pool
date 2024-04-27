import IterablePublisher from './flow/IterablePublisher';
import tap from './flow/tap';
import WorkerPool from './WorkerPool';
import mapWithWorkers from './mapWithWorkers';


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
	mapWithWorkers(pool, poolSize))
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
