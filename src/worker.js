onmessage = evt => {
	const value = evt.data;
	console.log(`${self.name} processing input: ${value}`);
	setTimeout(
		() => { postMessage(value); },
		500 * Math.random());
};
