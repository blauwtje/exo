import { search as arxiv } from './arxiv.mjs';
import { search as github } from './github.mjs';
import { search as hn } from './hn.mjs';
import { search as podcast } from './podcast.mjs';
import { search as reddit } from './reddit.mjs';
import { search as stackoverflow } from './stackoverflow.mjs';
import { search as wikipedia } from './wikipedia.mjs';

export const SOURCES = { arxiv, github, hn, podcast, reddit, stackoverflow, wikipedia };
