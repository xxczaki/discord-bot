import memoize from 'memoize';

function cleanUpPlaylistContent(content: string) {
	// Extract content from triple backticks only
	const backtickMatch = /```\n?(.*?)\n?```/s.exec(content);

	if (!backtickMatch) {
		return '';
	}

	return backtickMatch[1].trim();
}

export default memoize(cleanUpPlaylistContent);
