
import LazySubscription from './LazySubscription';

class TapSubscription {
	#tapSubscriber;
	#input;
	#subscriber;
	#inputSubscription;

	constructor(input, tapSubscriber, subscriber) {
		this.#tapSubscriber = tapSubscriber;
		this.#input = input;
		this.#subscriber = subscriber;
		this.#inputSubscription = new LazySubscription(input, this);
	}

	cancel() {
		this.#inputSubscription?.cancel();
	}

	request(n) {
		this.#inputSubscription.request(n);
	}

	onNext(value) {
		try {
			this.#tapSubscriber.onNext?.(value);
			this.#subscriber.onNext?.(value);
		} catch (err) {
			this.#inputSubscription.cancel();
			this.#subscriber.onError?.(new Error('Tap subscriber error', { cause: err }));
		}
	}

	onError(err) {
		try {
			this.#tapSubscriber.onError?.(err);
			this.#subscriber.onError?.(err);
		} catch (err) {
			this.#subscriber.onError?.(new Error('Tap subscriber error', { cause: err }));
		}
	}

	onComplete() {
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
