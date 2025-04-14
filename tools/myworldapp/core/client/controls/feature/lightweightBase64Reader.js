//  A class that takes a file handle and returns the base64 parser, reading in chunks.

//  Used to ensure that the whole file isn't loaded at once, thus reducing used memory
export class LightweightBase64Reader {
    constructor(options = {}) {
        this.onProgress = options.onProgress;
    }

    async _readFileChunk(file, start, end) {
        return new Promise((resolve, reject) => {
            const slice = file.slice(start, end);

            const reader = new FileReader();
            reader.onload = () => {
                let buffer = '';
                const bytes = new Uint8Array(reader.result);
                const length = bytes.byteLength;
                for (let i = 0; i < length; i++) {
                    buffer += String.fromCharCode(bytes[i]);
                }
                resolve(buffer);
            };
            reader.onerror = error => reject(error);

            reader.readAsArrayBuffer(slice);
        });
    }

    async readFile(file) {
        let base64 = '';
        //  Make sure this is divisible by 3. Current value = 3mb
        const CHUNK_SIZE = 3145728;
        let startPos = 0;

        while (startPos < file.size) {
            // eslint-disable-next-line no-await-in-loop
            const chunk = await this._readFileChunk(file, startPos, startPos + CHUNK_SIZE);
            base64 += btoa(chunk); //see lint rule require-atomic-updates for why this is in two lines
            startPos += CHUNK_SIZE;
            this.onProgress?.(Math.min((startPos * 100) / file.size, 100));
        }

        return base64;
    }
}
