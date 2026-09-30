export interface CatalogOption {
  /** Stable within a version: o1..o6. */
  id: string;
  text: string;
}

export interface CatalogVersion {
  version: number;
  prompt: string;
  options: CatalogOption[];
  /** Why this version exists (for version 2+). */
  note?: string;
}

export type CatalogStatus = "approved" | "retired" | "excluded";

export interface CatalogQuestion {
  /** Stable id carried over from the original library (q001…). */
  id: string;
  topic: string | null;
  tags: string[];
  /** Spoiler-tagged questions can be excluded by a room. */
  spoiler: boolean;
  spoilerNote?: string;
  status: CatalogStatus;
  note?: string;
  /** Ordered oldest → newest. The last entry is the active version. */
  versions: CatalogVersion[];
}

/** A question resolved to one immutable version, ready to deal. */
export interface ResolvedQuestion {
  id: string;
  version: number;
  versionId: string;
  prompt: string;
  options: CatalogOption[];
  topic: string | null;
  tags: string[];
  spoiler: boolean;
  status: CatalogStatus;
}
