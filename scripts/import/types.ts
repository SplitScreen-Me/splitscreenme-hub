/**
 * Shapes of the Meteor hub documents the importer reads (Mongo 4.0, database `hubdb`).
 * Everything is optional: legacy documents predate most schema fields, so the mapping never trusts them.
 */

export type MDate = Date | string | number | null | undefined;

export interface MUser {
  _id: string;
  createdAt?: MDate;
  profile?: { username?: unknown; starredHandlers?: unknown };
  emails?: { address?: unknown; verified?: unknown }[];
  services?: {
    password?: { bcrypt?: unknown };
    discord?: { id?: unknown; username?: unknown; email?: unknown; verified?: unknown };
    github?: { id?: unknown; username?: unknown; email?: unknown };
    google?: { id?: unknown; email?: unknown; verified_email?: unknown };
    facebook?: { id?: unknown; email?: unknown };
  };
  roles?: unknown;
}

export interface MHandler {
  _id: string;
  owner?: unknown;
  createdAt?: MDate;
  updatedAt?: MDate;
  title?: unknown;
  description?: unknown;
  gameName?: unknown;
  gameDescription?: unknown;
  gameCover?: unknown;
  gameId?: unknown;
  gameUrl?: unknown;
  genres?: unknown;
  downloadCount?: unknown;
  verified?: unknown;
  private?: unknown;
  publicAuthorized?: unknown;
  lastPublicationAt?: MDate;
  currentVersion?: unknown;
  currentPackage?: unknown;
  reports?: unknown;
  maxPlayers?: unknown;
  playableControllers?: unknown;
  playableMouseKeyboard?: unknown;
  playableMultiMouseKeyboard?: unknown;
}

/** An ostrio:files `packages` document, without `meta.jsContent` (read later, one at a time). */
export interface MPackage {
  _id: string;
  userId?: unknown;
  meta?: {
    handlerId?: unknown;
    handlerVersion?: unknown;
    releaseDescription?: unknown;
    ownerId?: unknown;
    releaseDate?: MDate;
    downloads?: unknown;
    verified?: unknown;
    jsContent?: unknown;
  };
  versions?: { original?: { meta?: { gridFsFileId?: unknown } } };
}

export interface MComment {
  _id: string;
  handlerId?: unknown;
  owner?: unknown;
  content?: unknown;
  createdAt?: MDate;
  replyTo?: unknown;
}

export interface MStat {
  handlerId?: unknown;
  date?: MDate;
  downloads?: unknown;
}
