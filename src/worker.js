self.addEventListener('message', evt => {
	setTimeout(
        () => { self.postMessage(evt.data); },
        500 * Math.random());
});
