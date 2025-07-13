function cleanUpPlaylistContent(content: string) {
	const backtickMatch = /```\n?(.*?)\n?```/s.exec(content);

	if (!backtickMatch) {
		return '';
	}

	return backtickMatch[1].trim();
}

export default cleanUpPlaylistContent;
