// Garment overlays share the body's six-row fabric footprint. C/c are the
// selected cloth and its shadow; o is the contrasting trim, P/p the trousers.
// The head uses a 14px local grid, with eyes at (3,7–8) and (8,7–8).
const garment = (...rows) => rows.map(row => row.padEnd(16, '.'));
const head = (...rows) => rows.map(row => row.padEnd(14, '.'));

export const WARDROBE_OUTFITS = [
  ['tee', 'engine.ot.tee', null],
  ['hoodie', 'engine.ot.hoodie', {
    f: garment('....cc....cc', '....Cco..ocC', '......o..o', '.....cCCCCc', '..cc.cccccc.cc', '....cCCCCccc'),
    b: garment('....cccccccc', '....coCCCCoc', '.....coCCoc', '......cccc', '............c', '....cCCCCccc'),
  }],
  ['shirt', 'engine.ot.shirt', {
    f: garment('.....oo..oo', '......oQQo', '.......RQ', '.......RQ', '........Q', '........c'),
    b: garment('.....oooooo', '......cccc', '', '', '', '....cCCCCccc'),
  }],
  ['border', 'engine.ot.border', {
    f: garment('.....cccccc', '...oooooooooo', '', '..oooooooooooo', '', '....cccccccc'),
    b: garment('.....cccccc', '...oooooooooo', '', '..oooooooooooo', '', '....cccccccc'),
  }],
  ['check', 'engine.ot.check', {
    f: garment('.....oc..co', '.....o....o', '...oocooooco', '.....o....o', '..CoCCCCCCoCcc', '....ccCccCcc'),
    b: garment('.....cccccc', '.....o....o', '...oocooooco', '.....o....o', '..CoCCCCCCoCcc', '....ccCccCcc'),
  }],
  ['cardigan', 'engine.ot.cardigan', {
    f: garment('.....cooooc', '.....CcoocC', '......cooc', '......cooY', '......cooc', '....cCcooYcc'),
    b: garment('.....cccccc', '....c......c', '', '', '', '....cCcCcCcc'),
  }],
  ['jersey', 'engine.ot.jersey', {
    f: garment('.....cc..cc', '...oCCCoCCcco', '..ooCCCoCCocoo', '..ooCCCoCCccoo', '..ooCCCoCCccoo', '....cccocccc'),
    b: garment('.....cccccc', '...oCCCCCCcco', '..ooCCCCCCccoo', '..ooCCCCCCccoo', '..ooCCCCCCccoo', '....cccccccc'),
  }],
  ['aloha', 'engine.ot.aloha', {
    f: garment('.....oc..co', '......o..o', '....o...c.o', '...oYo..coYo', '....o...c.o', '........c'),
    b: garment('.....cccccc', '', '....o.....o', '...oYo...oYo', '....o.....o', '....cCCCCccc'),
  }],
  ['blazer', 'engine.ot.blazer', {
    f: garment('.....cooooc', '.....ocooco', '......occo', '....cc..c.cc', '........Y', '....cCCCcCcc'),
    b: garment('.....cccccc', '....c......c', '........c', '........c', '........c', '....cCCCcCcc'),
  }],
  ['knit', 'engine.ot.knit', {
    f: garment('.....cCcCcc', '....c......c', '...c..cCCc..c', '......CccC', '..cc..cCCc..cc', '....cCcCcCcc'),
    b: garment('.....cCcCcc', '....c......c', '...c........c', '', '..cc........cc', '....cCcCcCcc'),
  }],
  ['polo', 'engine.ot.polo', {
    f: garment('.....oo..oo', '......ocCo', '.......co', '..cc...o....cc', '', '....cCCCCccc'),
    b: garment('.....oooooo', '......cccc', '', '..cc........cc', '', '....cCCCCccc'),
  }],
  ['overalls', 'engine.ot.overalls', {
    f: garment('.....P....p', '.....Y....Y', '.....PPPPPp', '....PPpppPPp', '....PPPPpPPp', '....PPppPPPp'),
    b: garment('.....P....p', '......P..p', '.......Pp', '....PPPPPPPp', '....PPPPPPPp', '....PPppPPPp'),
  }],
  ['vest', 'engine.ot.vest', {
    f: garment('.....CoooCc', '...oooCooCooo', '..ooocCccCcooo', '..ooocCCYCCooo', '..ooocCCcCCooo', '....cCCCcCcc'),
    b: garment('.....cccccc', '...oooCCCCooo', '..ooocCCCCcooo', '..ooocCCCCcooo', '..ooocCCCCcooo', '....cCCCCccc'),
  }],
  ['sailor', 'engine.ot.sailor', {
    f: garment('....ooccccoo', '.....ooCCoo', '......oQQo', '..oo...RQ...oo', '', '....cCCCCccc'),
    b: garment('....oooooooo', '....oCCCCCCo', '....oCCCCCCo', '..oooooooooooo', '', '....cCCCCccc'),
  }],
];

// Frame rims surround the two-pixel eyes rather than painting over them.
// Hat silhouettes stay within the dress preview, including the outline pixel.
export const WARDROBE_ACCS = [
  ['none', 'engine.ac.none', null],
  ['glasses', 'engine.ac.glasses', { y: 6, f: head('..nnn..nnn', '.n...nn...n', '.n...n....n', '..nnn..nnn') }],
  ['round', 'engine.ac.round', { y: 6, f: head('..III..III', '.I...II...I', '.I...I....I', '..III..III') }],
  ['sunglasses', 'engine.ac.sunglasses', { y: 7, f: head('.kNNNkkNNNk', '..NBN..NBN') }],
  ['cap', 'engine.ac.cap', { y: -1, x: -1, hat: true,
    f: ['......RRRR......', '....R<RRRRQQ....', '...R<RRRRRRQQ...', '..RRRRRWRRRQQQ..', '..QQQQQQQQQQQQ..', '...kRRRRRRRRQQQ.'],
    b: ['......RRRR......', '....R<RRRRQQ....', '...R<RRRRRRQQ...', '..RRRRRRRRRQQQ..', '..QQQQQQQQQQQQ..', '...QQQQkkQQQQ...'],
  }],
  ['knit', 'engine.ac.knit', { y: -3, x: -1, hat: true,
    f: ['.......WW.......', '......WVVW......', '.....BBBBNN.....', '....BHBHBNNN....', '...BBHBBBNNNN...', '..BBBBBBBNNNNN..', '..NNBNBNBNBNNN..', '...NNNNNNNNNN...'],
    b: ['.......WW.......', '......WVVW......', '.....BBBBNN.....', '....BHBHBNNN....', '...BBHBBBNNNN...', '..BBBBBBBNNNNN..', '..NNBNBNBNBNNN..', '...NNNNNNNNNN...'],
  }],
  ['phones', 'engine.ac.phones', { y: -1, x: -1,
    f: ['.....nlllln.....', '...nnkkkkkknn...', '..nk........kn..', '.nk..........kn.', '.k............k.', '.k............k.', 'kn............nk', 'nBQ..........QBn', 'nNQ..........QNn', '.kk..........kk.'],
    b: ['.....nlllln.....', '...nnkkkkkknn...', '..nk........kn..', '.nk..........kn.', '.k............k.', '.k............k.', 'kn............nk', 'nBQ..........QBn', 'nNQ..........QNn', '.kk..........kk.'],
  }],
  ['beret', 'engine.ac.beret', { y: -2, x: -1, hat: true,
    f: ['.........Q......', '....RRRRRRQ.....', '..R<RRRRRRRQQ...', '.R<RRRRRRRRQQQ..', '..QQQQQQQQQQQk..', '...QQQQQQQQQk...'],
    b: ['......Q.........', '...RRRRRRRQQ....', '..R<RRRRRRRQQQ..', '.R<RRRRRRRRQQQQ.', '..kQQQQQQQQQQQ..', '...kQQQQQQQQQ...'],
  }],
  ['ribbon', 'engine.ac.ribbon', { y: 0,
    f: head('........CC..CC', '........CoCCoc', '.........cCCc', '.........C..c'),
    b: head('CC..CC', 'CoCCoc', '.cCCc', '.C..c'),
  }],
  ['beard', 'engine.ac.beard', { y: 9, f: head('..h.HHHH.h', '...hHssHh', '....hHHh') }],
  ['mask', 'engine.ac.mask', { y: 9, f: head('.lWWWWWWWWl', '..WVWWWWVW', '...lVVVVl') }],
  ['cat', 'engine.ac.cat', { y: -3,
    f: head('..H.......H', '..Hh.....hH', '..H+h...h+H', '..Hhh...hhH'),
    b: head('..H.......H', '..Hh.....hH', '..HHh...hHH', '..Hhh...hhH'),
  }],
  ['hairpin', 'engine.ac.hairpin', { y: 3,
    f: head('.........YYY', '..........OOY', '...........YO'),
    b: head('.........YYY', '..........OOY', '...........YO'),
  }],
  ['earrings', 'engine.ac.earrings', { y: 9,
    f: head('.Y.........Y', '.I.........I', '.YO.......OY'),
    b: head('.Y.........Y', '.I.........I', '.YO.......OY'),
  }],
  ['scarf', 'engine.ac.scarf', { y: 12, x: -1,
    f: ['....BBHHBBNN....', '...BBBNNNNNNN...', '......BNBN......', '......BNBN......', '......HNNN......'],
    b: ['....BBHHBBNN....', '...BBBNNNNNNN...', '.....NNNNN......'],
  }],
  ['bucket', 'engine.ac.bucket', { y: -2, x: -1, hat: true,
    f: ['.....gggggg.....', '....gfgggggh....', '....gggggggh....', '...hhhhhhhhhh...', '..gggggggggghh..', '.ghhhhhhhhhhhhh.'],
    b: ['.....gggggg.....', '....gfgggggh....', '....gggggggh....', '...hhhhhhhhhh...', '..gggggggggghh..', '.ghhhhhhhhhhhhh.'],
  }],
  ['hairband', 'engine.ac.hairband', { y: 1,
    f: head('....CCCCCc', '...CoCCCCcc', '..CC......cc', '..C........c'),
    b: head('....CCCCCc', '...CoCCCCcc', '..CC......cc', '..C........c'),
  }],
  ['flowerclip', 'engine.ac.flowerclip', { y: 2,
    f: head('..........++', '.........+Y++', '..........++', '...........q', '..........qr'),
    b: head('..........++', '.........+Y++', '..........++', '...........q', '..........qr'),
  }],
];
