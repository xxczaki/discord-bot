import { BG, type BgConfig } from 'bgutils-js';
import { JSDOM } from 'jsdom';

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

export async function generateWebPoToken(contentBinding: string): Promise<{
	visitorData: string;
	placeholderPoToken: string;
	poToken: string;
}> {
	if (!contentBinding) {
		throw new Error('Content binding required for PO token generation');
	}

	const dom = new JSDOM();

	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
	});

	const bgConfig: BgConfig = {
		fetch: (input: string | URL | globalThis.Request, init?: RequestInit) =>
			fetch(input, init),
		globalObj: globalThis,
		identifier: contentBinding,
		requestKey: REQUEST_KEY,
	};

	const bgChallenge = await BG.Challenge.create(bgConfig);

	if (!bgChallenge) {
		throw new Error('Failed to create BotGuard challenge');
	}

	const interpreterJavascript =
		bgChallenge.interpreterJavascript
			.privateDoNotAccessOrElseSafeScriptWrappedValue;

	if (!interpreterJavascript) {
		throw new Error('Failed to load BotGuard VM');
	}

	new Function(interpreterJavascript)();

	const poTokenResult = await BG.PoToken.generate({
		program: bgChallenge.program,
		globalName: bgChallenge.globalName,
		bgConfig,
	});

	const placeholderPoToken = BG.PoToken.generatePlaceholder(contentBinding);

	return {
		visitorData: contentBinding,
		placeholderPoToken,
		poToken: poTokenResult.poToken,
	};
}
