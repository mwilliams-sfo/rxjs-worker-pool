const path = require('path');
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
	mode: 'none',
	entry: './src/index.js',
	output: {
		filename: 'bundle.js',
		path: path.resolve(__dirname, 'dist'),
		publicPath: '/'
	},
	plugins: [
		new CopyWebpackPlugin({
			patterns: [
				{ from: 'src/index.html', to: '.' },
				{ from: 'src/worker.js', to: '.' }
			]
		})
	]
};
