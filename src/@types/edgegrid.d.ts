/**
 * Type declarations for edgegrid module
 */
declare module 'edgegrid' {
  interface EdgeGridConfig {
    path: string;
    clientToken: string;
    clientSecret: string;
    accessToken: string;
    debug?: boolean;
  }

  interface EdgeGridOptions {
    path: string;
    method: string;
    body?: string;
    headers?: Record<string, string>;
  }

  type EdgeGridCallback = (error: any, response: any, body: any) => void;

  class EdgeGrid {
    constructor(config: EdgeGridConfig);
    auth(options: EdgeGridOptions): void;
    send(callback: EdgeGridCallback): any;
  }

  export = EdgeGrid;
}
