
class MapWithWorkersSubscription {
	#pool;
	#subscriber;
	#inputSubscription;

	#cancelled = false;
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
		input.subscribe({
			onSubscribe: subscription => { this.#inputSubscription = subscription; },
			onNext: value => { this.#onNext(value); },
			onError: err => { this.#onError(err); },
			onComplete: () => { this.#onComplete(); }
		});
	}

	cancel() {
		if (this.#cancelled) return;
		this.#cancelled = true;
		this.#inputSubscription?.cancel();
		this.#subscriber = null;
	}

	request(n) {
		if (this.#cancelled) return;
		try {
			if (typeof n == 'number') n = BigInt(n);
			if (n <= 0) throw new RangeError("Non-positive requests are not allowed.");
			this.#demand += n;
			this.#inputSubscription.request(n);
		} catch (err) {
			this.#signalError(err);
		}
	}

	#onNext(value) {
		this.#inputQueue.push(value);
		this.#dispatch();
	}

	#onError(err) {
		if (this.#dispatching || this.#collecting) {
			this.#inputError = err;
		} else {
			this.#signalError(err);
		}
	}

	#onComplete() {
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
				while (!this.#cancelled && this.#inputQueue.length) {
					const worker = await this.#pool.acquireWorker();
					try {
						this.#dispatchTo(worker, this.#inputQueue.shift());
					} catch (err) {
						this.#pool.releaseWorker(worker);
						throw err;
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
						if (this.#cancelled) continue;
						this.#signalNext(result);
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

	#signalNext(value) {
		this.#signal(() => {
			this.#demand--;
			this.#subscriber?.onNext(value);
		});
	}

	#signalError(err) {
		const subscriber = this.#subscriber;
		this.cancel();
		subscriber?.onError(err);
	}

	#signalComplete() {
		this.#signal(() => this.#subscriber.onComplete());
	}

	#signal(block) {
		try {
			block();
		} catch (err) {
			this.cancel();
			throw err;
		}
	}
}

class MapWithWorkersProcessor {
	#input;
	#pool;

	constructor(input, pool) {
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
