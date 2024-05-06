
const pipe = (input, ...operations) =>
	operations.reduce((pub, op) => op(pub), input);

export default pipe;
