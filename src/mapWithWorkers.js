
import WorkerPool from './WorkerPool';
import DelegatingSubscriber from './flow/DelegatingSubscriber';

class MapWithWorkersSubscription {
	#pool;
	#subscriber;
	#inputSubscription;

	#demand = 0n;
	#inputError;
	#inputComplete = false;

	#inputQueue = [];
	#dispatching = false;
	#taskQueue = [];
	#collecting = false;

	constructor(input, pool, subscriber) {
		this.#pool = pool;
		this.#subscriber = subscriber;
		input.subscribe(new DelegatingSubscriber({
			onSubscribe: subscription => { this.#inputSubscription = subscription; },
			onNext: value => this.#onNext(value),
			onError: err => this.#onError(err),
			onComplete: () => this.#onComplete()
		}));
	}

	cancel() {
		this.#inputSubscription?.cancel();
		this.#inputSubscription = this.#subscriber = null;
		this.#inputQueue.length = this.#taskQueue.length = 0;
	}

	request(n) {
		if (!this.#inputSubscription) return;
		try {
			if (typeof n == 'number') n = BigInt(n);
			if (n <= 0) throw new RangeError('Non-positive requests are not allowed.');
			this.#demand += n;
			this.#inputSubscription?.request(n);
		} catch (err) {
			this.#signalError(err);
		}
	}

	#onNext(value) {
		this.#inputQueue.push(value);
		this.#dispatch();
	}

	#onError(err) {
		this.#inputSubscription = null;
		if (this.#dispatching || this.#collecting) {
			this.#inputError = err;
		} else {
			this.#signalError(err);
		}
	}

	#onComplete() {
		this.#inputSubscription = null;
		if (this.#dispatching || this.#collecting) {
			this.#inputComplete = true;
		} else {
			this.#signalComplete();
		}
	}

	async #dispatch() {
		if (this.#dispatching) return;
		try {
			this.#dispatching = true;
			while (this.#inputQueue.length) {
				const value = this.#inputQueue.shift();
				const result = this.#dispatchValue(value);
				this.#taskQueue.push(result);
				this.#collect();
			}
		} catch (err) {
			this.#signalError(err);
		} finally {
			this.#dispatching = false;
		}
	}

	async #dispatchValue(value) {
		const worker = await this.#pool.acquireWorker();
		return this.#dispatchTo(worker, value)
			.finally(() => this.#pool.releaseWorker(worker));
	}

	#dispatchTo(worker, value) {
		const result = this.#workerResult(worker);
		worker.postMessage(value);
		return result;
	}

	#workerResult(worker) {
		let messageListener, messageErrorListener, errorListener;
		return (
			Promise.race([
				new Promise(resolve => {
					worker.addEventListener('message', messageListener = evt => { resolve(evt.data); });
				}),
				new Promise((resolve, reject) => {
					worker.addEventListener('messageerror', messageErrorListener = evt => {
						reject(new Error('Worker message error'));
					});
				}),
				new Promise((resolve, reject) => {
					worker.addEventListener('error', errorListener = evt => {
						reject(new Error('Worker error'));
					});
				})			
			]).finally(() => {
				worker.removeEventListener('message', messageListener);
				worker.removeEventListener('messageerror', messageErrorListener);
				worker.removeEventListener('error', errorListener);
			}));
	}

	async #collect() {
		if (this.#collecting) return;
		try {
			this.#collecting = true;
			while (this.#taskQueue.length) {
				const result = await this.#taskQueue.shift();
				this.#demand--;
				this.#subscriber?.onNext(result);
			}
			if (this.#inputError) {
				this.#signalError(this.#inputError);
			} else if (this.#inputComplete) {
				this.#signalComplete();
			}
		} catch (err) {
			this.#signalError(err);
		} finally {
			this.#collecting = false;
		}
	}

	#signalError(err) {
		const subscriber = this.#subscriber;
		this.cancel();
		subscriber?.onError(err);
	}

	#signalComplete() {
		const subscriber = this.#subscriber;
		this.cancel();
		subscriber?.onComplete();
	}
}

class MapWithWorkersPublisher {
	#input;
	#pool;

	constructor(input, pool) {
		if (input === null || !(typeof input == 'object')) throw new TypeError('input is not an object');
		if (!(pool instanceof WorkerPool)) throw new TypeError('pool is not a WorkerPool');
		this.#input = input;
		this.#pool = pool;
	}

	subscribe(subscriber) {
		subscriber ?? (() => { throw new TypeError('subscriber is null.'); })();
		subscriber.onSubscribe(
			new MapWithWorkersSubscription(this.#input, this.#pool, subscriber));
	}
}

const mapWithWorkers = pool =>
	input => new MapWithWorkersPublisher(input, pool);

export default mapWithWorkers;
