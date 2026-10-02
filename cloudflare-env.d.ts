declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    SESSION_DESK_AUTH_BOUNDARY?: string;
    SESSION_DESK_ORIGIN?: string;
    SESSION_DESK_ENABLE_BRIDGE?: string;
    BUCKET?: R2Bucket;
  }
}
