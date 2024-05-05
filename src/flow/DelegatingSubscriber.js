


export default class DelegatingSubscriber {
	#delegate;

	constructor(delegate) {
		this.#delegate = delegate;
	}

	onSubscribe(subscription) {
		if (subscription === null || typeof subscription != 'object') {
			throw new TypeError('subscription is not an object.');
		}
		try {
			this.#delegate.onSubscribe(subscription);
		} catch (err) {
			subscription?.cancel();
			throw err
		}
	}

	onNext(value) {
		try {
			value ?? (() => { throw new TypeError('Provided argument is nullish.'); })();
			this.#delegate?.onNext?.(value);
		} catch (err) {
			this.onError(err);
		}		
	}

	onError(err) {
		try {
			err ?? (() => { throw new TypeError('Provided argument is nullish.'); })();
			this.#delegate?.onError?.(err);
		} finally {
			this.#delegate = null;
		}
	}

	onComplete() {
		try {
			this.#delegate?.onComplete?.();
		} finally {
			this.#delegate = null;
		}
	}
}
