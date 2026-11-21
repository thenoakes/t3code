import { describe, expect, it } from "vite-plus/test";

import { encodeLanguageServerMessage, LanguageServerMessageDecoder } from "./framing.ts";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("language server framing", () => {
  it("frames a message with its UTF-8 byte length", () => {
    expect(text(encodeLanguageServerMessage('{"a":"é"}'))).toBe(
      'Content-Length: 10\r\n\r\n{"a":"é"}',
    );
  });

  it("splits messages across arbitrary chunk edges, including inside a character", () => {
    const stream = new Uint8Array([
      ...encodeLanguageServerMessage('{"id":1,"result":"ü"}'),
      ...encodeLanguageServerMessage('{"id":2}'),
    ]);
    for (const size of [1, 3, 7, stream.byteLength]) {
      const decoder = new LanguageServerMessageDecoder();
      const messages: string[] = [];
      for (let start = 0; start < stream.byteLength; start += size) {
        messages.push(...decoder.push(stream.subarray(start, start + size)));
      }
      expect(messages).toEqual(['{"id":1,"result":"ü"}', '{"id":2}']);
    }
  });

  it("reads extra headers and skips a block without a length", () => {
    const decoder = new LanguageServerMessageDecoder();
    const input = new TextEncoder().encode(
      "X-Junk: 1\r\n\r\nContent-Type: application/vscode-jsonrpc\r\ncontent-length: 2\r\n\r\n{}",
    );
    expect(decoder.push(input)).toEqual(["{}"]);
  });
});
