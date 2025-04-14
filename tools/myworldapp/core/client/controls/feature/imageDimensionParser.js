// Copyright: IQGeo Limited 2010-2023
/* eslint-disable no-await-in-loop */
const PNG_HEADER = [137, 80, 78, 71, 13, 10, 26, 10];
const JPG_TAGS = {
    0xd8: 'SOI',
    0xc0: 'SOF0',
    0xc2: 'SOF2',
    0xc4: 'DHT',
    0xdb: 'DQT',
    0xdd: 'DRI',
    0xda: 'SOS',
    0xfe: 'COM',
    0xe0: 'APP0',
    0xe1: 'APP1',
    0xd9: 'EOI'
};

for (let i = 0; i <= 7; ++i) {
    JPG_TAGS[0xd0 + i] = 'RST';
}

for (let i = 2; i <= 0x0f; ++i) {
    JPG_TAGS[0xe0 + i] = 'APP';
}

/**
 * Class that is used to determine the height, width, and the Orientation if its in the EXIF data
 */
export class ImageDimensionParser {
    /**
     * Accepts a File or a Blob to a file and determines the width, height and EXIF Orientation. Throws an error if its not a PNG or a JPEG
     * @param {File} file Either a File or a Blob that points to the PNG or JPEG file to parse
     */
    async getDimensions(file) {
        const bytes = await this._getFileBytes(file, 0, 8);
        return new Promise((resolve, reject) => {
            //  Check if this is a png
            let valid = true;
            for (let i = 0; i < PNG_HEADER.length; ++i) {
                if (bytes[i] != PNG_HEADER[i]) {
                    valid = false;
                    break;
                }
            }

            if (valid) {
                resolve(this._png_getDimensions(file));
            }

            //  Check if this is a jpg
            if (bytes[0] == 0xff && JPG_TAGS[bytes[1]] == 'SOI') {
                resolve(this._jpg_getDimensions(file));
            }

            reject(new Error('Invalid file format'));
        });
    }

    //  Converts two Uint8 bytes into a Uint16
    _Uint8ToUint16(b1, b2, littleEndian = false) {
        if (littleEndian) {
            return (b2 << 8) + b1;
        } else {
            return (b1 << 8) + b2;
        }
    }

    //  Converts four Uint8 bytes into a Uint32
    _Uint8ToUint32(b1, b2, b3, b4, littleEndian = false) {
        if (littleEndian) {
            return (b4 << 24) + (b3 << 16) + (b2 << 8) + b1;
        } else {
            return (b1 << 24) + (b2 << 16) + (b3 << 8) + b4;
        }
    }

    //  Gets a small chunk of the file
    async _getFileBytes(file, start, count) {
        return new Promise((resolve, reject) => {
            const slice = file.slice(start, start + count);
            const reader = new FileReader();
            reader.onload = event => {
                const bytes = new Uint8Array(reader.result);
                resolve(bytes);
            };
            reader.readAsArrayBuffer(slice);
        });
    }

    /*  Reads the PNG using the following method:
      From the start of the file, look for the IHDR chunk. Once found, return the width and height.
      Return a null for the EXIF data
      Skips parsing of all other chunks
      ENH: PNG Specification 1.2 adds support for EXIF data, implement this
  */
    async _png_getDimensions(file) {
        let start = 8;
        while (start < file.size) {
            //  Chunk length is stored in the first 4 bytes of a chunk, the chunk ID is in the next
            const bytes = await this._getFileBytes(file, start, 8);
            start += 8;
            // IHDR
            if (bytes[4] == 0x49 && bytes[5] == 0x48 && bytes[6] == 0x44 && bytes[7] == 0x52) {
                //  Grab the first 8 bytes of this chunk, which contains the width and height. Parse and return them
                const sizeBytes = await this._getFileBytes(file, start, 8);
                const width = this._Uint8ToUint32(
                    sizeBytes[0],
                    sizeBytes[1],
                    sizeBytes[2],
                    sizeBytes[3]
                );
                const height = this._Uint8ToUint32(
                    sizeBytes[4],
                    sizeBytes[5],
                    sizeBytes[6],
                    sizeBytes[7]
                );
                return { height, width, exif: null };
            } else {
                const length = this._Uint8ToUint32(bytes[0], bytes[1], bytes[2], bytes[3]);
                start += length + 4; // Skip the chunk length, and add +4 to account for the CRC
            }
        }
        throw new Error('Got to end of file without finding size');
    }

    /*  Extracts the exif value from the presented bytes (Give this function the whole tag)
      [0-1]: Tag ID
      [2-3]: Data format
      [4-7]: Number of components
      [8-11]: Value
  */
    _extractEXIFValue(bytes, littleEndian = false) {
        const dataType = this._Uint8ToUint16(bytes[2], bytes[3], littleEndian);
        switch (dataType) {
            case 1: // Unsigned byte
            case 6: // Signed byte
                return bytes[0];
            case 3: //  Unsigned short
            case 8: //  Signed short
                return this._Uint8ToUint16(bytes[8], bytes[9], littleEndian);
            case 4: //  Unsigned long
            case 9: //  Signed long
                return this._Uint8ToUint32(bytes[8], bytes[9], bytes[10], bytes[11], littleEndian);
        }
    }

    /*  Extracts the Orientation from the provided EXIF chunk
      [0-1]: Byte Order: II = Little Endian, MM = Big Endian
      [2-3]: Constant: 0x2A00
      [4-7]: Offset to the first EXIF data block

      For each EXIF block:
      [0-1]: Number of components, E
      [2-(2 + 12E)]: Tag Block
      [(2+12E)-(5+12E)]: Pointer to the next EXIF block
  */
    _extractExifInfo(bytes) {
        let exif = null;
        const littleEndian = bytes[0] == 'I'.charCodeAt(0);
        let dataOffset = this._Uint8ToUint32(bytes[4], bytes[5], bytes[6], bytes[7], littleEndian);
        while (dataOffset != 0x00000000) {
            const componentCount = this._Uint8ToUint16(
                bytes[dataOffset],
                bytes[dataOffset + 1],
                littleEndian
            );
            dataOffset += 2;
            for (let componentNum = 0; componentNum < componentCount; ++componentNum) {
                const tagNumber = this._Uint8ToUint16(
                    bytes[dataOffset],
                    bytes[dataOffset + 1],
                    littleEndian
                );

                //  We only care about the orientation tag, so check it here
                if (tagNumber == 0x0112) {
                    const value = this._extractEXIFValue(
                        bytes.slice(dataOffset, dataOffset + 12),
                        littleEndian
                    );
                    exif = {
                        Orientation: value
                    };
                    return exif;
                }
                dataOffset += 12;
            }

            dataOffset = this._Uint8ToUint32(
                bytes[dataOffset],
                bytes[dataOffset + 1],
                bytes[dataOffset + 2],
                bytes[dataOffset + 3],
                littleEndian
            );
        }
        return exif;
    }

    /*  Extracts the JPEG using the following method:
      Iterate though the tags and return ehwn we get to the SOF0 or SOF2 tag
   */
    async _jpg_getDimensions(file) {
        let start = 2;
        let exif = null;
        while (start < file.size) {
            const bytes = await this._getFileBytes(file, start, 4);
            start += 2;
            if (bytes[0] != 0xff) {
                throw new Error(
                    'Unexpected byte in ' +
                        file.name +
                        ' (Expected 0xFF, got ' +
                        bytes[0].toString(16)
                );
            } else {
                switch (JPG_TAGS[bytes[1]]) {
                    //  This tag has the width and height in them. We should have the exif by now if its present, so return at the end
                    case 'SOF0':
                    case 'SOF2': {
                        const sizeBytes = await this._getFileBytes(file, start + 3, 4);
                        const height = this._Uint8ToUint16(sizeBytes[0], sizeBytes[1]);
                        const width = this._Uint8ToUint16(sizeBytes[2], sizeBytes[3]);
                        return { height, width, exif };
                    }
                    case 'APP1': {
                        //  The EXIF tag is stored in the APP1 tag. Check for it here and if its there, parse it
                        const app1Size = this._Uint8ToUint16(bytes[2], bytes[3]);
                        let app1Bytes = await this._getFileBytes(file, start + 2, app1Size);
                        start += app1Size;

                        if (
                            //  Exif
                            app1Bytes[0] == 0x45 &&
                            app1Bytes[1] == 0x78 &&
                            app1Bytes[2] == 0x69 &&
                            app1Bytes[3] == 0x66 &&
                            app1Bytes[4] == 0x00 &&
                            app1Bytes[5] == 0x00
                        ) {
                            exif = this._extractExifInfo(app1Bytes.slice(6));
                        }
                        break;
                    }
                    //  We don't care about any other tags, skip them
                    case 'APP':
                    case 'APP0':
                    case 'DHT':
                    case 'DQT':
                    case 'SOS':
                    case 'DRI':
                    case 'COM':
                        start += this._Uint8ToUint16(bytes[2], bytes[3]);
                        break;

                    case 'RST':
                        break;

                    case 'EOI':
                        throw new Error('Got to end of file without finding size');

                    default:
                        throw new Error('Unhandled byte: ' + bytes[1].toString(16));
                }
            }
        }
        throw new Error('Got to end of file without finding size');
    }
}
