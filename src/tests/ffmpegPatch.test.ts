import { PassThrough, Readable } from 'node:stream';
import { FFmpeg } from 'discord-player';
import { expect, it } from 'vitest';

const CHUNK_SIZE_BYTES = 19_200;
const CHUNK_COUNT = 5;

function createFFmpegWithoutProcess(writer: PassThrough): FFmpeg {
	return Object.create(FFmpeg.prototype, {
		_writer: { value: writer },
		_writableState: { value: Reflect.get(writer, '_writableState') },
		write: { value: writer.write.bind(writer) },
		end: { value: writer.end.bind(writer) },
	});
}

it('should accept piped byte streams through `_write`', async () => {
	const writer = new PassThrough();
	const ffmpeg = createFFmpegWithoutProcess(writer);
	const received: Buffer[] = [];
	let sentChunks = 0;

	writer.on('data', (chunk: Buffer) => received.push(chunk));

	const source = new Readable({
		read() {
			this.push(
				sentChunks++ < CHUNK_COUNT ? Buffer.alloc(CHUNK_SIZE_BYTES, 1) : null,
			);
		},
	});

	await new Promise<void>((resolve, reject) => {
		writer.on('finish', resolve);
		writer.on('error', reject);
		source.pipe(ffmpeg);
	});

	expect(Buffer.concat(received).length).toBe(CHUNK_SIZE_BYTES * CHUNK_COUNT);
});
