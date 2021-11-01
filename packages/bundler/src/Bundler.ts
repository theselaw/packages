import * as fg from 'fast-glob';
import {
	CompilationResult,
	Compiler,
	CompilerConfigInterface,
	CompilerContentOptionsInterface,
	CssRecord
} from '@stylify/stylify';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

interface BundleFileDataInterface {
	filePath: string,
	contentOptions: ContentOptionsInterface,
	content: string
}

interface BundleInterface {
	mangleSelectors?: boolean,
	dumpCache?: boolean,
	outputFile: string,
	scope?: string,
	files: string[]
}

interface ContentOptionsInterface extends CompilerContentOptionsInterface {
	files: string[]
}

interface BundlesBuildCacheInterface {
	compiler: Compiler,
	compilationResult: CompilationResult,
	buildTime: string,
	files: string[]
}

interface BundlesBuildStatsInterface {
	name: string,
	size: number,
	buildTime: string
}

export interface BundlerOptionsInterface {
	compilerConfig: CompilerConfigInterface,
	verbose: boolean,
	watchFiles?: boolean
}

export class Bundler {

	private bundlesBuildCache: Record<string, BundlesBuildCacheInterface> = {};

	private options: Partial<BundlerOptionsInterface> = {};

	public constructor(options: BundlerOptionsInterface) {
		this.options = {
			...{
				compilerConfig: null,
				verbose: true,
				watchFiles: false
			},
			...options
		};

		if (!('contentOptionsProcessors' in this.options.compilerConfig)) {
			this.options.compilerConfig.contentOptionsProcessors = {};
		}

		this.options.compilerConfig.contentOptionsProcessors.files = (
			contentOptions: ContentOptionsInterface,
			optionMatchValue: string
		): ContentOptionsInterface => {
			const optionMatchValueToArray = optionMatchValue.split(' ').filter((value: string): boolean => {
				return value.trim().length !== 0;
			});

			contentOptions.files = [...contentOptions.files || [], ...optionMatchValueToArray];
			return contentOptions;
		};
	}

	public bundle(bundles: BundleInterface[]): void {
		const startTime = performance.now();

		for (const bundleOptions of bundles) {
			this.processBundle(bundleOptions);
		}

		if (this.options.watchFiles) {
			this.log(`Waching for changes...`, 'textYellow');
		} else if (this.options.verbose) {
			let buildsInfo = [];

			for (const bundleOutputFile in this.bundlesBuildCache) {
				if (!fs.existsSync(bundleOutputFile)) {
					continue;
				}

				const bundleBuildCache = this.bundlesBuildCache[bundleOutputFile];
				buildsInfo.push({
					name: bundleOutputFile,
					size: fs.statSync(bundleOutputFile).size / 1024,
					buildTime: bundleBuildCache.buildTime
				});
			}
			buildsInfo = buildsInfo.sort(
				(nextItem: BundlesBuildStatsInterface, previousItem: BundlesBuildStatsInterface): number => {
					if (nextItem.size > previousItem.size) {
						return -1;
					}

					return 0;
				}
			);

			const tablesData = [];

			for (const buildInfo of buildsInfo) {
				tablesData.push({
					Name: buildInfo.name,
					'Build size (Kb)': buildInfo.size.toFixed(2),
					'Build time (s)': buildInfo.buildTime
				});
			}

			if (tablesData.length) {
				if (this.options.verbose) {
					// eslint-disable-next-line no-console
					console.table(tablesData);
				}
			} else {
				this.log('No bundle was processed.', 'textRed');
			}

			this.log(`Build done (${((performance.now() - startTime)/1000).toFixed(2)} s).`);
		}
	}

	private processBundle(bundleOptions: BundleInterface): void {
		const startTime = performance.now();
		this.log(`Processing ${bundleOptions.outputFile}.`, 'textCyan');

		if (!(bundleOptions.outputFile in this.bundlesBuildCache)) {
			const originalOnPrepareCompilationResultFunction = this.options.compilerConfig.onPrepareCompilationResult;
			const compiler = new Compiler(this.options.compilerConfig);
			compiler.onPrepareCompilationResult = (compilationResult: CompilationResult): void => {
				compilationResult.configure({
					mangleSelectors: bundleOptions.mangleSelectors || false,
					reconfigurable: false
				});

				if (bundleOptions.scope) {
					compilationResult.onPrepareCssRecord = (cssRecord: CssRecord): void => {
						cssRecord.scope = bundleOptions.scope;
					};
				}

				if (typeof originalOnPrepareCompilationResultFunction === 'function') {
					originalOnPrepareCompilationResultFunction(compilationResult);
				}
			};
			this.bundlesBuildCache[bundleOptions.outputFile] = {
				compiler: compiler,
				compilationResult: null,
				buildTime: null,
				files: []
			};
		}

		const bundleBuildCache = this.bundlesBuildCache[bundleOptions.outputFile];
		const compiler = bundleBuildCache.compiler;

		const filesToProcess = this.getFilesToProcess(compiler, bundleOptions.files);

		if (!filesToProcess.length) {
			this.log(`No files found for ${bundleOptions.outputFile}. Skipping.`, 'textRed');
			return;
		}

		for (const fileToProcessOptions of filesToProcess) {
			if (!fs.existsSync(fileToProcessOptions.filePath)) {
				this.log(`File ${fileToProcessOptions.filePath} not found. Skipping`, 'textRed');
				continue;
			}

			if (!(fileToProcessOptions.filePath in bundleBuildCache)) {
				bundleBuildCache.files.push(fileToProcessOptions.filePath);
				if (this.options.watchFiles) {
					fs.watchFile(fileToProcessOptions.filePath, () => {
						this.log(`${fileToProcessOptions.filePath} changed.`, null, 2);
						this.processBundle({
							...bundleOptions,
							...{files: [fileToProcessOptions.filePath]}
						});
						this.log(`Waching for changes...`, 'textYellow');
					});
				}
			}

			if (Object.keys(fileToProcessOptions.contentOptions.components).length) {
				compiler.configure({
					components: fileToProcessOptions.contentOptions.components
				});
			}

			if (fileToProcessOptions.contentOptions.pregenerate) {
				bundleBuildCache.compilationResult = compiler.compile(
					fileToProcessOptions.contentOptions.pregenerate,
					bundleBuildCache.compilationResult
				);
			}

			bundleBuildCache.compilationResult = compiler.compile(
				fileToProcessOptions.content,
				bundleBuildCache.compilationResult
			);

			if (bundleOptions.mangleSelectors) {
				const processedContent = compiler.rewriteSelectors(
					bundleBuildCache.compilationResult,
					fileToProcessOptions.content
				);
				fs.writeFileSync(fileToProcessOptions.filePath, processedContent);
			}
		}

		const outputDir = path.dirname(bundleOptions.outputFile);

		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, {recursive: true});
		}

		fs.writeFileSync(bundleOptions.outputFile, bundleBuildCache.compilationResult.generateCss());

		if (bundleOptions.dumpCache) {
			const serializedResult = bundleBuildCache.compilationResult.serialize();

			for (const selector in serializedResult.selectorsList) {
				delete serializedResult.selectorsList[selector].onAddProperty;
				delete serializedResult.selectorsList[selector].scope;
			}

			delete serializedResult.onPrepareCssRecord;

			fs.writeFileSync(bundleOptions.outputFile + '.json', JSON.stringify(serializedResult));
		}

		bundleBuildCache.buildTime = ((performance.now() - startTime)/1000).toFixed(2);
		this.log(`Created ${bundleOptions.outputFile} (${bundleBuildCache.buildTime} s).`, 'textGreen');
	}

	private getFilesToProcess(compiler: Compiler, filesMasks: string[]): BundleFileDataInterface[] {
		const filePaths = fg.sync(filesMasks);

		let filesToProcess: BundleFileDataInterface[] = [];

		for (const filePath of filePaths) {
			const fileContent = fs.readFileSync(filePath).toString();
			const contentOptionsFromFiles = compiler.getOptionsFromContent(fileContent) as ContentOptionsInterface;
			let filePathsFromContent = contentOptionsFromFiles.files || [];

			if (filePathsFromContent.length) {
				filePathsFromContent = filePathsFromContent.map((fileOptionValue) => {
					return path.join(path.dirname(filePath), fileOptionValue);
				});
			}

			filesToProcess.push({
				filePath: filePath,
				contentOptions: contentOptionsFromFiles,
				content: fileContent
			});

			if (filePathsFromContent.length) {
				filesToProcess = [
					...filesToProcess, ...this.getFilesToProcess(compiler, filePathsFromContent)
				];
			}
		}

		return filesToProcess;
	}

	private log(content: string, colorName: string = null, newLinesCount: number = null): void {
		if (!this.options.verbose) {
			return;
		}

		const colors = {
			reset: '\x1b[0m',
			textWhite: '\x1b[37m',
			textCyan: '\x1b[36m',
			textRed: '\x1b[31m',
			textGreen: '\x1b[32m',
			textYellow: '\x1b[33m'
		};

		if (newLinesCount) {
			while (newLinesCount --) {
				// eslint-disable-next-line no-console
				console.log();
			}
		}

		const logTime = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

		// eslint-disable-next-line no-console
		console.log(
			colorName ? colors[colorName] : colors.textWhite,
			`[${logTime}] @stylify/bundler: ${content}`,
			colors.reset
		);
	}

}
