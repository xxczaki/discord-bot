export default function cleanUpPlaylistContent(content: string) {
	return content
		.replace(/id=".+"/, '')
		.replaceAll('`', '')
		.trim();
}
