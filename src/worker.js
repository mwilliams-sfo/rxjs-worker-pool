addEventListener('message', evt => {
	setTimeout(
		() => { postMessage(evt.data); },
		50 * Math.random());
});
