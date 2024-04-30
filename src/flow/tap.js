
class TapSubscription {
	#tapSubscriber;
	#subscriber;
	#inputSubscription;

	#cancelled = false;

	constructor(input, tapSubscriber, subscriber) {
		this.#tapSubscriber = tapSubscriber;
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
		this.#tapSubscriber = this.#subscriber = null;
	}

	request(n) {
		if (this.#cancelled) return;
		this.#inputSubscription.request(n);
	}

	#onNext(value) {
		this.#signal(it => it.onNext(value), value);
	}

	#onError(err) {
		this.#signal(it => it.onError(err), err);
	}

	#onComplete() {
		this.#signal(it => it.onComplete());
	}

	#signal(event, ...args) {
		try {
			event(this.#tapSubscriber, ...args);
		} catch (err) {
			const subscriber = this.#subscriber;
			this.cancel();
			subscriber.onError(new Error('Tap subscriber error', { cause: err }));
			return;
		}
		event(this.#subscriber, ...args);
	}
}

class TapPublisher {
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

const tap = tapSubscriber =>
	input => new TapPublisher(input, tapSubscriber);

export default tap;
