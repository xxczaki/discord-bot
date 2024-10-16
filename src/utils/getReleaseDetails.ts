export default function getReleaseDetails() {
	const commitHash =
		process.env.GIT_COMMIT ?? process.env.RAILWAY_GIT_COMMIT_SHA;
	const wasDeploymentManual = !commitHash;

	const commitLink = `[\`${commitHash}\`](<https://github.com/xxczaki/discord-bot/commit/${commitHash}>)`;

	return wasDeploymentManual ? 'manual' : commitLink;
}
