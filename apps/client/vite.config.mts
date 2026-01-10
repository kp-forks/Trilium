/// <reference types='vitest' />
import preact from "@preact/preset-vite";
import { join, resolve } from 'path';
import webpackStatsPlugin from 'rollup-plugin-webpack-stats';
import { defineConfig, type Plugin } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy'

const assets = [ "assets", "stylesheets", "fonts", "translations" ];

const isDev = process.env.NODE_ENV === "development";
let plugins: any = [
    preact({
        // Disable Babel in dev for faster transforms (use esbuild instead)
        // Babel takes ~2.5s per TSX file, esbuild takes ~100ms
        babel: isDev ? undefined : {
            compact: true
        }
    })
];

if (!isDev) {
    plugins = [
        ...plugins,
        viteStaticCopy({
            targets: assets.map((asset) => ({
                src: `src/${asset}/*`,
                dest: asset
            }))
        }),
        viteStaticCopy({
            structured: true,
            targets: [
                {
                    src: "../../node_modules/@excalidraw/excalidraw/dist/prod/fonts/*",
                    dest: "",
                }
            ]
        }),
        webpackStatsPlugin()
    ]
}

export default defineConfig(() => ({
    root: __dirname,
    cacheDir: '../../.cache/vite',
    base: "",
    plugins,
    css: {
        // Use Lightning CSS (Rust-based) for much faster CSS transforms
        transformer: 'lightningcss',
        // Disable CSS source maps in dev for faster transforms
        devSourcemap: false
    },
    resolve: {
        alias: [
            {
                find: "react",
                replacement: "preact/compat"
            },
            {
                find: "react-dom",
                replacement: "preact/compat"
            }
        ],
        dedupe: [
            "react",
            "react-dom",
            "preact",
            "preact/compat",
            "preact/hooks"
        ]
    },
    optimizeDeps: {
        include: [
            "ckeditor5-premium-features",
            "ckeditor5",
            "codemirror",
            "mathlive",
            "@triliumnext/ckeditor5",
            "@triliumnext/ckeditor5-math",
            "@triliumnext/ckeditor5-mermaid",
            "@triliumnext/ckeditor5-admonition",
            "@triliumnext/ckeditor5-footnotes",
            "@triliumnext/ckeditor5-keyboard-marker",
            "@triliumnext/codemirror",
            "@triliumnext/highlightjs"
        ]
    },
    build: {
        target: "esnext",
        outDir: './dist',
        emptyOutDir: true,
        reportCompressedSize: true,
        sourcemap: false,
        rollupOptions: {
            input: {
                desktop: join(__dirname, "src", "desktop.ts"),
                mobile: join(__dirname, "src", "mobile.ts"),
                login: join(__dirname, "src", "login.ts"),
                setup: join(__dirname, "src", "setup.ts"),
                set_password: join(__dirname, "src", "set_password.ts"),
                runtime: join(__dirname, "src", "runtime.ts"),
                print: join(__dirname, "src", "print.tsx")
            },
            output: {
                entryFileNames: "src/[name].js",
                chunkFileNames: "src/[name].js",
                assetFileNames: "src/[name].[ext]",
                manualChunks: {
                    "ckeditor5": [ "@triliumnext/ckeditor5" ],
                    "boxicons": [ "../../node_modules/boxicons/css/boxicons.min.css" ]
                },
            },
            onwarn(warning, rollupWarn) {
                if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
                    return;
                }
                rollupWarn(warning);
            }
        }
    },
    test: {
        environment: "happy-dom",
        setupFiles: [
            "./src/test/setup.ts"
        ]
    },
    commonjsOptions: {
        transformMixedEsModules: true,
    },
    define: {
        "process.env.IS_PREACT": JSON.stringify("true"),
    }
}));
