import memoize from 'memoize';

function cleanUpPlaylistContent(content: string) {
	return content
		.replace(/id=".+"/, '')
		.replaceAll('`', '')
		.trim();
}

export default memoize(cleanUpPlaylistContent);
