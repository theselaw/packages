// @ts-nocheck

export default class CssRecord {

	private selectors: string[] = [];

	private properties: Record<string, any> = {};

	public pseudoClasses: string[] = [];

	constructor(selector: string|string[] = null, properties: Record<string, any> = {}, pseudoClases: string[] = []) {
		if (selector) {
			if (typeof selector === 'string') {
				selector = [selector];
			}

			selector.forEach((selector) => {
				this.addSelector(selector);
			});
		}

		this.properties = properties;
		this.pseudoClasses = pseudoClases;
	}

	public addProperty(property, value) {
		if (!this.hasProperty(property)) {
			this.properties[property] = value;
		}
	}

	public addSelector(selector, pseudoClass = null) {
		// TODO is this selector[0] and substr necessary?
		// selector = selector[0] + selector.substr(1).replace(/([^-_a-zA-Z\d])/g, '\\$1');
		selector = selector.replace(/([^-_a-zA-Z\d])/g, '\\$1');

		if (pseudoClass) {
			selector += ':' + pseudoClass;
		}

		if (!this.hasSelector(selector)) {
			this.selectors.push(selector);
		}
	}

	public getSelector(selector) {
		return this.hasSelector(selector) ? this.selectors[this.selectors.indexOf(selector)] : null;
	}

	public hasProperty(name) {
		return typeof this.properties[name] !== 'undefined';
	}

	public hasSelector(selector) {
		return this.selectors.indexOf(selector) > -1;
	}

	public compile(config: Record<string, any> = {}) {
		const minimize: boolean = typeof config.minimize === 'undefined' ? false : config.minimize;
		const newLine = minimize ? '' : '\n';

		return this.selectors.map(selector => '.' + selector).join(',' + newLine) + '{' + newLine
			+ Object.keys(this.properties)
				.map(property => (minimize ? '' : '\t') + property + ':' + this.properties[property])
				.join(';' + newLine)
			+ newLine + '}' + newLine;
	}

	public serialize(): Record<string, any> {
		const serializedObject = {
			selectors: this.selectors.map(selector => {
				return selector.replace(/\\([^-_a-zA-Z\d])/g, '$1');
			}),
			properties: this.properties,
		};
		if (this.properties.length) {
			serializedObject.pseudoClasses = this.pseudoClasses
		}
		return serializedObject;
	}

	public static deserialize(data: Record<string, any>): CssRecord {
		const cssRecord = new CssRecord(null, data.properties, data.pseudoClasses);
		cssRecord.selectors = data.selectors;
		return cssRecord;
	}

	public hydrate(data: Record<string, any>): void {
		data.selectors.forEach(selector => {
			this.addSelector(selector);
		});

		if (data.pseudoClasses.length) {
			this.pseudoClasses = this.pseudoClasses.concat(
				data.pseudoClasses.filter(pseudoClass => this.pseudoClasses.indexOf(pseudoClass) === -1)
			);
		}

		Object.keys(data.properties).forEach(property => {
			this.addProperty(property, data.properties[property]);
		});
	}

}
