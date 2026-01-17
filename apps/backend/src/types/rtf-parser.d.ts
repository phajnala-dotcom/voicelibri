declare module 'rtf-parser' {
  interface RtfDocument {
    content: RtfNode[];
    style?: Record<string, any>;
  }

  interface RtfNode {
    content?: RtfNode[] | string[];
    value?: string;
    style?: Record<string, any>;
  }

  type RtfCallback = (err: Error | null, doc: RtfDocument) => void;

  export function string(rtf: string, callback: RtfCallback): void;
  export function stream(): NodeJS.WritableStream;
}
