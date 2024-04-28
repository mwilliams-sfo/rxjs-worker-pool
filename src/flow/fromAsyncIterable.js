
const iterableAsyncIterator = iterator =>
	iterator[Symbol.asyncIterator] ? iterator :
	{
		[Symbol.asyncIterator]() { return iterator; },
		next() { return iterator.next(); },
		return() { return iterator.return(); }
	};

class AsyncIterableSubscription {
	#iterable;
	#subscriber;

	#cancelled = false;
	#demand = 0n;
	#iterator;
	#iterating = false;

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
			this.#demand += n;
			if (this.#iterating) return;
			this.#iterate();
		} catch (err) {
			this.#signalError(err);
		}
	}

	#iterate() {
		this.#iterating = true;
		(async () => {
			try {
				if (this.#cancelled || this.#demand == 0) return;
				if (!this.iterator) {
					this.#iterator = iterableAsyncIterator(this.#iterable[Symbol.asyncIterator]());
				}
				for await (const value of this.#iterator) {
					this.demand--;
					this.#signalNext(value);
					if (this.#cancelled || this.#demand == 0) return;
				}
				this.#signalComplete();
			} catch (err) {
				this.#signalError(err);
			} finally {
				this.#iterating = false;
			}
		})();
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

class AsyncIterablePublisher {
	#iterable;

	constructor(iterable) {
		this.#iterable = iterable;
	}

	subscribe(subscriber) {
		const subscription = new AsyncIterableSubscription(this.#iterable, subscriber);
		try {
			subscriber.onSubscribe(subscription);
		} catch (err) {
			subscription.cancel();
			throw err;
		}
	}
}

const fromAsyncIterable = iterable => new AsyncIterablePublisher(iterable);

export default fromAsyncIterable;
