import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYouTubePlaylistUrl } from '../src/youtube.js';

test('normalizes a YouTube playlist share URL',()=>{
  assert.equal(
    normalizeYouTubePlaylistUrl('https://www.youtube.com/playlist?list=PL1234567890_demo&utm_source=share'),
    'https://www.youtube.com/playlist?list=PL1234567890_demo'
  );
});

test('accepts YouTube links without a scheme and youtu.be links with a list',()=>{
  assert.equal(
    normalizeYouTubePlaylistUrl('youtube.com/playlist?list=PLabcdefghijk'),
    'https://www.youtube.com/playlist?list=PLabcdefghijk'
  );
  assert.equal(
    normalizeYouTubePlaylistUrl('https://youtu.be/video123?list=PLabcdefghijk'),
    'https://www.youtube.com/playlist?list=PLabcdefghijk'
  );
});

test('accepts a YouTube Studio playlist management URL',()=>{
  assert.equal(
    normalizeYouTubePlaylistUrl('https://studio.youtube.com/playlist/PLabcdefghijk/videos'),
    'https://www.youtube.com/playlist?list=PLabcdefghijk'
  );
});

test('rejects non-playlist and non-YouTube URLs',()=>{
  assert.equal(normalizeYouTubePlaylistUrl('https://www.youtube.com/watch?v=video123'),'');
  assert.equal(normalizeYouTubePlaylistUrl('https://example.com/playlist?list=PLabcdefghijk'),'');
});
