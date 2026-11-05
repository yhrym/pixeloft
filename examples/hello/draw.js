const defs = {
  // 押した回数ぶん、上の面に点を並べる(9個まで)
  "hello:counter"(k, d) {
    const n = Math.min(d.state?.count ?? 0, 9);
    k.box(d.x - 8, d.y - 8, 0, d.x + 8, d.y + 8, 20, "Y", "O", "R", "W");
    k.flush();
    for (let i = 0; i < n; i++) {
      k.wp(d.x - 6 + (i % 3) * 4, d.y - 6 + Math.floor(i / 3) * 4, 20, k.cc("K"));
    }
    k.flush(false);
  },
};
export default defs;
