
class TapSubscription {
	#tapSubscriber;
	#input;
	#subscriber;

	#inputSubscription;
	#terminated = false;

	constructor(input, tapSubscriber, subscriber) {
		this.#tapSubscriber = tapSubscriber;
		this.#input = input;
		this.#subscriber = subscriber;
	}

	cancel() {
		if (this.#terminated) return;
		this.#inputSubscription?.cancel();
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
				},
				onNext: this.#onNext.bind(this),
				onError: this.#onError.bind(this),
				onComplete: this.#onComplete.bind(this)
			});
		});
	}

	#onNext(value) {
		if (this.#terminated) return;
		try {
			this.#tapSubscriber.onNext?.(value);
			this.#subscriber.onNext?.(value);
		} catch (err) {
			this.#inputSubscription.cancel();
			this.#subscriber.onError?.(new Error('Tap subscriber error', { cause: err }));
		}
	}

	#onError(err) {
		if (this.#terminated) return;
		this.#terminated = true;
		try {
			this.#tapSubscriber.onError?.(err);
			this.#subscriber.onError?.(err);
		} catch (err) {
			this.#subscriber.onError?.(new Error('Tap subscriber error', { cause: err }));
		}
	}

	#onComplete() {
		if (this.#terminated) return;
		this.#terminated = true;
		try {
			this.#tapSubscriber.onComplete?.()
			this.#subscriber.onComplete?.();
		} catch (err) {
			this.#subscriber.onError?.(new Error('Tap subscriber error', { cause: err }));
		}
	}
}

class TapOperator {
	#input;
	#tapSubscriber;

	constructor(input, subscriber) {
		this.#input = input;
		this.#tapSubscriber = subscriber
	}

	subscribe(subscriber) {
		const subscription = new TapSubscription(this.#input, this.#tapSubscriber, subscriber);
		subscriber.onSubscribe(subscription);
	}
}

const asPublisher = publisher => ({
	subscribe(subscriber) {
		publisher.subscribe(subscriber);
	}
});

const tap = tapSubscriber =>
	input => asPublisher(new TapOperator(input, tapSubscriber));

export default tap;
