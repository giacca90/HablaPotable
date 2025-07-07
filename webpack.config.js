const path = require('path');

module.exports = {
	entry: {
		content: './src/content.js',
		popup: './src/popup.js',
		background: './src/background.js',
	},
	mode: 'development',
	devtool: 'inline-source-map',
	optimization: {
		minimize: false,
		moduleIds: 'named',
	},
	output: {
		filename: '[name].js',
		path: path.resolve(__dirname, 'dist'),
		pathinfo: true,
	},
	resolve: {
		fallback: {
			url: require.resolve('url/'),
			stream: false,
			http: false,
			https: false,
			zlib: false,
		},
	},
};
