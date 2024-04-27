
export default class LazySubscription {
	#input;
	#subscriber;
	#subscription;
	#terminated = false;

	constructor(input, subscriber) {
		this.#input = input;
		this.#subscriber = subscriber;
	}

	cancel() {
		if (this.#terminated) return;
		this.#terminated = true;
		this.#subscription?.cancel();
	}

	request(n) {
		if (this.#terminated) return;
		this.#ensureSubscription().then(() => {
			if (this.#terminated) {
				this.#subscription.cancel();
			} else {
				this.#subscription.request(n);
			}
		});
	}

	#ensureSubscription() {
		return new Promise(resolve => {
			if (this.#subscription) return resolve();
			this.#input.subscribe({
				onSubscribe: subscription => {
					this.#subscription = subscription;
					resolve();
				},
				onNext: value => {
					if (this.#terminated) return;
					this.#subscriber.onNext(value);
				},
				onError: err => {
					if (this.#terminated) return;
					this.#terminated = true;
					this.#subscriber.onError(err);
				},
				onComplete: () => {
					if (this.#terminated) return;
					this.#terminated = true;
					this.#subscriber.onComplete();
				}
			});
		});
	}
}
