export default function isYouTubeLink(query: string) {
	return query.includes('youtube.com') || query.includes('youtu.be');
}
