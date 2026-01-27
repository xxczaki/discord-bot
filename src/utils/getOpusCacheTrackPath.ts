import { join } from 'node:path';
import generateOpusCacheFilename from './generateOpusCacheFilename';
import getOpusCacheDirectoryPath from './getOpusCacheDirectoryPath';

const opusCacheDirectory = getOpusCacheDirectoryPath();

interface TrackMetadata {
	title: string;
	author: string;
	durationMS: number;
}

export default function getOpusCacheTrackPath(metadata: TrackMetadata): string {
	const filename = generateOpusCacheFilename(metadata);

	return join(opusCacheDirectory, filename);
}
