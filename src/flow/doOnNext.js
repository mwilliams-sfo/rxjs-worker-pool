
class DoOnNextSubscription {
	#onNextCallback;
	#subscriber;
	#inputSubscription;

	#cancelled = false;

	constructor(input, onNext, subscriber) {
		this.#onNextCallback = onNext;
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
		this.#inputSubscription.cancel();
		this.#onNextCallback = this.#subscriber = null;
	}

	request(n) {
		if (this.#cancelled) return;
		this.#inputSubscription.request(n);
	}

	#onNext(value) {
		if (this.#cancelled) return;
		value ?? (() => { throw new TypeError('Required argument is null.'); })();
		try {
			this.#onNextCallback(value);
		} catch (err) {
			this.#onError(new Error('onNext callback failed', {cause: err}));
			return;
		}
		this.#subscriber.onNext(value);
	}

	#onError(err) {
		if (this.#cancelled) return;
		err ?? (() => { throw new TypeError('Required argument is null.'); })();
		const subscriber = this.#subscriber;
		this.cancel();
		subscriber.onError(err);
	}

	#onComplete() {
		if (this.#cancelled) return;
		const subscriber = this.#subscriber;
		this.cancel();
		subscriber.onComplete();
	}
}

class DoOnNextPublisher {
	#input;
	#onNext;

	constructor(input, onNext) {
		this.#input = input;
		this.#onNext = onNext;
	}

	subscribe(subscriber) {
		subscriber ?? (() => { throw new TypeError('Subscriber is null.'); })();
		subscriber.onSubscribe(
			new DoOnNextSubscription(this.#input, this.#onNext, subscriber));
	}
}

const doOnNext = onNext =>
	input => new DoOnNextPublisher(input, onNext);

export default doOnNext;
