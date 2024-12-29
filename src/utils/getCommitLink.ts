export default function getCommitLink(commitHash: string) {
	const commitLink = `[\`${commitHash}\`](<https://github.com/xxczaki/discord-bot/commit/${commitHash}>)`;

	return commitLink;
}
