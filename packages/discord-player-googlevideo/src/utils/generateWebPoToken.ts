import { BotGuardClient } from 'bgutils-js/botguard';
import type {
	IntegrityTokenData,
	WebPoSignalOutput,
} from 'bgutils-js/shared-types';
import {
	buildURL,
	getHeaders,
	parseLooseJSON,
	USER_AGENT,
} from 'bgutils-js/utils';
import { WebPoMinter } from 'bgutils-js/webpo';
import { JSDOM } from 'jsdom';
import type { IRawBotguardChallenge, IRawResponse } from 'youtubei.js';

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

export async function generateWebPoToken(videoId: string): Promise<string> {
	if (!videoId) {
		throw new Error('Video ID required for PO token generation');
	}

	const pageHtml = await setUpDOM();
	const initialAttestationData = pageHtml.match(
		/window\.ytAtN\(\s*({[\s\S]*?})\s*\)/,
	);
	if (!initialAttestationData) {
		throw new Error('Could not find challenge in page HTML');
	}

	const initialAttestationDataJson = parseLooseJSON(initialAttestationData[1]);
	const challengeResponse = initialAttestationDataJson.R as IRawResponse;
	if (!challengeResponse.bgChallenge) {
		throw new Error('Could not get attestation challenge');
	}

	await executeBotGuardInterpreter(challengeResponse.bgChallenge);

	const botGuardClient = await BotGuardClient.create({
		program: challengeResponse.bgChallenge.program,
		globalName: challengeResponse.bgChallenge.globalName,
		globalObject: globalThis,
	});

	const webPoSignalOutput: WebPoSignalOutput = [];
	const botguardResponse = await botGuardClient.snapshot({ webPoSignalOutput });
	const webPoMinter = await WebPoMinter.create(
		await getIntegrityTokenData(botguardResponse),
		webPoSignalOutput,
	);
	return await webPoMinter.mintAsWebsafeString(videoId);
}

async function setUpDOM(): Promise<string> {
	const dom = new JSDOM(
		'<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>',
		{
			url: 'https://www.youtube.com',
			referrer: 'https://www.youtube.com/',
			resources: {
				userAgent: USER_AGENT,
			},
		},
	);

	const pageResponse = await fetch('https://www.youtube.com', {
		headers: {
			accept: '*/*',
			'accept-language': 'en-US,en;q=0.7',
			'user-agent': USER_AGENT,
		},
	});
	const pageHtml = await pageResponse.text();
	const ytConfig = pageHtml.match(/ytcfg\.set\(({.+?})\);/s)?.[1];
	if (!ytConfig) {
		throw new Error('Could not find ytcfg in page HTML');
	}

	dom.window.yt = {
		config_: JSON.parse(ytConfig),
	};
	Object.assign(globalThis, {
		yt: dom.window.yt,
		window: dom.window,
		document: dom.window.document,
		location: dom.window.location,
		origin: dom.window.origin,
	});

	if (!('navigator' in globalThis)) {
		Object.defineProperty(globalThis, 'navigator', {
			value: dom.window.navigator,
		});
	}

	return pageHtml;
}

async function executeBotGuardInterpreter(
	botguardChallenge: IRawBotguardChallenge,
): Promise<void> {
	const interpreterUrl =
		botguardChallenge.interpreterUrl
			.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
	const bgScriptResponse = await fetch(`https:${interpreterUrl}`);
	const interpreterJavascript = await bgScriptResponse.text();
	if (interpreterJavascript) {
		new Function(interpreterJavascript)();
	} else {
		throw new Error('Could not load BotGuard VM');
	}
}

async function getIntegrityTokenData(
	botguardResponse: string,
): Promise<IntegrityTokenData> {
	const payload = [REQUEST_KEY, botguardResponse];
	const integrityTokenResponse = await fetch(buildURL('GenerateIT', true), {
		method: 'POST',
		headers: getHeaders(),
		body: JSON.stringify(payload),
	});
	const integrityTokenJson = (await integrityTokenResponse.json()) as [
		string,
		number,
		number,
		string,
	];
	const [
		integrityToken,
		estimatedTtlSecs,
		mintRefreshThreshold,
		websafeFallbackToken,
	] = integrityTokenJson;

	return {
		integrityToken,
		estimatedTtlSecs,
		mintRefreshThreshold,
		websafeFallbackToken,
	};
}
