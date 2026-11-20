import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('keeps the player star as its own button and writes the roster directly', () => {
  const card = main.slice(main.indexOf('return `<div class="person card2'), main.indexOf('</span></div>`;', main.indexOf('favorite-star')));
  assert.match(card, /role="button" tabindex="0"/);
  assert.match(card, /<button type="button" class="favorite-star" data-fav=/);
  assert.doesNotMatch(card, /<span class="favorite-star"/);
  const handler = main.slice(main.indexOf("all('[data-fav]')"), main.indexOf("all('[data-note-toggle]')"));
  assert.match(handler, /await saveSelfPlayer\(\{id:p\.id,favorite:p\.favorite\}\)/);
  assert.doesNotMatch(handler, /saveSoon\(/);
  const starRule = styles.slice(styles.indexOf('#app .person.card2 .favorite-star,#app .birthday-player-card>.favorite-star{'));
  assert.match(starRule, /position:absolute/);
  assert.match(starRule, /z-index:3/);
  assert.match(starRule, /min-width:44px/);
  assert.match(starRule, /min-height:44px/);
  assert.match(main, /Number\(b\.id===ownId\)-Number\(a\.id===ownId\)\|\|Number\(b\.favorite\)-Number\(a\.favorite\)/);
  assert.match(styles, /#app \.person\.card2 \.status-mini\{[^}]*white-space:normal/);
  assert.match(styles, /#app \.person\.card2 \.status-mini\{[^}]*text-overflow:clip/);
});

