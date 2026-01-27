import { BG, GOOG_API_KEY, USER_AGENT, buildURL } from 'bgutils-js';
import type { WebPoSignalOutput } from 'bgutils-js';
import { JSDOM } from 'jsdom';
import { Innertube } from 'youtubei.js';

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

export async function generateWebPoToken(videoId: string): Promise<{
	visitorData: string;
	poToken: string;
}> {
	if (!videoId) {
		throw new Error('Video ID required for PO token generation');
	}

	// Create Innertube instance without session cache to get fresh visitor data
	const innertube = await Innertube.create({
		user_agent: USER_AGENT,
		enable_session_cache: false,
	});
	const visitorData = innertube.session.context.client.visitorData || '';

	// Setup JSDOM environment for BotGuard
	const dom = new JSDOM(
		'<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>',
		{
			url: 'https://www.youtube.com/',
			referrer: 'https://www.youtube.com/',
			userAgent: USER_AGENT,
		},
	);

	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		location: dom.window.location,
		origin: dom.window.origin,
	});

	if (!Reflect.has(globalThis, 'navigator')) {
		Object.defineProperty(globalThis, 'navigator', {
			value: dom.window.navigator,
		});
	}

	// Get attestation challenge from YouTube
	const challengeResponse = await innertube.getAttestationChallenge(
		'ENGAGEMENT_TYPE_UNBOUND',
	);

	if (!challengeResponse.bg_challenge) {
		throw new Error('Could not get attestation challenge');
	}

	// Load BotGuard script from YouTube
	const interpreterUrl =
		challengeResponse.bg_challenge.interpreter_url
			.private_do_not_access_or_else_trusted_resource_url_wrapped_value;
	const bgScriptResponse = await fetch(`https:${interpreterUrl}`);
	const interpreterJavascript = await bgScriptResponse.text();

	if (!interpreterJavascript) {
		throw new Error('Could not load BotGuard VM');
	}

	// Execute BotGuard script
	new Function(interpreterJavascript)();

	// Create BotGuard client
	const botguard = await BG.BotGuardClient.create({
		program: challengeResponse.bg_challenge.program,
		globalName: challengeResponse.bg_challenge.global_name,
		globalObj: globalThis,
	});

	// Generate WebPO token
	const webPoSignalOutput: WebPoSignalOutput = [];
	const botguardResponse = await botguard.snapshot({ webPoSignalOutput });

	// Get integrity token
	const integrityTokenResponse = await fetch(buildURL('GenerateIT', true), {
		method: 'POST',
		headers: {
			'content-type': 'application/json+protobuf',
			'x-goog-api-key': GOOG_API_KEY,
			'x-user-agent': 'grpc-web-javascript/0.1',
			'user-agent': USER_AGENT,
		},
		body: JSON.stringify([REQUEST_KEY, botguardResponse]),
	});

	const response = (await integrityTokenResponse.json()) as unknown[];

	if (typeof response[0] !== 'string') {
		throw new Error('Could not get integrity token');
	}

	// Create minter and generate poToken
	const integrityTokenBasedMinter = await BG.WebPoMinter.create(
		{ integrityToken: response[0] },
		webPoSignalOutput,
	);

	const poToken = await integrityTokenBasedMinter.mintAsWebsafeString(videoId);

	return {
		visitorData,
		poToken,
	};
}
