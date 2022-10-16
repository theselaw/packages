import TestUtils from '../../../../tests/TestUtils';
import { Compiler } from '../../src';

const testName = 'single-letter-macros';
const testUtils = new TestUtils('stylify', testName);
const inputIndex = testUtils.getHtmlInputFile();

const compiler = new Compiler({
	dev: true,
	macros: {
		'm:(\\S+?)': ({macroMatch, selectorProperties}) => {
			selectorProperties.add('margin', macroMatch.getCapture(0));
		}
	}
});

let compilationResult = compiler.compile(inputIndex);

test('Single letter macros', (): void => {
	testUtils.testCssFileToBe(compilationResult.generateCss());
});
