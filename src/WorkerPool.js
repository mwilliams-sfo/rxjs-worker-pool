
export default class WorkerPool {
	#workers;
	#idleWorkers;

	#acquireQueue = [];
	#idleCountCallbacks = [];
	#shutdownCallback;

	constructor(count, workerFactory) {
		if (count <= 0) throw new RangeError('WorkerPool size must be positive');

		this.#workers = new Array(count);
		for (let i = 0; i < count; i++) {
			this.#workers[i] = workerFactory(i);
		}
		this.#idleWorkers = [...this.#workers];
	}

	async acquireWorker() {
		if (this.#shutdownCallback) throw new Error('WorkerPool is shutting down');
		if (this.#idleWorkers.length) {
			try {
				return this.#idleWorkers.shift();
			} finally {
				this.#notifyIdleCount();
			}
		} else {
			return new Promise((resolve, reject) => this.#acquireQueue.push({resolve, reject}));
		}
	}

	releaseWorker(worker) {
		if (this.#workers.indexOf(worker) < 0) throw new Error('Worker is not from this pool');
		if (this.#idleWorkers.indexOf(worker) >= 0) throw new Error('Worker is already idle');
		if (this.#shutdownCallback) {
			worker.terminate();
			this.#idleWorkers.push(worker);
			this.#notifyIdleCount();
			if (this.#idleWorkers.length == this.#workers.length) {
				this.#shutdownCallback();
			}
		} else if (this.#idleWorkers == 0 && this.#acquireQueue.length) {
			const resolvers = this.#acquireQueue.shift();
			resolvers.resolve(worker);
		} else {
			this.#idleWorkers.push(worker);
			this.#notifyIdleCount();
		}
	}

	shutdown() {
		if (this.#shutdownCallback) throw new Error('shutdown method has already been called.');
		return new Promise(resolve => {
			this.#shutdownCallback = resolve;
			while (this.#acquireQueue.length) {
				const resolvers = this.#acquireQueue.shift();
				resolvers.reject(new Error('WorkerPool is shutting down'));
			}
			for (const worker of this.#idleWorkers) {
				worker.terminate();
			}
			if (this.#idleWorkers.length == this.#workers.length) {
				this.#shutdownCallback();
			}
		});
	}

	async *idleCount() {
		let yielded = false, resolveNext;
		const callback = () => {
			yielded = false;
			if (resolveNext) {
				resolveNext(this.#idleWorkers.length);
				yielded = true;
				resolveNext = null;
			}
		};
		try {
			this.#idleCountCallbacks.push(callback);
			while (true) {
				if (!yielded) {
					yield this.#idleWorkers.length;
					yielded = true;
				} else {
					yield new Promise(resolve => { resolveNext = resolve; });
				}
			}
		} finally {
			const index = this.#idleCountCallbacks.indexOf(callback);
			this.#idleCountCallbacks.splice(index, 1);
		}
	}

	#notifyIdleCount() {
		for (const callback of this.#idleCountCallbacks) {
			queueMicrotask(callback);
		}
	}
}
