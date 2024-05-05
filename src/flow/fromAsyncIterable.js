
class AsyncIterableSubscription {
	#iterable;
	#subscriber;

	#demand = 0n;
	#iterator;
	#iterating = false;

	constructor(iterable, subscriber) {
		this.#iterable = iterable;
		this.#subscriber = subscriber;
	}

	cancel() {
		this.#iterator?.return?.();
		this.#iterable = this.#iterator = this.#subscriber = null;
	}

	request(n) {
		if (!this.#iterable) return;
		try {
			if (typeof n == 'number') n = BigInt(n);
			if (n <= 0) throw new RangeError('Non-positive request is not allowed.');
			this.#demand += n;
			this.#iterate();
		} catch (err) {
			this.#signalError(err);
		}
	}

	async #iterate() {
		if (!this.#iterable || this.#iterating) return;
		this.#iterating = true;
		try {
			this.#iterator ??= this.#iterable[Symbol.asyncIterator]();
			while (true) {
				const next = await this.#iterator.next();
				if (next.done) break;
				this.#demand--;
				this.#signalNext(next.value);
				if (!this.#iterable || this.#demand == 0) return;
			}
			this.#signalComplete();
		} catch (err) {
			this.#signalError(err);
		} finally {
			this.#iterating = false;
		}
	}

	#signalNext(value) {
		this.#subscriber?.onNext(value);
	}

	#signalError(err) {
		const subscriber = this.#subscriber;
		this.cancel();
		subscriber?.onError(err);
	}

	#signalComplete(err) {
		const subscriber = this.#subscriber;
		this.cancel();
		subscriber?.onComplete();
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
