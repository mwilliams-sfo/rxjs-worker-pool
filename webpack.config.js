const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
	mode: 'none',
	entry: {
		index: './src/index.js',
		worker: './src/worker.js'
	},
	devtool: 'eval-source-map',
	output: {
		clean: true,
		path: path.resolve(__dirname, 'dist'),
		filename: '[name].bundle.js',
		publicPath: '/'
	},
	plugins: [
		new CopyWebpackPlugin({
			patterns: [
				{ from: 'src/index.html', to: '.' }
			]
		})
	]
};
