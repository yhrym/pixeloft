// Hand-pixelled hair, lit from the upper left. H=body, h=shadow, j=light.
// Every hairstyle is composed over the same face so eyes, ears, chin and neck
// stay aligned with glasses, expressions and the 16px body in both directions.
const FACE = [
  '..............',
  '..............',
  '....SSSSSS....',
  '..SSSSSSSSss..',
  '.SSSSSSSSSSss.',
  '.SSSSSSSSSSss.',
  'sSSSSSSSSSSSss',
  'sSSKSSSSKSSSss',
  '.SSKSSSSKSSss.',
  '..SSSSSSSSss..',
  '...SSSSSSss...',
  '....ssssss....',
];
const NAPE = [
  '..............', '..............', '..............', '..............',
  '..............', '..............', 's............s', 's............s',
  '.s..........s.', '..sSSSSSSSss..', '...SSSSSSss...', '....ssssss....',
];
const cap = {
  short: [
    '....jHHHH.....', '..jjjHHHHHH...', '.HjjHHHHHHHh..', '.HHHHHHHHHHhh.',
    'HHHHHHHHHHHHhh', 'HHHHhHHhHHHHhh', 'Hh...h....Hhh.', 'h..........h..',
  ],
  messy: [
    '...jHH..HH....', '..jjHHHHHHH...', '.HjHHHHHHHHHh.', 'HHHHHHHHHHHHhh',
    '.HHHHHHHHHHHhh', 'HHHhHHHHhHHHh.', 'hH..hH....Hhh.', 'h..........h..',
  ],
  bob: [
    '....jHHHH.....', '..jjjHHHHHH...', '.HjjHHHHHHHHh.', 'HHHHHHHHHHHHhh',
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHHhh', 'HHhhhhhHhhhHhh', 'Hh.........Hhh',
    'Hh.........Hhh', 'Hh.........Hhh', '.Hh.......Hhh.', '..hh......hh..',
  ],
  long: [
    '....jHHHH.....', '..jjjHHHHHH...', '.HjjHHHHHHHHh.', '.HHHHHHHHHHHhh',
    'HHHHHHHHHHHHhh', 'HHHhHHHHhHHHhh', 'Hh..hH....HHhh', 'Hh.........Hhh',
    'Hh.........Hhh', 'Hh.........Hhh', 'Hjh........Hhh', 'Hjh........Hhh',
    'HHh........Hhh', '.Hh........hh.', '.hh........hh.',
  ],
  pony: [
    '....jHHHH.....', '..jjjHHHHHH...', '.HjjHHHHHHHHh.', '.HHHHHHHHHHHhh',
    'HHHHHHHHHHHHhR', 'HHHhHHHhHHHHhR', 'Hh..h.....HhhH', 'h..........hHh',
    '............Hh', '............Hh', '............Hh', '............hh',
    '.............h',
  ],
  bun: [
    '.....jHHh.....', '....jjHHHh....', '....hHHhhh....', '.....hhhh.....',
    '...jjHHHHH....', '..jjHHHHHHH...', '.HjHHHHHHHHHh.', '.HHHHHHHHHHHhh',
    'HHHHHHHHHHHHhh', 'HhHHhHHhHHHHhh', 'h...h.....Hhh.', 'h..........h..',
  ],
  buzz: [
    '..............', '..............', '....jjHHHH....', '..jjHHHHHHhh..',
    '.HHHHHHHHHHhh.', '.hhhHHHHHHhhh.', '.h..........h.',
  ],
  twoblock: [
    '...jjHHHH.....', '..jjjHHHHHH...', '.HjjHHHHHHHHh.', '.HHHHHHHHHHHhh',
    '.HHHHHHHHHHHhh', '.hHHHHHhHHHhh.', '.hh...h....hh.',
  ],
  center: [
    '...jjHHhHH....', '..jjHHHhHHH...', '.HjHHHHhHHHHh.', 'HHHHHHhSHHHHhh',
    'HHHHHhSSSHHHhh', 'HHHHhSSSSSHHhh', 'HhHh.......Hhh', 'Hh.........Hhh',
    'hh.........Hhh', '.h..........h.',
  ],
  side: [
    '....jjHHHH....', '..jjjHHHHHH...', '.HjjHHHHHhHHh.', '.HHHHHHHhHHHhh',
    'HHHHHHHhHHHHhh', 'HHHHHhh..HHHhh', 'Hhh.......Hhh.', 'h..........h..',
  ],
  mash: [
    '....jjHHHH....', '..jjjHHHHHH...', '.HjjHHHHHHHHh.', 'HHHHHHHHHHHHhh',
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHHhh', 'Hhhhhhhhhhhhhh', 'hh.........hh.',
    '.h.........h..',
  ],
  wolf: [
    '...jjHHHH.....', '..jjHHHHHHHH..', '.HjHHHHHHHHHh.', 'HHHHHHHHHHHHhh',
    '.HHHHHHHHHHHhh', 'HHHhHHHHhHHHhh', 'Hh..hH...hHHh.', 'Hh.........Hhh',
    'hh.........hh.', 'Hh.........Hhh', '.Hh.......Hhh.', '..h.......hh..',
    '...h......h...',
  ],
  braid: [
    '....jjHHHH....', '..jjjHHHHHH...', '.HjjHHHHHHHHh.', '.HHHHHHHHHHHhh',
    'HHHHHHHHHHHHhh', 'HHHHHHhHHHHHhh', 'Hh..hh....HHhh', 'h..........Hhh',
    '...........Hhh', '...........Hhh', '...........Hhh', '...........Hh.',
    '..........jHh.', '..........hHh.', '..........Hhh.', '...........RR.',
  ],
  halfup: [
    '.....jHHh.....', '....jjHHHh....', '..jjHHHHHHHH..', '.HjHHHHHHHHHh.',
    '.HHHHHHHHHHHhh', 'HHHHHHHHHHHHhh', 'HHHHhHHHHHHHhh', 'Hh..hHH...HHhh',
    'Hh.........Hhh', 'Hh.........Hhh', 'Hh.........Hhh', 'Hjh........Hhh',
    'HHh........Hhh', '.Hh........hh.', '.hh........hh.',
  ],
  hime: [
    '....jjHHHH....', '..jjjHHHHHH...', '.HjjHHHHHHHHh.', 'HHHHHHHHHHHHhh',
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHHhh', 'HHhhhhhhhhhHhh', 'HHh........Hhh',
    'HHh........Hhh', 'hhh........hhh', 'Hh..........hh', 'Hjh.........hh',
    'HHh.........hh', 'hhh.........hh',
  ],
  curly: [
    '...jHH.HHH....', '.jjjHHHHHHHh..', 'jHHHHHHHHHHHh.', 'HHHHhHHHHHHHhh',
    '.HhHHHHhHHHHh.', 'HHHHhHHHHhHHhh', 'Hhh.Hh....HHhh', 'Hh.........Hhh',
    'hH.........hHh', 'HHh........Hhh', '.hh........hh.',
  ],
  spiky: [
    '...jH...HH....', '..jjH.HHHH.H..', '.jjHHHHHHHHHh.', 'HHHHHHHHHHHHhh',
    '.HHHHHHHHHHHh.', 'HHHHhHHhHHHhh.', '.h..h.....Hh..',
  ],
  pixie: [
    '....jjHHH.....', '..jjjHHHHHH...', '.HjjHHHHHHHHh.', '.HHHHHHHHHHHhh',
    '.HHHHHHHHHHHh.', '.HHHHHHHhHHhh.', '.HhHHhhh..hh..', '.h.........h..',
  ],
  lowbun: [
    '....jjHHHH....', '..jjjHHHHHH...', '.HjjHHHHHHHHh.', '.HHHHHHHHHHHhh',
    'HHHHHHHHHHHHhh', 'HHHHhHHhHHHHhh', 'Hh..h.....Hhh.', 'h..........h..',
    '............hh', '............Hh', '............hh',
  ],
  slick: [
    '....jjHHHH....', '..jjjHHHHHH...', '.HjjHHHHHHHHh.', '.HjHHHHHHHHHhh',
    'HHhHHhHHhHHHhh', 'Hh..........hh', 'h...........h.',
  ],
};
const back = {
  short: [
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHhhh', '.HHHHHHHHHHhh.', '.hHHHHHHHHhhh.',
    '..hhhhhhhhhh..', '....ssssss....',
  ],
  messy: [
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHhhh', '.HHHHHHHHHHhh.', 'hHHHHHHHHHhhh.',
    '..hhhhhhhhh.h.', '....ssssss....',
  ],
  bob: [
    'HHjHHHHHHHHHhh', 'HHjHHHHHHHHHhh', 'HHHHHHHHHHHHhh', 'HHHHHHHHHHHhhh',
    '.hHHHHHHHHhhhh', '..hhhhhhhhhh..',
  ],
  long: [
    'HHjHHHHHHHHHhh', 'HHjHHHHHHHHHhh', 'HHjHHHHHHHHHhh', 'HHjHHHHHHHHHhh',
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHHhh', 'HHHHHHHHHHHhhh', '.HHHHHHHHHhhh.',
    '.hHHhHHhHHhhh.',
  ],
  pony: [
    'HHHHHHRRHHHHhh', 'HHHHHHRRHHHHhh', '.HHHHjHHHHHhh.', '.hhhHjHHHhhhh.',
    '..hhHjHHhhhh..', '....HHHhhh....', '....HHHhh.....', '.....HHhh.....',
    '......hh......',
  ],
  bun: [
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHhhh', '.HHHHHHHHHHhh.', '.hHHHHHHHHhhh.',
    '..hhhhhhhhhh..', '....ssssss....',
  ],
  buzz: [
    '.hHHHHHHHHhhh.', 'shHHHHHHHHhhhs', '.hhhhhhhhhhhh.', '..hhhhhhhhhh..',
    '...SSSSSSss...', '....ssssss....',
  ],
  twoblock: [
    '.hhhhhhhhhhhh.', 'shhHHHHHHHhhhs', '.hhhhhhhhhhhh.', '..hhhhhhhhhh..',
    '...SSSSSSss...', '....ssssss....',
  ],
  center: [
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHHhh', 'hHHHHHHHHHHhhh', '.hHHHHHHHHhhh.',
    '..hhhhhhhhhh..', '....ssssss....',
  ],
  side: [
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHhhh', '.HHHHHHHHHHhh.', '.hHHHHHHHHhhh.',
    '..hhhhhhhhhh..', '....ssssss....',
  ],
  mash: [
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHhhh', '.hHHHHHHHHhhh.', '..hhhhhhhhhh..',
    '...SSSSSSss...', '....ssssss....',
  ],
  wolf: [
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHhhh', 'hHHHHHHHHHHhhh', 'HHHHHHHHHHHhhh',
    '.HHHHHHHHHHhh.', '..HHHHHHHHhh..', '...HHhHHHhh...',
  ],
  braid: [
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHhhh', '.HHHHHHHHHHhh.', '.hHHHHHHHHhhh.',
    '..hhhHHHhhhh..', '.....RRRR.....', '.....jHh......', '.....hHh......',
    '.....Hhh......', '......RR......',
  ],
  halfup: [
    'HHHHHHRRHHHHhh', 'HHHHHHRRHHHHhh', 'HHHHHjHHHHHHhh', 'HHjHHjHHHHHHhh',
    'HHjHHHHHHHHHhh', 'HHHHHHHHHHHHhh', 'HHHHHHHHHHHhhh', '.HHHHHHHHHhhh.',
    '.hHHhHHhHHhhh.',
  ],
  hime: [
    'HHjHHHHHHHHHhh', 'HHjHHHHHHHHHhh', 'HHjHHHHHHHHHhh', 'HHjHHHHHHHHHhh',
    'HHjHHHHHHHHHhh', 'HHHHHHHHHHHHhh', 'HHHHHHHHHHHHhh', 'hhhhhhhhhhhhhh',
  ],
  curly: [
    'HHhHHHHHHhHHhh', 'HHHHHHhHHHHHhh', 'hHHhHHHHHHHHhh', 'HHHHHHHHhHHHhh',
    '.hhHHHHHHHhhh.', '..hHHhhhHHhh..',
  ],
  spiky: [
    'HHHHHHHHHHHHhh', '.HHHHHHHHHHhh.', '.HHHHHHHHHhhh.', '..hHHHHHHhhh..',
    '...hhhhhhhh...', '....ssssss....',
  ],
  pixie: [
    '.HHHHHHHHHHHh.', '.HHHHHHHHHHhh.', '.hHHHHHHHHhhh.', '..hhhhhhhhhh..',
    '...SSSSSSss...', '....ssssss....',
  ],
  lowbun: [
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHhhh', '.HHHjHHHHHHhh.', '.hhjHHHHHHhhh.',
    '..hHHHHHHhhh..', '...hHHHHhhh...', '....hhhhhh....',
  ],
  slick: [
    'HHHHHHHHHHHHhh', 'HHHHHHHHHHHhhh', '.HHHHHHHHHHhh.', '.hHHHHHHHHhhh.',
    '..hhhhhhhhhh..', '....ssssss....',
  ],
};
const widen = (rows, n) => rows.map(row => '.'.repeat(n) + row + '.'.repeat(n));
const mark = (rows, marks) => {
  const out = rows.map(row => [...row]);
  for (const [y, x, pixels] of marks) {
    while (out.length <= y) out.push(Array(out[0].length).fill('.'));
    for (let i = 0; i < pixels.length; i++) if (pixels[i] !== '.') out[y][x + i] = pixels[i];
  }
  return out.map(row => row.join(''));
};
const specs = Object.fromEntries(Object.keys(cap).map(id => [id, {
  y: id === 'bun' ? -3 : id === 'halfup' ? -1 : 0,
  // Back hair has the same crown as the front, then a deliberate nape/length.
  f: cap[id], b: [...cap[id].slice(0, id === 'bun' ? 9 : id === 'halfup' ? 7 : 6).map(row => row.replace(/S/g, 'H')), ...back[id]],
}]));
// Twin tails are connected to the crown by two little warm-coloured bands.
specs.twin = {
  x: -3, y: 0,
  f: mark(widen(cap.short, 3), [[2, 1, 'jHh'], [2, 16, 'Hhh'], [3, 0, 'jHHh'], [3, 16, 'HHhh'], [4, 0, 'HHhRR'], [4, 15, 'RRHhh'], [5, 0, 'HHh'], [5, 17, 'Hhh'], [6, 0, 'Hjh'], [6, 17, 'Hhh'], [7, 0, 'Hjh'], [7, 17, 'Hhh'], [8, 0, 'HHh'], [8, 17, 'Hhh'], [9, 1, 'Hh'], [9, 17, 'hh'], [10, 1, 'hh'], [10, 18, 'h']]),
  b: mark(widen([...cap.short.slice(0, 6), ...back.short], 3), [[2, 1, 'jHh'], [2, 16, 'Hhh'], [3, 0, 'jHHh'], [3, 16, 'HHhh'], [4, 0, 'HHhRR'], [4, 15, 'RRHhh'], [5, 0, 'HHh'], [5, 17, 'Hhh'], [6, 0, 'Hjh'], [6, 17, 'Hhh'], [7, 0, 'Hjh'], [7, 17, 'Hhh'], [8, 0, 'HHh'], [8, 17, 'Hhh'], [9, 1, 'Hh'], [9, 17, 'hh'], [10, 1, 'hh'], [10, 18, 'h']]),
};
specs.sidepony = {
  x: -2, y: 0,
  f: mark(widen(cap.side, 2), [[4, 14, 'RR'], [5, 14, 'jHHh'], [6, 14, 'jHHh'], [7, 14, 'HHhh'], [8, 14, 'HHhh'], [9, 14, 'Hhhh'], [10, 15, 'Hhh'], [11, 15, 'hh'], [12, 15, 'h']]),
  b: mark(widen([...cap.side.slice(0, 6), ...back.side], 2), [[4, 14, 'RR'], [5, 14, 'jHHh'], [6, 14, 'jHHh'], [7, 14, 'HHhh'], [8, 14, 'HHhh'], [9, 14, 'Hhhh'], [10, 15, 'Hhh'], [11, 15, 'hh'], [12, 15, 'h']]),
};
specs.wave = {
  x: -1, y: 0,
  f: [
    '.....jjHHHH.....', '...jjjHHHHHH....', '..HjjHHHHHHHHh..', '.HHHHHHHHHHHHhh.',
    '.HHHHHHHHHHHHhh.', 'HHHHhHHHHhHHHhhh', 'HHh..h....hHHhhh', '.Hh.........Hhh.',
    '.Hh.........Hhh.', 'HjHh........HHhh', 'HHhh........Hhhh', '.Hh.........Hhh.',
    '.Hjh........Hhh.', 'HHhh........HHhh', '.hhh........hhh.', '..hh........hh..',
  ],
  b: [
    '.....jjHHHH.....', '...jjjHHHHHH....', '..HjjHHHHHHHHh..', '.HHHHHHHHHHHHhh.',
    '.HHHHHHHHHHHHhh.', 'HHHHHHHHHHHHHhhh', 'HHjHHHHHHHHHHhhh', '.HjHHHHHHHHHHhh.',
    '.HHHHHHHHHHHHhh.', 'HjHHHHHHHHHHHHhh', 'HHHHHHHHHHHHHhhh', '.HHHHHHHHHHHHhh.',
    '.HjHHHHHHHHHHhh.', 'HHHHHHHHHHHHHHhh', '.hHHHHHHHHHhhhh.', '..hhhhhhhhhhhh..',
  ],
};
specs.afro = {
  x: -2, y: -3,
  f: [
    '.....jHH.HHH......', '...jjjHHHHHHHH....', '..jHHHHHHHHHHHh...', '.jHHHHhHHHHHHHHh..',
    '.HHjHHHHHHHHHHHhh.', 'HHHHHHHHHHHHHHHHhh', 'HHHHHHHHHHHHHHHHhh', '.HHHHHHHHHHHHHHhh.',
    '.HHHHhHHHHhHHHHhh.', 'HHHhh........HHhhh', '.Hhh.........Hhhh.', '.hhh.........hhh..',
    '..hh.........hh...',
  ],
  b: [
    '.....jHH.HHH......', '...jjjHHHHHHHH....', '..jHHHHHHHHHHHh...', '.jHHHHhHHHHHHHHh..',
    '.HHjHHHHHHHHHHHhh.', 'HHHHHHHHHHHHHHHHhh', 'HHHHHHHHHHHHHHHHhh', '.HHjHHHHHHHHHHHhh.',
    '.HHHHHHHHHHHHHHhh.', 'HHHHHHHHHHHHHHHhhh', '.HHHHHHHHHHHHHhhh.', '.hHHHHHHHHHHHHhh..',
    '..hhHHHHHHHHhhhh..', '....hhhhhhhhhh....', '......ssssss......',
  ],
};

// Added styles keep their tied shapes, crests and lengths visible from either
// direction. Bands connect each bun/tail to the crown; dots stay transparent.
const shortBack = [...cap.short.slice(0, 6), ...back.short];
const twinBuns = [
  [0, 2, 'jHH'], [0, 15, 'HHh'],
  [1, 1, 'jjHHh'], [1, 14, 'HHHhh'],
  [2, 1, 'HjHhh'], [2, 14, 'HHhhh'],
  [3, 2, 'hhRR'], [3, 14, 'RRhh'],
];
specs.doublebun = {
  x: -3, y: -2,
  f: mark(['....................', '....................', ...widen(cap.short, 3)], twinBuns),
  b: mark(['....................', '....................', ...widen(shortBack, 3)], twinBuns),
};
const lowTail = [
  [6, 1, 'jHHh'], [6, 13, 'HHhh'],
  [7, 1, 'RRh'], [7, 14, 'RRh'],
  [8, 0, 'jHHh'], [8, 14, 'HHhh'],
  [9, 0, 'HHHh'], [9, 14, 'HHhh'],
  [10, 0, 'HjHh'], [10, 14, 'HHhh'],
  [11, 0, 'HHhh'], [11, 14, 'Hhhh'],
  [12, 1, 'Hhh'], [12, 14, 'Hhh'],
  [13, 1, 'hh'], [13, 15, 'hh'],
];
const lowCrown = [
  '....jjHHHH....', '..jjjHHHHHH...', '.HjjHHhHHHHHh.', '.HHHHhSHHHHHhh',
  'HHHHhSSSHHHHhh', 'HHHhSSSSSHHHhh', 'Hhh.......HHhh', 'h..........h..',
];
specs.lowtwin = {
  x: -2, y: 0,
  f: mark(widen(lowCrown, 2), lowTail),
  b: mark(widen([...lowCrown.slice(0, 6).map(row => row.replace(/S/g, 'H')), ...back.short], 2), lowTail),
};
const twoBraids = [
  [7, 1, 'Hhh'], [7, 14, 'Hhh'],
  [8, 1, 'RR'], [8, 15, 'RR'],
  [9, 0, 'jHh'], [9, 15, 'Hhh'],
  [10, 0, 'Hhh'], [10, 15, 'hHh'],
  [11, 0, 'hHh'], [11, 15, 'Hhh'],
  [12, 0, 'jHh'], [12, 15, 'hHh'],
  [13, 0, 'Hhh'], [13, 15, 'Hhh'],
  [14, 0, 'hHh'], [14, 15, 'hHh'],
  [15, 0, 'RR'], [15, 16, 'RR'],
  [16, 0, 'hh'], [16, 16, 'hh'],
];
specs.twinbraid = {
  x: -2, y: 0,
  f: mark(widen([
    '....jjHHHH....', '..jjjHHhHHH...', '.HjjHHHhHHHHh.', '.HHHHHHhHHHHhh',
    'HHHHHHhSHHHHhh', 'HHHHHhSSSHHHhh', 'Hhhh......HHhh', 'hh.........Hhh',
  ], 2), twoBraids),
  b: mark(widen([
    '....jjHHHH....', '..jjjHHhHHH...', '.HjjHHHhHHHHh.', '.HHHHHHhHHHHhh',
    'HHHHHHHhHHHHhh', 'HHHHHHHhHHHHhh', 'HHHHHHHhHHHHhh', '.HHHHHHhHHHhh.',
    '.hHHHHHhHHhhh.', '..hhhhhhhhhh..', '...SSSSSSss...', '....ssssss....',
  ], 2), twoBraids),
};
const highTail = [
  [0, 11, 'jHHh'], [1, 11, 'jHHHh'], [2, 11, 'HHHHhh'],
  [3, 12, 'RRHHHhh'], [4, 13, 'RRHHHhh'], [5, 16, 'HHHh'],
  [6, 18, 'Hh'], [7, 18, 'Hh'], [8, 18, 'Hh'], [9, 18, 'Hh'],
  [10, 18, 'hh'], [11, 18, 'hh'], [12, 17, 'hh'], [13, 17, 'h'],
];
specs.highpony = {
  x: -3, y: -3,
  f: mark(['....................', '....................', '....................', ...widen([
    '....jjHHHH....', '..jjjHHHHHH...', '.HjjHHHHHHHHh.', '.HHHHHHHHHHHhh',
    'HHHHHHHHHHHHhh', 'HHHHhHHhHHHHhh', 'Hhh.h.....HHh.', 'h..........h..',
  ], 3)], highTail),
  b: mark(['....................', '....................', '....................', ...widen(shortBack, 3)], [
    ...highTail, [4, 11, 'RRR'], [5, 12, 'Hhh'], [6, 13, 'Hhh'], [7, 14, 'hh'],
  ]),
};
specs.pompadour = {
  y: -2,
  f: [
    '....jjHHHH....', '..jjjHHHHHH...', '.jjjHHHHHHHh..', 'jHHHHHHHHHHHh.',
    'HHHHHHHHHHHHhh', '.hHHHHHHHHHhhh', '.hhhhhhhhhhhhh', '.h..........h.',
    '.h..........h.',
  ],
  b: [
    '....jjHHHH....', '..jjjHHHHHH...', '.jjjHHHHHHHh..', 'jHHHHHHHHHHHh.',
    'HHHHHHHHHHHHhh', '.HHHHHHHHHHhhh', '.hHHHHHHHHhhhh', '.hhhhhhhhhhhh.',
    '.hhHHHHHHHhhh.', 'shhHHHHHHHhhhs', '.hhhhhhhhhhhh.', '..hhhhhhhhhh..',
    '...SSSSSSss...', '....ssssss....',
  ],
};
const bareFront = [
  '....SSSSSS....', '..SSSSSSSSss..', '.SSSSSSSSSSss.', '.SSSSSSSSSSss.',
  '.SSSSSSSSSSss.', '.SSSSSSSSSSss.',
];
const bareBack = [
  ...bareFront, 'sSSSSSSSSSSSss', 'sSSSSSSSSSSSss', '.SSSSSSSSSSss.',
  '..SSSSSSSSss..', '...SSSSSSss...', '....ssssss....',
];
specs.mohawk = {
  y: -3,
  f: mark(['..............', '..............', '..............', ...bareFront], [
    [0, 6, 'jHh'], [1, 5, 'jjHHh'], [2, 5, 'jHHHh'], [3, 5, 'jHHHh'],
    [4, 5, 'HHHHh'], [5, 5, 'HHHhh'], [6, 6, 'HHhh'], [7, 6, 'Hhh'], [8, 6, 'hh'],
  ]),
  b: mark(['..............', '..............', '..............', ...bareBack], [
    [0, 6, 'jHh'], [1, 5, 'jjHHh'], [2, 5, 'jHHHh'], [3, 5, 'jHHHh'],
    [4, 5, 'HHHHh'], [5, 5, 'HHHhh'], [6, 5, 'HHHhh'], [7, 5, 'HHHhh'],
    [8, 6, 'HHhh'], [9, 6, 'HHhh'], [10, 6, 'Hhh'], [11, 6, 'hh'], [12, 6, 'h'],
  ]),
};
specs.asym = {
  x: -1, y: -1,
  f: [
    '.....jjHHHH.....', '...jjjHHHHHHH...', '..HjjHHHHHHHHh..', '.HHHHHHHHHHHHhh.',
    '.hHHHHHHHHHHHhhh', '..HHHHHHHHHHHhhh', '..hHHHHHHHHHHhhh', '..h..hh.....HHhh',
    '.............Hhh', '.............Hhh', '.............Hhh', '.............Hhh',
    '..............hh', '..............hh',
  ],
  b: [
    '.....jjHHHH.....', '...jjjHHHHHHH...', '..HjjHHHHHHHHh..', '.HHHHHHHHHHHHhh.',
    '.hHHHHHHHHHHHhhh', '..HHHHHHHHHHHhhh', '..HHHHHHHHHHHhhh', '..hHHHHHHHHHHHhh',
    '...hHHHHHHHHHHhh', '....hHHHHHHHHHhh', '.....hhhhhhhhHhh', '.............Hhh',
    '..............hh', '..............hh',
  ],
};
specs.outwardbob = {
  x: -2, y: 0,
  f: [
    ...widen(cap.bob.slice(0, 9), 2),
    '.jHh..........HHh.', 'HHhh..........Hhhh', 'hhh............hhh',
  ],
  b: [
    ...widen([...cap.bob.slice(0, 6), ...back.bob.slice(0, 3)], 2),
    '.jHHHHHHHHHHHHHhh.', 'HHhHHHHHHHHHHHhhhh', 'hhh.hhhhhhhhhh.hhh',
  ],
};
specs.dread = {
  x: -2, y: -1,
  f: [
    '.....jHH.HHH......', '...jjHHHHHHHHh....', '..jHHhHHhHHhHHh...', '.jHHHhHHhHHhHHHh..',
    '.HHHHhHHhHHhHHHhh.', 'HHHhHHHhHHHhHHHHhh', 'HHhhHHHhHHHhHHHhhh', 'Hjhh.Hh...Hh.HHhhh',
    'HHhh..........HHhh', 'Hjhh..........Hhhh', 'HHhh..........HHhh', 'Hhhh..........Hhhh',
    'Hjhh..........HHhh', 'HHhh..........Hhhh', '.Hhh..........HHh.', '.hh...........hh..',
    '..h...........h...',
  ],
  b: [
    '.....jHH.HHH......', '...jjHHHHHHHHh....', '..jHHhHHhHHhHHh...', '.jHHHhHHhHHhHHHh..',
    '.HHHHhHHhHHhHHHhh.', 'HHHhHHHhHHHhHHHHhh', '.jHHhHHHhHHHhHHhh.', '.jHHhHHHhHHHhHHhh.',
    '.HHHhHHHhHHHhHHhh.', '.HHHhHHHhHHHhHHhh.', '.HHHhHHHhHHHhHHhh.', '.HHHhHHHhHHHhHHhh.',
    '.HHHhHHHhHHHhHHhh.', '.hHHhHHHhHHHhHhhh.', '..HhhHHHhHHHhHhh..', '..hh.HHh.HHh.hh...',
    '.....hh..hh.......',
  ],
};
// A skinhead still has the full rounded scalp, rather than an empty hair mask
// that would crop the shared face at its forehead. Skin choice shades the dome.
specs.bald = { y: 0, f: bareFront, b: bareBack };

function compose(spec, rows, face) {
  const pad = -(spec.x || 0), width = 14 + 2 * pad, y = spec.y;
  const height = Math.max(rows.length, 12 - y);
  const grid = Array.from({ length: height }, () => Array(width).fill('.'));
  for (let v = 0; v < face.length; v++) for (let u = 0; u < 14; u++) grid[v - y][u + pad] = face[v][u];
  for (let v = 0; v < rows.length; v++) {
    if (rows[v].length !== width) throw new Error(`Hair row width ${rows[v].length}, expected ${width}: ${rows[v]}`);
    for (let u = 0; u < width; u++) if (rows[v][u] !== '.') grid[v][u] = rows[v][u];
  }
  return { y, ...(spec.x ? { x: spec.x } : {}), r: grid.map(row => row.join('')) };
}
export const HAIR_FRONT = Object.fromEntries(Object.entries(specs).map(([id, spec]) => [id, compose(spec, spec.f, FACE)]));
export const HAIR_BACK = Object.fromEntries(Object.entries(specs).map(([id, spec]) => [id, compose(spec, spec.b, NAPE)]));
// みんなのパーツの髪: data = {pad, y, f, b}(幅は14+2*pad)。[正面, 後ろ]の {y, x?, r} を返す。幅が違えば例外
export const composeHair = d => [compose({ y: d.y, x: -d.pad }, d.f, FACE), compose({ y: d.y, x: -d.pad }, d.b, NAPE)];
