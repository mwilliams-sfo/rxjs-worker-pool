
export default class WorkerPool {
	#workers;
	#idleWorkers;
	#acquireQueue = [];

	#eventTarget;

	constructor(count, workerFactory) {
		if (count <= 0) throw new RangeError('WorkerPool size must be positive');

		this.#workers = new Array(count);
		for (let i = 0; i < count; i++) {
			this.#workers[i] = workerFactory(i);
		}
		this.#idleWorkers = [...this.#workers];
		this.#eventTarget = document.createDocumentFragment();
	}

	async acquireWorker() {
		if (this.#idleWorkers.length) {
			try {
				return this.#idleWorkers.shift();
			} finally {
				this.#notifyEvent('idlecountchange');
			}
		} else {
			return new Promise(resolve => this.#acquireQueue.push(resolve));
		}
	}

	releaseWorker(worker) {
		if (this.#workers.indexOf(worker) < 0) throw new Error('Worker is not from this pool');
		if (this.#idleWorkers.indexOf(worker) >= 0) throw new Error('Worker is already idle');

		if (this.#idleWorkers == 0 && this.#acquireQueue.length) {
			this.#acquireQueue.shift()(worker);
		} else {
			this.#idleWorkers.push(worker);
			this.#notifyEvent('idlecountchange');
		}
	}

	async *idleCount() {
		let yielded = false, resolveNext;
		const listener = () => {
			yielded = false;
			if (resolveNext) {
				resolveNext(this.#idleWorkers.length);
				yielded = true;
				resolveNext = null;
			}
		};
		try {
			this.#eventTarget.addEventListener('idlecountchange', listener);
			while (true) {
				if (!yielded) {
					yield this.#idleWorkers.length;
					yielded = true;
				} else {
					yield new Promise(resolve => { resolveNext = resolve; });
				}
			}
		} finally {
			this.#eventTarget.removeEventListener('idlecountchange', listener);
		}
	}

	#notifyEvent(type) {
		setTimeout(() => this.#eventTarget.dispatchEvent(new CustomEvent(type)), 0);
	}
}
