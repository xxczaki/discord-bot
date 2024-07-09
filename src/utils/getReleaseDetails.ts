export default function getReleaseDetails() {
	const commitHash = process.env.GIT_COMMIT;
	const wasDeploymentManual = !commitHash;

	const commitLink = `[\`${commitHash}\`](<https://github.com/xxczaki/discord-bot/commit/${commitHash}>)`;

	return wasDeploymentManual ? 'manual' : commitLink;
}
