
class IterableSubscription {
	#iterable;
	#subscriber;
	#iterator;
	#terminated = false;

	constructor(iterable, subscriber) {
		this.#iterable = iterable;
		this.#subscriber = subscriber;
	}

	cancel() {
		if (this.#terminated) return;
		this.#terminated = true;
		this.#iterator?.return?.();
	}

	request(n) {
		if (this.#terminated || n <= 0) return;
		this.#catchError(() => {
			if (!this.#iterator) {
				this.#iterator = this.#iterable[Symbol.iterator]();
			}
			while (!this.#terminated && n > 0) {
				const next = this.#iterator.next();
				if (!next.done) {
					n--;
					this.#signal(() => { this.#subscriber.onNext?.(next.value); });
				} else {
					this.#terminated = true;
					this.#signal(() => { this.#subscriber.onComplete?.(); });
				}	
			}
		});
	}

	#catchError(block) {
		try {
			block();
		} catch (err) {
			this.#signal(() => { this.#subscriber.onError(err); });
		}
	}

	#signal(block) {
		try {
			block();
		} catch (err) {}
	}
}


export class IterablePublisher {
	#iterable;

	constructor(iterable) {
		this.#iterable = iterable;
	}

	subscribe(subscriber) {
		subscriber.onSubscribe(new IterableSubscription(this.#iterable, subscriber));
	}
}
