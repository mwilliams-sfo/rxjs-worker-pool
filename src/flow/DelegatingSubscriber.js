


export default class DelegatingSubscriber {
	#delegate;
	#subscription;

	constructor(delegate) {
		this.#delegate = delegate;
	}

	onSubscribe(subscription) {
		if (subscription === null || typeof subscription != 'object') {
			throw new TypeError('subscription is not an object.');
		}
		try {
			this.#delegate?.onSubscribe(this.#subscription = subscription);
		} catch (err) {
			this.#subscription?.cancel();
			this.onError(err);
		}
	}

	onNext(value) {
		try {
			value ?? (() => { throw new TypeError('Required argument is nullish.'); })();
			this.#delegate?.onNext(value);
		} catch (err) {
			const delegate = this.#delegate;
			this.#subscription?.cancel();
			delegate?.onError(err);
			
		}		
	}

	onError(err) {
		try {
			err ?? (() => { throw new TypeError('Required argument is nullish.'); })();
			this.#delegate?.onError(err);
		} finally {
			this.#delegate = this.#subscription = null;
		}
	}

	onComplete() {
		try {
			this.#delegate?.onComplete();
		} finally {
			this.#delegate = this.#subscription = null;
		}
	}

	#cancel() {
		this.#subscription?.cancel();
		this.#subscription.cancel();
		this.#subscription = null;
	}
}
