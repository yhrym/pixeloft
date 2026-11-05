// @ts-check
/** @type {Record<string, import("@/plugins/types").PluginItemDef>} */
const defs = {
  "hello:counter": {
    cat: "decor",
    dirs: ["x+"], art: ["x+"], sym: true,
    props: {},
    boxes: () => [{ b: [-8, -8, 0, 8, 8, 20] }],
    // 台の手前に座る席。artのx+で書けば、ほかの向きは転置・回転で自動で作られる(x+を見ている人はSE)
    seats: () => [{ dx: -20, dy: 0, face: "SE", type: "stool" }],
  },
};
export default defs;
