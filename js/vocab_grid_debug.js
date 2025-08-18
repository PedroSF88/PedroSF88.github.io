// This file will be used to log the output of the vocab grid masking logic for debugging.
console.log('vocab grid debug loaded');

function debugVocabGridMasks() {
  var cards = Array.prototype.slice.call(document.querySelectorAll('.vocab-grid-cell'));
  var versions = ['A','B','C'];
  cards.forEach(function(card, idx){
    var log = {row: idx, pA: card.dataset.pA, pB: card.dataset.pB, pC: card.dataset.pC};
    versions.forEach(function(v){
      var only = card.dataset['p'+v];
      var slots = card.querySelectorAll('.slot');
      log['visible_'+v] = [];
      slots.forEach(function(slot){
        var col = slot.getAttribute('data-col');
        var filled = slot.querySelector('.filled');
        if (col === only && filled && filled.style.display !== 'none') {
          log['visible_'+v].push(col);
        }
      });
    });
    console.log('Vocab row', idx, log);
  });
}

window.debugVocabGridMasks = debugVocabGridMasks;
