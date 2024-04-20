addEventListener('message', evt => {
	setTimeout(
		() => { postMessage(evt.data); },
		200 * Math.random());
});
