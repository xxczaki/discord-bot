import { join } from 'node:path';
import memoize from 'memoize';
import getOpusCacheDirectoryPath from './getOpusCacheDirectoryPath';

const opusCacheDirectory = getOpusCacheDirectoryPath();

function getOpusCacheTrackPath(url: string) {
	return join(
		opusCacheDirectory,
		`${Buffer.from(url).toString('base64url')}.opus`,
	);
}

export default memoize(getOpusCacheTrackPath);
