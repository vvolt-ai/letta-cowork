import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const port = parseInt(env.PORT); // MUST BE LOWERCASE

	return {
		plugins: [react(), tailwindcss(), tsconfigPaths()],
		base: './',
		build: {
			outDir: 'dist-react',
			rollupOptions: {
				output: {
					manualChunks: {
						markdown: ['react-markdown', 'remark-gfm', 'rehype-highlight'],
					},
				},
			},
		},
		server: {
			port, // MUST BE LOWERCASE
			strictPort: true,
		},
		define: {
			'SHOW_CHANNELS': JSON.stringify(env.SHOW_CHANNELS === 'true'),
			'SHOW_EMAIL_OPTION': JSON.stringify(env.SHOW_EMAIL_OPTION === 'true'),
		},
	};
});
