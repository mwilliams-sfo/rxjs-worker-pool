
import DelegatingSubscriber from './DelegatingSubscriber';

class DoOnNextSubscription {
	#onNextCallback;
	#subscriber;
	#inputSubscriber;
	#inputSubscription;

	constructor(input, onNext, subscriber) {
		this.#onNextCallback = onNext;
		this.#subscriber = subscriber;
		this.#inputSubscriber = new DelegatingSubscriber({
			onSubscribe: subscription => { this.#inputSubscription = subscription; },
			onNext: value => { this.#onNext(value); },
			onError: err => { this.#onError(err); },
			onComplete: () => { this.#onComplete(); }
		});
		input.subscribe(this.#inputSubscriber);
	}

	cancel() {
		this.#inputSubscription?.cancel();
		this.#onNextCallback = this.#subscriber = this.#inputSubscriber = this.#inputSubscription = null;
	}

	request(n) {
		this.#inputSubscription?.request(n);
	}

	#onNext(value) {
		try {
			this.#onNextCallback?.(value);
		} catch (err) {
			this.#inputSubscription?.cancel();
			this.#subscriber?.onError(new Error('onNext callback failed', {cause: err}));
			return;
		}
		this.#subscriber?.onNext(value);
	}

	#onError(err) {
		try {
			this.#subscriber?.onError(err);
		} finally {
			this.#onNextCallback = this.#subscriber = this.#inputSubscriber = this.#inputSubscription = null;
		}
	}

	#onComplete() {
		try {
			this.#subscriber?.onComplete();
		} finally {
			this.#onNextCallback = this.#subscriber = this.#inputSubscriber = this.#inputSubscription = null;
		}
	}
}

class DoOnNextPublisher {
	#input;
	#onNext;

	constructor(input, onNext) {
		if (input == null || typeof input != 'object') throw new TypeError('input is not an object');
		if (typeof onNext != 'function') throw new TypeError('onNext is not a function.');
		this.#input = input;
		this.#onNext = onNext;
	}

	subscribe(subscriber) {
		subscriber ?? (() => { throw new TypeError('subscriber is null.'); })();
		subscriber.onSubscribe(
			new DoOnNextSubscription(this.#input, this.#onNext, subscriber));
	}
}

const doOnNext = onNext =>
	input => new DoOnNextPublisher(input, onNext);

export default doOnNext;
