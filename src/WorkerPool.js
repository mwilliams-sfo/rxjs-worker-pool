
export default class WorkerPool {
	#workers;
	#idleWorkers;

	#acquireQueue = [];
	#idleCountCallbacks = [];
	#resolveShutdown;

	constructor(count, workerFactory) {
		if (count <= 0) throw new RangeError('WorkerPool size must be positive');

		this.#workers = new Array(count);
		for (let i = 0; i < count; i++) {
			this.#workers[i] = workerFactory(i);
		}
		this.#idleWorkers = [...this.#workers];
	}

	async acquireWorker() {
		if (this.#resolveShutdown) throw new Error('WorkerPool is shutting down');
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
		if (this.#resolveShutdown) {
			worker.terminate();
		}
		this.#idleWorkers.push(worker);
		this.#notifyIdleCount();
		if (!this.#resolveShutdown) {
			while (this.#idleWorkers.length && this.#acquireQueue.length) {
				const resolvers = this.#acquireQueue.shift();
				resolvers.resolve(this.#idleWorkers.shift());
				this.#notifyIdleCount();
			}
		} else if (this.#idleWorkers.length == this.#workers.length) {
			this.#resolveShutdown();
		}
	}

	shutdown() {
		if (this.#resolveShutdown) throw new Error('Already shutting down.');
		return new Promise(resolve => {
			this.#resolveShutdown = resolve;
			while (this.#acquireQueue.length) {
				const resolvers = this.#acquireQueue.shift();
				resolvers.reject(new Error('WorkerPool is shutting down'));
			}
			for (const worker of this.#idleWorkers) {
				worker.terminate();
			}
			if (this.#idleWorkers.length == this.#workers.length) {
				this.#resolveShutdown();
			}
		});
	}

	async *idleCount() {
		let newValue = true, resolveNext;
		const callback = () => {
			newValue = true;
			if (resolveNext) {
				resolveNext(this.#idleWorkers.length);
				newValue = false;
				resolveNext = null;
			}
		};
		try {
			this.#idleCountCallbacks.push(callback);
			while (true) {
				if (newValue) {
					yield this.#idleWorkers.length;
					newValue = false;
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
		this.#idleCountCallbacks.forEach(queueMicrotask);
	}
}
