
export default class SimpleSubscriber {
	#partialSubscriber;
	#subscription;

	constructor(partialSubscriber) {
		if (typeof partialSubscriber == 'function') {
			partialSubscriber = this.#onNextSubscriber(partialSubscriber);
		}
		this.#partialSubscriber = partialSubscriber;
	}

	onSubscribe(subscription) {
		this.#validateParam(subscription);
		this.#partialSubscriber.onSubscribe(subscription);
	}

	onNext(value) {
		this.#validateParam(value);
		this.#partialSubscriber.onNext?.(value);
	}

	onError(err) {
		this.#signal(() => {
			this.#validateParam(err);
			this.#partialSubscriber.onError?.(err);
		});
	}

	onComplete() {
		this.#signal(() => {
			this.#partialSubscriber.onComplete?.();
		});
	}

	#onNextSubscriber(onNext) {
		let _subscription;
		return {
			onSubscribe(subscription) {
				_subscription = subscription;
				_subscription.request(1);
			},
			onNext(value) {
				_subscription.request(1);
				onNext(value);
			}
		};
	}

	#validateParam(param) {
		if (param === null || param === void 0) {
			throw new TypeError('Parameter must not be null');
		}
	}

	#signal(block) {
		try {
			block();
		} catch (err) {
			throw err;
		}
	}
}
