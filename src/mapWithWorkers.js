
class PoolProcessorSubscription {
	#input;
	#pool;
	#subscriber;

	#inputSubscription;
	#inputComplete = false;
	#terminated = false;
	#inputQueue = [];

	constructor(input, pool, subscriber) {
		this.#input = input;
		this.#pool = pool;
		this.#subscriber = subscriber;
	}

	cancel() {
		if (this.#terminated) return;
		this.#terminated = true;
		this.#inputSubscription.cancel();
		this.#inputQueue.length = 0;
	}

	request(n) {
		if (this.#terminated) return;
		this.#ensureInputSubscription().then(() => {
			if (this.#terminated) {
				this.#inputSubscription.cancel();
			} else {
				this.#inputSubscription.request(n);
			}
		});
	}

	#ensureInputSubscription() {
		return new Promise(resolve => {
			if (this.#inputSubscription) return resolve();
			this.#input.subscribe({
				onSubscribe: subscription => {
					this.#inputSubscription = subscription;
					resolve();
					if (this.#terminated) {
						this.#inputSubscription.cancel();
					} else {
						this.#inputSubscription.request(n);
					}
				},
				onNext: value => { this.#onNext(value);	},
				onError: error => { this.#onError(value); },
				onComplete: () => { this.#onComplete(); }
			});
		});
	}

	#onNext(value) {
		if (this.#terminated) return;
		this.#inputQueue.push(value);
		if (this.#inputQueue.length > 1) return;
		(async () => {
			try {
				while (this.#inputQueue.length > 0) {
					const worker = await this.#pool.acquireWorker();
					try {
						const value = this.#inputQueue.shift();
						const result = await this.#dispatchTo(worker, value);
						this.#subscriber.onNext?.(value);
					} finally {
						this.#pool.releaseWorker(worker);
					}
				}
				if (!this.#terminated && this.#inputComplete) {
					this.#terminated = true;
					this.#subscriber.onComplete?.();
				}
			} catch (err) {
				this.#terminated = true;
				this.#subscriber.onError?.(err);
			}
		})();
	}

	#onError(err) {
		if (this.#terminated) return;
		this.#terminated = true;
		this.#subscriber.onError?.(err);
	}

	#onComplete() {
		if (this.#terminated) return;
		this.#inputComplete = true;
		if (this.#inputQueue.length == 0) {
			this.#terminated = true;
			this.#subscriber.onComplete?.();
		}
	}

	#dispatchTo(worker, value) {
		return new Promise((resolve, reject) => {
			let messageListener, messageErrorListener, errorListener;
			const cleanup = () => {
				worker.removeEventListener('message', messageListener);
				worker.removeEventListener('messageerror', messageErrorListener);
				worker.removeEventListener('error', errorListener);
			};
			worker.addEventListener('message', messageListener = evt => {
				resolve(evt.data);
				cleanup();
			});
			worker.addEventListener('messageerror', messageErrorListener = evt => {
				reject(new Error('Worker message error'));
				cleanup();
			});
			worker.addEventListener('error', errorListener = evt => {
				reject(new Error('Worker error'));
				cleanup();
			});
			worker.postMessage(value);
		});
	}
}

class PoolProcessor {
	#input;
	#pool;

	constructor(input, pool) {
		this.#input = input;
		this.#pool = pool;
	}

	subscribe(subscriber) {
		const subscription = new PoolProcessorSubscription(this.#input, this.#pool, subscriber);
		subscriber.onSubscribe(subscription);
	}
}

const mapWithWorkers = pool =>
	input => {
		const processor = new PoolProcessor(input, pool);
		return {
			subscribe(subscriber) {
				processor.subscribe(subscriber);
			}
		};
	};

export default mapWithWorkers;
