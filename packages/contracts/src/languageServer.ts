import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/** Languages the server can start a language server for. */
export const LanguageServerLanguage = Schema.Literals(["typescript"]);
export type LanguageServerLanguage = typeof LanguageServerLanguage.Type;

// One JSON-RPC message, serialized. Completion lists for large projects run to a few MB.
const LanguageServerMessage = Schema.String.check(Schema.isMaxLength(16 * 1024 * 1024));

export const LanguageServerConnectInput = Schema.Struct({
  /** The workspace root on the server's machine; the language server runs there. */
  cwd: TrimmedNonEmptyString,
  language: LanguageServerLanguage,
});
export type LanguageServerConnectInput = typeof LanguageServerConnectInput.Type;

export const LanguageServerSendInput = Schema.Struct({
  sessionId: TrimmedNonEmptyString,
  message: LanguageServerMessage,
});
export type LanguageServerSendInput = typeof LanguageServerSendInput.Type;

/** The language server is running; `sessionId` addresses `languageServer.send`. */
export const LanguageServerStartedEvent = Schema.Struct({
  type: Schema.Literal("started"),
  sessionId: TrimmedNonEmptyString,
  command: Schema.String,
  /**
   * Options the client should merge into its `initialize` request's `initializationOptions`,
   * such as the TypeScript install to use when the workspace has none of its own.
   */
  initializationOptions: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

/** One JSON-RPC message from the language server, serialized. */
export const LanguageServerMessageEvent = Schema.Struct({
  type: Schema.Literal("message"),
  message: LanguageServerMessage,
});

/** The language server stopped; the stream ends after this. */
export const LanguageServerExitedEvent = Schema.Struct({
  type: Schema.Literal("exited"),
  exitCode: Schema.NullOr(Schema.Int),
  /** The end of its stderr, for a server that failed to start. */
  stderr: Schema.String,
});

export const LanguageServerConnectEvent = Schema.Union([
  LanguageServerStartedEvent,
  LanguageServerMessageEvent,
  LanguageServerExitedEvent,
]);
export type LanguageServerConnectEvent = typeof LanguageServerConnectEvent.Type;

export class LanguageServerNotFoundError extends Schema.TaggedError<LanguageServerNotFoundError>()(
  "LanguageServerNotFoundError",
  {
    language: LanguageServerLanguage,
    command: Schema.String,
  },
) {
  override get message() {
    return `No ${this.language} language server found. Install ${this.command}, for example with \`npm install -g typescript-language-server typescript\`.`;
  }
}

export class LanguageServerStartError extends Schema.TaggedError<LanguageServerStartError>()(
  "LanguageServerStartError",
  {
    language: LanguageServerLanguage,
    cwd: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return `Failed to start the ${this.language} language server in ${this.cwd}.`;
  }
}

export class LanguageServerSessionNotFoundError extends Schema.TaggedError<LanguageServerSessionNotFoundError>()(
  "LanguageServerSessionNotFoundError",
  { sessionId: Schema.String },
) {
  override get message() {
    return `Language server session ${this.sessionId} is not running.`;
  }
}

export const LanguageServerError = Schema.Union([
  LanguageServerNotFoundError,
  LanguageServerStartError,
  LanguageServerSessionNotFoundError,
]);
export type LanguageServerError = typeof LanguageServerError.Type;
