import type { ArchiveId } from '../core/types.ts';

/** A Wayback-compatible web archive: where to query captures and where to replay them. */
export interface Archive {
  id: ArchiveId;
  /** Human-readable name, shown in the UI ("Captures from <name>"). */
  name: string;
  home: string;
  /** CDX endpoint. */
  cdx: string;
  /** `output=json` dialect: IA returns an array of arrays, pywb (Arquivo.pt) newline-delimited objects. */
  cdxFormat: 'json' | 'ndjson';
  /** Replay base; append `<ts>[id_]/<url>`. */
  replay: string;
}

/** Archives Pagelapse can read from. */
export const ARCHIVES: Readonly<Record<ArchiveId, Archive>> = {
  'internet-archive': {
    id: 'internet-archive',
    name: 'the Internet Archive Wayback Machine',
    home: 'https://web.archive.org/',
    cdx: 'https://web.archive.org/cdx/search/cdx',
    cdxFormat: 'json',
    replay: 'https://web.archive.org/web/',
  },
  'arquivo-pt': {
    id: 'arquivo-pt',
    name: 'Arquivo.pt',
    home: 'https://arquivo.pt/',
    cdx: 'https://arquivo.pt/wayback/cdx',
    cdxFormat: 'ndjson',
    replay: 'https://arquivo.pt/wayback/',
  },
};

/** All archive ids, in a stable order (useful for validation and CLI flags). */
export const ARCHIVE_IDS = Object.keys(ARCHIVES) as ArchiveId[];
