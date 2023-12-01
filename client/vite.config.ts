import { defineConfig } from 'vite';
import { resolve } from 'path'
import preact from '@preact/preset-vite';

export default defineConfig({
	server: {
		proxy: {
			"/sock": {
				target: "ws://localhost:3030",
				ws: true
			}
		}
	},

	build: {
		rollupOptions: {
			input: {
				main: resolve(__dirname, "index.html"),
				doorbell: resolve(__dirname, "doorbell.html"),
			}
		}
	},

	plugins: [preact()],
});
