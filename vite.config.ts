import { defineConfig, loadEnv, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }): UserConfig => {
	const env = loadEnv(mode, process.cwd(), '');
	const port = Number.parseInt(env.port || '5173', 10); // MUST BE LOWERCASE

	return {
		plugins: [react(), tailwindcss()],
		base: './',
		build: {
			outDir: 'dist-react',
			rollupOptions: {
				output: {
					manualChunks: (id: string) => {
						if (
							id.includes('react-markdown') ||
							id.includes('remark-gfm') ||
							id.includes('rehype-highlight')
						) {
							return 'markdown';
						}
					},
				},
			},
		},
		resolve: {
			tsconfigPaths: true,
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
