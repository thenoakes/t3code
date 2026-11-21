// Language servers speak JSON-RPC over stdio, each message preceded by headers and a blank line:
// `Content-Length: <bytes>\r\n\r\n<UTF-8 JSON>`.

const encoder = new TextEncoder();
const HEADER_END = encoder.encode("\r\n\r\n");

/** Frames one serialized JSON-RPC message for a language server's stdin. */
export function encodeLanguageServerMessage(message: string): Uint8Array {
  const body = encoder.encode(message);
  const header = encoder.encode(`Content-Length: ${body.byteLength}\r\n\r\n`);
  const framed = new Uint8Array(header.byteLength + body.byteLength);
  framed.set(header, 0);
  framed.set(body, header.byteLength);
  return framed;
}

function indexOfHeaderEnd(buffer: Uint8Array, length: number): number {
  outer: for (let index = 0; index + HEADER_END.length <= length; index += 1) {
    for (let offset = 0; offset < HEADER_END.length; offset += 1) {
      if (buffer[index + offset] !== HEADER_END[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

/** Splits a language server's stdout into serialized messages, across arbitrary chunk edges. */
export class LanguageServerMessageDecoder {
  private buffer = new Uint8Array(64 * 1024);
  private length = 0;
  private readonly decoder = new TextDecoder();

  push(chunk: Uint8Array): string[] {
    this.append(chunk);
    const messages: string[] = [];
    for (;;) {
      const headerEnd = indexOfHeaderEnd(this.buffer, this.length);
      if (headerEnd < 0) break;
      const headers = this.decoder.decode(this.buffer.subarray(0, headerEnd));
      const match = /^content-length:\s*(\d+)\s*$/im.exec(headers);
      const bodyStart = headerEnd + HEADER_END.length;
      if (!match?.[1]) {
        // A header block without a length cannot be framed; drop it and resynchronize.
        this.consume(bodyStart);
        continue;
      }
      const bodyEnd = bodyStart + Number(match[1]);
      if (this.length < bodyEnd) break;
      messages.push(this.decoder.decode(this.buffer.subarray(bodyStart, bodyEnd)));
      this.consume(bodyEnd);
    }
    return messages;
  }

  private append(chunk: Uint8Array): void {
    if (this.length + chunk.byteLength > this.buffer.byteLength) {
      const grown = new Uint8Array(
        Math.max(this.buffer.byteLength * 2, this.length + chunk.byteLength),
      );
      grown.set(this.buffer.subarray(0, this.length));
      this.buffer = grown;
    }
    this.buffer.set(chunk, this.length);
    this.length += chunk.byteLength;
  }

  private consume(byteCount: number): void {
    this.buffer.copyWithin(0, byteCount, this.length);
    this.length -= byteCount;
  }
}
