
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
		this.#inputSubscription = null;
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

	#dispatch() {
		if (this.#dispatching) return;
		this.#dispatching = true;
		(async () => {
			try {
				while (this.#inputQueue.length) {
					const worker = await this.#pool.acquireWorker();
					try {
						const value = this.#inputQueue.shift();
						this.#dispatchTo(worker, value);
					} catch (err) {
						this.#pool.releaseWorker(worker);
					}
				}
			} catch (err) {
				this.#signalError(err);
			} finally {
				this.#inputQueue.length = 0;
				this.#dispatching = false;
			}
		})();
	}

	#dispatchTo(worker, value) {
		let messageListener, messageErrorListener, errorListener;
		const result =
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
			});
		worker.postMessage(value);
		this.#taskQueue.push({worker, result});
		this.#collect();
	}

	#collect() {
		if (this.#collecting) return;
		this.#collecting = true;
		(async () => {
			try {
				while (this.#taskQueue.length) {
					const task = this.#taskQueue.shift();
					try {
						const result = await task.result;
						this.#demand--;
						this.#subscriber?.onNext(result);
					} catch (err) {
						this.#signalError(err);
					} finally {
						this.#pool.releaseWorker(task.worker);
					}
				}
				if (this.#inputError) {
					this.#signalError(this.#inputError);
				} else if (this.#inputComplete) {
					this.#signalComplete();
				}
			} finally {
				this.#collecting = false;
			}
		})();
	}

	#signalError(err) {
		this.cancel();
		this.#subscriber?.onError(err);
		this.subscriber = null;
	}

	#signalComplete() {
		this.cancel();
		this.#subscriber?.onComplete();
		this.subscriber = null;
	}
}

class MapWithWorkersProcessor {
	#input;
	#pool;

	constructor(input, pool) {
		if (!(input instanceof Object)) throw new TypeError('input is not an object');
		if (!(pool instanceof WorkerPool)) throw new TypeError('pool is not a WorkerPool');
		this.#input = input;
		this.#pool = pool;
	}

	subscribe(subscriber) {
		const subscription = new MapWithWorkersSubscription(this.#input, this.#pool, subscriber);
		subscriber.onSubscribe(subscription);
	}
}

const mapWithWorkers = (pool) => {
	return input => {
		const processor = new MapWithWorkersProcessor(input, pool);
		return {
			subscribe(subscriber) {
				processor.subscribe(subscriber);
			}
		};
	};
}

export default mapWithWorkers;
