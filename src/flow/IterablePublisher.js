
const iterableIterator = iterator =>
	iterator[Symbol.iterator] ? iterator :
	{
		[Symbol.iterator]() { return iterator; },
		next() { return iterator.next(); },
		return() { return iterator.return(); }
	};

class IterableSubscription {
	#iterable;
	#subscriber;

	#cancelled = false;
	#demand = 0n;
	#iterator;

	constructor(iterable, subscriber) {
		this.#iterable = iterable;
		this.#subscriber = subscriber;
	}

	cancel() {
		if (this.#cancelled) return;
		this.#cancelled = true;
		this.#subscriber = null;
		try {
			this.#iterator?.return?.();
		} catch (err) {}
	}

	request(n) {
		if (this.#cancelled) return;
		try {
			if (typeof n == 'number') {
				n = BigInt(n);
			}
			if (n <= 0n) throw new RangeError('Non-positive request is not allowed');
			const shouldFulfill = this.#demand == 0n;
			this.#demand += n;
			if (shouldFulfill) {
				this.#fulfillDemand();
			}
		} catch (err) {
			this.#signalError(err);
		}
	}

	async #fulfillDemand() {
		try {
			if (this.#cancelled || this.#demand == 0) return;
			if (!this.iterator) {
				this.#iterator = iterableIterator(this.#iterable[Symbol.iterator]());
			}
			for (const value of this.#iterator) {
				try {
					this.#signalNext(value);
				} finally {
					this.demand--;
				}
				if (this.#cancelled || this.#demand == 0) return;
			}
			this.#signalComplete();
		} catch (err) {
			this.#signalError(err);
		}
	}

	#signalNext(value) {
		this.#signal(() => this.#subscriber.onNext(value));
	}

	#signalError(err) {
		const subscriber = this.#subscriber;
		this.cancel();
		this.#signal(() => subscriber.onError(err));
	}

	#signalComplete(err) {
		const subscriber = this.#subscriber;
		this.cancel();
		this.#signal(() => subscriber.onComplete());
	}

	#signal(block) {
		try {
			block();
		} catch (err) {
			this.cancel()
			throw err;
		}
	}
}

export default class IterablePublisher {
	#iterable;

	constructor(iterable) {
		this.#iterable = iterable;
	}

	subscribe(subscriber) {
		const subscription = new IterableSubscription(this.#iterable, subscriber);
		try {
			subscriber.onSubscribe(subscription);
		} catch (err) {
			subscription.cancel();
			throw err;
		}
	}
}
